import { NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { TwitterClient } from "@/lib/twitter";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface PollState {
  last_tweet_id: string | null;
  last_polled_at: number | null;
}

export async function POST() {
  const { env } = await getCloudflareContext();
  const listId = env.X_LIST_ID;
  if (!listId) return NextResponse.json({ error: "Missing X_LIST_ID" }, { status: 500 });

  const client = new TwitterClient({
    consumerKey: env.X_CONSUMER_KEY,
    consumerSecret: env.X_CONSUMER_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET,
  });

  const db = await getDb();
  const pollState = await dbGet<PollState>(db, "SELECT last_tweet_id, last_polled_at FROM poll_state WHERE id = 1");

  const result = await client.getListTweets(listId, pollState?.last_tweet_id);

  if (!result.data || result.data.length === 0) {
    await db.prepare("UPDATE poll_state SET last_polled_at = unixepoch() WHERE id = 1").run();
    return NextResponse.json({ newTweets: 0 });
  }

  // Build lookup maps
  const userMap = new Map<string, { name: string; username: string; profile_image_url?: string }>();
  if (result.includes?.users) {
    for (const user of result.includes.users) userMap.set(user.id, user);
  }

  // SSRF guard: media URLs get forwarded to your Claude/vision server, which
  // will fetch them. Only accept URLs on Twitter's CDN domains so a
  // hijacked / malformed X API response can't aim our backend at internal
  // IPs, file://, etc.
  const isTwitterMediaUrl = (u: string | undefined): u is string => {
    if (!u) return false;
    try {
      const h = new URL(u).hostname;
      return (
        h === "pbs.twimg.com" ||
        h === "video.twimg.com" ||
        h.endsWith(".twimg.com")
      );
    } catch {
      return false;
    }
  };

  const mediaMap = new Map<string, { url: string; type: string; preview_image_url?: string; videoUrl?: string }>();
  if (result.includes?.media) {
    for (const media of result.includes.media) {
      const rawUrl = media.url || media.preview_image_url;
      const url = isTwitterMediaUrl(rawUrl) ? rawUrl : undefined;
      // Extract best quality video URL from variants
      let videoUrl: string | undefined;
      if (media.type === "video" && media.variants) {
        const mp4s = media.variants
          .filter((v) => v.content_type === "video/mp4" && v.bit_rate && isTwitterMediaUrl(v.url))
          .sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
        videoUrl = mp4s[0]?.url;
      }
      if (url) {
        mediaMap.set(media.media_key, {
          url,
          type: media.type,
          preview_image_url: isTwitterMediaUrl(media.preview_image_url) ? media.preview_image_url : undefined,
          videoUrl,
        });
      }
    }
  }

  // Build quoted tweet map
  const quotedTweetMap = new Map<string, { id: string; text: string; author_name: string; author_handle: string; author_avatar_url?: string; media_urls: string[] }>();
  if (result.includes?.tweets) {
    for (const qt of result.includes.tweets) {
      const author = userMap.get(qt.author_id);
      const qtMediaUrls: string[] = [];
      if (qt.attachments?.media_keys) {
        for (const key of qt.attachments.media_keys) {
          const m = mediaMap.get(key);
          if (m) qtMediaUrls.push(m.url);
        }
      }
      quotedTweetMap.set(qt.id, {
        id: qt.id,
        text: qt.text,
        author_name: author?.name || "Unknown",
        author_handle: author?.username || "unknown",
        author_avatar_url: author?.profile_image_url,
        media_urls: qtMediaUrls,
      });
    }
  }

  let inserted = 0;
  for (const tweet of result.data) {
    const author = userMap.get(tweet.author_id);
    const createdAtUnix = Math.floor(new Date(tweet.created_at).getTime() / 1000);

    // Skip retweets and quote tweets -- only keep original posts
    if (tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
      continue;
    }
    // Also skip if text starts with "RT @" (retweet indicator)
    if (tweet.text.startsWith("RT @")) {
      continue;
    }

    // Use note_tweet for full text (tweets >280 chars), fall back to regular text
    const fullText = tweet.note_tweet?.text || tweet.text;
    const entities = tweet.note_tweet?.entities || tweet.entities;

    // Resolve t.co URLs to actual URLs using entities
    let resolvedText = fullText;
    if (entities?.urls) {
      // Sort by start position descending so replacements don't shift indices
      const sortedUrls = [...entities.urls].sort((a, b) => b.start - a.start);
      for (const u of sortedUrls) {
        // Skip pic.twitter.com URLs (media) -- they just clutter the text
        if (u.display_url.startsWith("pic.twitter.com") || u.display_url.startsWith("pic.x.com")) {
          resolvedText = resolvedText.slice(0, u.start) + resolvedText.slice(u.end);
        } else {
          resolvedText = resolvedText.slice(0, u.start) + u.expanded_url + resolvedText.slice(u.end);
        }
      }
      resolvedText = resolvedText.trim();
    }

    // Get media URLs and video URL for this tweet
    const mediaUrls: string[] = [];
    let videoUrl: string | null = null;
    if (tweet.attachments?.media_keys) {
      for (const key of tweet.attachments.media_keys) {
        const m = mediaMap.get(key);
        if (m) {
          mediaUrls.push(m.url);
          if (m.videoUrl) videoUrl = m.videoUrl;
        }
      }
    }

    // Get quote tweet if any
    let quoteTweetJson: string | null = null;
    if (tweet.referenced_tweets) {
      const quoted = tweet.referenced_tweets.find((r) => r.type === "quoted");
      if (quoted) {
        const qt = quotedTweetMap.get(quoted.id);
        if (qt) quoteTweetJson = JSON.stringify(qt);
      }
    }

    try {
      await db
        .prepare(
          `INSERT OR IGNORE INTO tweets
           (twitter_tweet_id, author_twitter_id, author_handle, author_name, author_avatar_url,
            text, conversation_id, in_reply_to_tweet_id,
            like_count, retweet_count, reply_count, impression_count,
            media_urls, quote_tweet, video_url, created_at_twitter)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          tweet.id, tweet.author_id,
          author?.username || "unknown", author?.name || null, author?.profile_image_url || null,
          resolvedText, tweet.conversation_id || null, tweet.in_reply_to_user_id || null,
          tweet.public_metrics?.like_count || 0, tweet.public_metrics?.retweet_count || 0,
          tweet.public_metrics?.reply_count || 0, tweet.public_metrics?.impression_count || 0,
          mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
          quoteTweetJson,
          videoUrl,
          createdAtUnix
        )
        .run();
      inserted++;
    } catch (err) {
      console.error("Failed to insert tweet:", tweet.id, err);
    }
  }

  if (result.meta?.newest_id) {
    await db.prepare("UPDATE poll_state SET last_tweet_id = ?, last_polled_at = unixepoch() WHERE id = 1").bind(result.meta.newest_id).run();
  }

  return NextResponse.json({ newTweets: inserted });
}
