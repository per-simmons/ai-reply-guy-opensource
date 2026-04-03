import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { describeImages } from "@/lib/vision";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TweetRow {
  id: number;
  text: string;
  author_handle: string;
  author_name: string | null;
  media_urls: string | null;
  video_url: string | null;
}

interface ProfileRow {
  ai_persona: string;
  tone_preference: string;
}

// POST - Explain a tweet + generate a draft reply
export async function POST(request: NextRequest) {
  const { tweetId } = (await request.json()) as { tweetId?: number };
  if (!tweetId) return NextResponse.json({ error: "tweetId required" }, { status: 400 });

  const db = await getDb();
  const tweet = await dbGet<TweetRow>(db, "SELECT * FROM tweets WHERE id = ?", tweetId);
  if (!tweet) return NextResponse.json({ error: "Tweet not found" }, { status: 404 });

  const profile = await dbGet<ProfileRow>(db, "SELECT ai_persona, tone_preference FROM profile WHERE id = 1");
  const { env } = await getCloudflareContext();

  // Get image description if there are images
  const mediaUrls: string[] = tweet.media_urls ? JSON.parse(tweet.media_urls) : [];
  let imageContext = "";
  if (mediaUrls.length > 0) {
    try {
      imageContext = await describeImages(env.CLAUDE_SERVER_URL, env.CLAUDE_SERVER_API_TOKEN, mediaUrls, tweet.text);
    } catch { /* skip */ }
  }

  const prompt = `You are helping me engage on Twitter/X. I'm looking at this tweet and I need two things:

1. A brief EXPLANATION of what this tweet is about, what it means, any context that would help me understand it. 2-3 sentences max. If there are images, describe what's in them.
2. A draft REPLY that matches my style.

Tweet by @${tweet.author_handle}${tweet.author_name ? ` (${tweet.author_name})` : ""}:
"${tweet.text}"
${imageContext ? `\n[Images: ${imageContext}]` : ""}

My style: ${profile?.ai_persona || "Thoughtful, direct, genuine. No fluff."}
Tone: ${profile?.tone_preference || "professional"}

Respond in this exact JSON format:
{"explanation": "...", "draft": "..."}

The explanation should help me understand the post quickly. The draft reply must be under 280 characters, sound human, and match my style. Return ONLY the JSON object.`;

  const res = await fetch(`${env.CLAUDE_SERVER_URL}/api/claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.CLAUDE_SERVER_API_TOKEN,
    },
    body: JSON.stringify({ prompt, model: "claude-sonnet-4-20250514" }),
  });

  if (!res.ok) {
    return NextResponse.json({ explanation: "Could not analyze this post.", draft: "" });
  }

  const data = (await res.json()) as { result?: string; response?: string; text?: string };
  const responseText = data.result || data.response || data.text || "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { explanation?: string; draft?: string };
      return NextResponse.json({
        explanation: parsed.explanation || "Could not explain.",
        draft: parsed.draft || "",
      });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ explanation: responseText.slice(0, 500), draft: "" });
}
