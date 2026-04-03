import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { TwitterClient } from "@/lib/twitter";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TweetRow { id: number; twitter_tweet_id: string; }
interface DraftRow { id: number; tweet_id: number; draft_text: string; edited_text: string | null; }

export async function POST(request: NextRequest) {
  const { env } = await getCloudflareContext();
  const body = (await request.json()) as { draftId?: number; tweetId?: number; text?: string };
  const db = await getDb();

  let replyText: string;
  let tweetId: number;

  if (body.draftId) {
    const draft = await dbGet<DraftRow>(db, "SELECT * FROM reply_drafts WHERE id = ?", body.draftId);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    replyText = body.text || draft.edited_text || draft.draft_text;
    tweetId = draft.tweet_id;
  } else if (body.tweetId && body.text) {
    replyText = body.text;
    tweetId = body.tweetId;
  } else {
    return NextResponse.json({ error: "tweetId + text or draftId required" }, { status: 400 });
  }

  const tweet = await dbGet<TweetRow>(db, "SELECT * FROM tweets WHERE id = ?", tweetId);
  if (!tweet) return NextResponse.json({ error: "Tweet not found" }, { status: 404 });

  if (!replyText || replyText.length > 280) {
    return NextResponse.json({ error: "Reply must be 1-280 characters" }, { status: 400 });
  }

  const client = new TwitterClient({
    consumerKey: env.X_CONSUMER_KEY,
    consumerSecret: env.X_CONSUMER_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET,
  });

  let posted;
  try {
    posted = await client.postReply(replyText, tweet.twitter_tweet_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "X API error: " + message }, { status: 500 });
  }

  if (body.draftId) {
    await db.prepare(`UPDATE reply_drafts SET status = 'posted', edited_text = ?, posted_tweet_id = ?, posted_at = unixepoch() WHERE id = ?`).bind(replyText, posted.id, body.draftId).run();
  }
  await db.prepare("UPDATE tweets SET status = 'replied' WHERE id = ?").bind(tweetId).run();

  return NextResponse.json({ posted: { tweetId: posted.id, text: posted.text } });
}
