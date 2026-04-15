import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface ProfileRow {
  ai_persona: string;
  tone_preference: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// POST - Analyze a completed reply session and extract memory/style notes
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    tweetId: number;
    tweetText: string;
    authorHandle: string;
    finalDraft: string;
    chatMessages: ChatMessage[];
  };

  if (!body.tweetId || !body.finalDraft) {
    return NextResponse.json({ error: "tweetId and finalDraft required" }, { status: 400 });
  }

  // Skip analysis if there was no chat conversation (no user feedback to extract)
  if (!body.chatMessages || body.chatMessages.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const db = await getDb();
  const profile = await dbGet<ProfileRow>(db, "SELECT ai_persona, tone_preference FROM profile WHERE id = 1");
  const { env } = await getCloudflareContext();

  const chatHistory = body.chatMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = `You are analyzing a Twitter reply session to extract preferences and style notes.

The user was drafting a reply to this tweet by @${body.authorHandle}:
"${body.tweetText}"

Chat history between user and AI assistant while refining the draft:
${chatHistory}

Final approved reply:
"${body.finalDraft}"

Current memory/persona notes:
${profile?.ai_persona || "(empty)"}

Current tone preference:
${profile?.tone_preference || "professional"}

Analyze the conversation and extract:
1. memoryNotes: An array of short notes about the user's preferences, feedback, or things they mentioned (e.g. "prefers shorter replies", "doesn't like starting with 'I'", "wants more technical depth"). Only include if the user explicitly stated a preference. Empty array if nothing notable.
2. styleRules: An array of concise writing rules derived from the feedback (e.g. "avoid emojis", "keep replies under 140 chars", "reference specific details from the post"). Only include rules the user clearly indicated through their feedback. Empty array if none.

Respond in this exact JSON format:
{"memoryNotes": ["note1", "note2"], "styleRules": ["rule1", "rule2"]}

Return ONLY the JSON object. If there's nothing notable to extract, return empty arrays.`;

  try {
    const res = await fetch(`${env.CLAUDE_SERVER_URL}/api/claude`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": env.CLAUDE_SERVER_API_TOKEN,
      },
      body: JSON.stringify({ prompt, model: "claude-sonnet-4-20250514" }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "Claude server error" });
    }

    const data = (await res.json()) as { result?: string; response?: string; text?: string };
    const responseText = data.result || data.response || data.text || "";

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ ok: false, error: "Could not parse response" });
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      memoryNotes: string[];
      styleRules: string[];
    };

    // SECURITY: do NOT auto-mutate persona/tone based on LLM extraction.
    // The chat history fed into this prompt contains attacker-controlled
    // tweet text, which could prompt-inject the LLM into emitting arbitrary
    // "memory notes" that get persisted forever. Return the proposals to the
    // client and require explicit user action to save them via /api/settings.
    return NextResponse.json({
      ok: true,
      proposedMemoryNotes: parsed.memoryNotes || [],
      proposedStyleRules: parsed.styleRules || [],
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Analysis failed" });
  }
}
