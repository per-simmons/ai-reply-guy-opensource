import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbAll } from "@/lib/db";
import { generateReplies } from "@/lib/ai";
import { describeImages, transcribeVideo } from "@/lib/vision";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TweetRow {
  id: number;
  twitter_tweet_id: string;
  author_handle: string;
  author_name: string | null;
  text: string;
  media_urls: string | null;
  quote_tweet: string | null;
  video_url: string | null;
}

interface ReplyExample {
  text: string;
  context: string | null;
}

interface ProfileRow {
  ai_persona: string;
  tone_preference: string;
}

interface QuoteTweet {
  id: string;
  text: string;
  author_name: string;
  author_handle: string;
  media_urls?: string[];
}

export async function POST(request: NextRequest) {
  const { tweetId } = (await request.json()) as { tweetId?: number };
  if (!tweetId) return NextResponse.json({ error: "tweetId required" }, { status: 400 });

  const db = await getDb();
  const tweet = await dbGet<TweetRow>(db, "SELECT * FROM tweets WHERE id = ?", tweetId);
  if (!tweet) return NextResponse.json({ error: "Tweet not found" }, { status: 404 });

  const examples = await dbAll<ReplyExample>(
    db,
    "SELECT text, context FROM reply_examples ORDER BY created_at DESC LIMIT 10"
  );
  const profile = await dbGet<ProfileRow>(db, "SELECT ai_persona, tone_preference FROM profile WHERE id = 1");
  const { env } = await getCloudflareContext();

  // Parse media and quote tweet
  const mediaUrls: string[] = tweet.media_urls ? JSON.parse(tweet.media_urls) : [];
  const quoteTweet: QuoteTweet | null = tweet.quote_tweet ? JSON.parse(tweet.quote_tweet) : null;

  // Describe images via Mac Mini vision endpoint (Gemini API)
  let imageDescription = "";
  if (mediaUrls.length > 0) {
    try {
      imageDescription = await describeImages(env.CLAUDE_SERVER_URL, env.CLAUDE_SERVER_API_TOKEN, mediaUrls, tweet.text);
    } catch (err) {
      console.error("Vision failed:", err);
    }
  }

  // Also describe quote tweet images if any
  let quoteImageDescription = "";
  if (quoteTweet?.media_urls && quoteTweet.media_urls.length > 0) {
    try {
      quoteImageDescription = await describeImages(env.CLAUDE_SERVER_URL, env.CLAUDE_SERVER_API_TOKEN, quoteTweet.media_urls, quoteTweet.text);
    } catch (err) {
      console.error("Quote tweet vision failed:", err);
    }
  }

  // Transcribe video if present
  let videoTranscript = "";
  if (tweet.video_url) {
    try {
      videoTranscript = await transcribeVideo(env.CLAUDE_SERVER_URL, env.CLAUDE_SERVER_API_TOKEN, tweet.video_url);
    } catch (err) {
      console.error("Transcription failed:", err);
    }
  }

  // Build quote tweet context
  let quoteTweetContext = "";
  if (quoteTweet) {
    quoteTweetContext = `@${quoteTweet.author_handle} (${quoteTweet.author_name}): "${quoteTweet.text}"`;
    if (quoteImageDescription) {
      quoteTweetContext += `\n[Quote tweet images: ${quoteImageDescription}]`;
    }
  }

  // Combine image + video context
  let fullImageDescription = imageDescription;
  if (videoTranscript) {
    fullImageDescription += (fullImageDescription ? "\n" : "") + `[Video transcript: ${videoTranscript}]`;
  }

  const replies = await generateReplies(
    env.CLAUDE_SERVER_URL,
    env.CLAUDE_SERVER_API_TOKEN,
    {
      tweetText: tweet.text,
      authorHandle: tweet.author_handle,
      authorName: tweet.author_name || undefined,
      imageDescription: fullImageDescription,
      quoteTweetContext,
      userPersona: profile?.ai_persona || "",
      tonePreference: profile?.tone_preference || "professional",
      replyExamples: examples.map((e) => e.text),
    }
  );

  const drafts = [];
  for (const reply of replies) {
    const result = await db
      .prepare("INSERT INTO reply_drafts (tweet_id, draft_text, reply_type) VALUES (?, ?, ?) RETURNING *")
      .bind(tweetId, reply.text, reply.type)
      .first();
    drafts.push(result);
  }

  return NextResponse.json({ drafts });
}
