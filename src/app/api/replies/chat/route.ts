import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TweetRow {
  id: number;
  text: string;
  author_handle: string;
  author_name: string | null;
}

interface ProfileRow {
  ai_persona: string;
  tone_preference: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// POST - Chat about a tweet, refine reply draft
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    tweetId: number;
    message: string;
    currentDraft?: string;
    history?: ChatMessage[];
  };

  if (!body.tweetId || !body.message) {
    return NextResponse.json({ error: "tweetId and message required" }, { status: 400 });
  }

  const db = await getDb();
  const tweet = await dbGet<TweetRow>(db, "SELECT * FROM tweets WHERE id = ?", body.tweetId);
  if (!tweet) return NextResponse.json({ error: "Tweet not found" }, { status: 404 });

  const profile = await dbGet<ProfileRow>(db, "SELECT ai_persona, tone_preference FROM profile WHERE id = 1");
  const { env } = await getCloudflareContext();

  const historyBlock = (body.history || [])
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `You are my Twitter reply assistant. We're discussing this tweet:

Tweet by @${tweet.author_handle}: "${tweet.text}"

My writing style: ${profile?.ai_persona || "Direct, genuine, no fluff"}

${body.currentDraft ? `Current reply draft: "${body.currentDraft}"` : "No draft yet."}

${historyBlock ? `Previous conversation:\n${historyBlock}\n` : ""}
User: ${body.message}

Respond helpfully. If I'm asking you to change the draft, provide the updated version. If I'm asking a question about the tweet, answer it.

IMPORTANT: If the user is giving feedback about writing style (e.g. "don't do that", "more casual", "shorter", "stop using emojis"), set feedbackNote to a short note summarizing the preference. Otherwise set it to null.

Respond in this exact JSON format:
{"reply": "your conversational response here", "updatedDraft": "new draft text if changed, or null if not changing", "feedbackNote": "short style preference note, or null"}

Return ONLY the JSON object.`;

  const res = await fetch(`${env.CLAUDE_SERVER_URL}/api/claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": env.CLAUDE_SERVER_API_TOKEN,
    },
    body: JSON.stringify({ prompt, model: "claude-sonnet-4-20250514" }),
  });

  if (!res.ok) {
    return NextResponse.json({ reply: "Sorry, couldn't process that.", updatedDraft: null });
  }

  const data = (await res.json()) as { result?: string; response?: string; text?: string };
  const responseText = data.result || data.response || data.text || "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { reply?: string; updatedDraft?: string | null; feedbackNote?: string | null };

      // Auto-update memory if feedback was detected
      if (parsed.feedbackNote) {
        const currentPersona = profile?.ai_persona || "";
        const timestamp = new Date().toISOString().split("T")[0];
        const updated = currentPersona + `\n- [${timestamp}] ${parsed.feedbackNote}`;
        await db.prepare("INSERT OR REPLACE INTO profile (id, twitter_user_id, twitter_handle, access_token, refresh_token, token_expires_at, ai_persona, updated_at) VALUES (1, COALESCE((SELECT twitter_user_id FROM profile WHERE id=1),''), COALESCE((SELECT twitter_handle FROM profile WHERE id=1),''), COALESCE((SELECT access_token FROM profile WHERE id=1),''), COALESCE((SELECT refresh_token FROM profile WHERE id=1),''), COALESCE((SELECT token_expires_at FROM profile WHERE id=1),0), ?, unixepoch())").bind(updated).run();
      }

      return NextResponse.json({
        reply: parsed.reply || "Done.",
        updatedDraft: parsed.updatedDraft || null,
      });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ reply: responseText.slice(0, 500), updatedDraft: null });
}
