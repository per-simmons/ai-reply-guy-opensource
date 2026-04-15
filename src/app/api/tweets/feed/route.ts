import { NextRequest, NextResponse } from "next/server";
import { getDb, dbAll } from "@/lib/db";

interface TweetRow {
  id: number;
  twitter_tweet_id: string;
  author_twitter_id: string;
  author_handle: string;
  author_name: string | null;
  author_avatar_url: string | null;
  text: string;
  conversation_id: string | null;
  in_reply_to_tweet_id: string | null;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  impression_count: number;
  media_urls: string | null;
  quote_tweet: string | null;
  video_url: string | null;
  created_at_twitter: number;
  fetched_at: number;
  status: string;
}

interface DraftRow {
  id: number;
  tweet_id: number;
  draft_text: string;
  reply_type: string;
  edited_text: string | null;
  status: string;
  posted_tweet_id: string | null;
  posted_at: number | null;
  created_at: number;
}

// GET - Get tweet feed (no auth needed for reading)
export async function GET(request: NextRequest) {
  const db = await getDb();

  const { searchParams } = new URL(request.url);
  const sinceIdRaw = searchParams.get("since_id");
  const statusFilter = searchParams.get("status") || "new";
  const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

  // Whitelist status values — never interpolate user input into SQL or
  // forward arbitrary strings to a status filter.
  const validStatuses = new Set(["new", "replied", "skipped", "archived", "all"]);
  const status = validStatuses.has(statusFilter) ? statusFilter : "new";

  let query = `SELECT * FROM tweets WHERE 1=1`;
  const params: unknown[] = [];

  if (status !== "all") {
    query += " AND status = ?";
    params.push(status);
  }

  if (sinceIdRaw) {
    const sinceId = parseInt(sinceIdRaw, 10);
    if (Number.isInteger(sinceId) && sinceId > 0) {
      query += " AND id > ?";
      params.push(sinceId);
    }
  }

  query += " ORDER BY created_at_twitter DESC LIMIT ?";
  params.push(limit);

  const tweets = await dbAll<TweetRow>(db, query, ...params);

  // Get drafts for these tweets
  const tweetIds = tweets.map((t) => t.id);
  let drafts: DraftRow[] = [];
  if (tweetIds.length > 0) {
    const placeholders = tweetIds.map(() => "?").join(",");
    drafts = await dbAll<DraftRow>(
      db,
      `SELECT * FROM reply_drafts WHERE tweet_id IN (${placeholders}) ORDER BY created_at DESC`,
      ...tweetIds
    );
  }

  // Group drafts by tweet_id
  const draftsByTweet = new Map<number, DraftRow[]>();
  for (const draft of drafts) {
    const existing = draftsByTweet.get(draft.tweet_id) || [];
    existing.push(draft);
    draftsByTweet.set(draft.tweet_id, existing);
  }

  const feedItems = tweets.map((tweet) => ({
    ...tweet,
    media_urls: tweet.media_urls ? JSON.parse(tweet.media_urls) : [],
    quote_tweet: tweet.quote_tweet ? JSON.parse(tweet.quote_tweet) : null,
    drafts: draftsByTweet.get(tweet.id) || [],
  }));

  return NextResponse.json({ tweets: feedItems });
}
