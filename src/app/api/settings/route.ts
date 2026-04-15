import { NextRequest, NextResponse } from "next/server";
import { getDb, dbAll, dbGet } from "@/lib/db";

interface ReplyExample {
  id: number;
  text: string;
  context: string | null;
  created_at: number;
}

interface ProfileRow {
  ai_persona: string;
  tone_preference: string;
}

// GET - Get settings
export async function GET() {
  const db = await getDb();
  const profile = await dbGet<ProfileRow>(db, "SELECT ai_persona, tone_preference FROM profile WHERE id = 1");
  const examples = await dbAll<ReplyExample>(db, "SELECT * FROM reply_examples ORDER BY created_at DESC");

  return NextResponse.json({
    persona: profile?.ai_persona || "",
    tone: profile?.tone_preference || "professional",
    replyExamples: examples,
  });
}

// PATCH - Update settings
export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    persona?: string;
    tone?: string;
    addExample?: { text: string; context?: string };
    removeExampleId?: number;
  };

  const db = await getDb();

  // Ensure profile row exists
  await db.prepare("INSERT OR IGNORE INTO profile (id) VALUES (1)").run();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.persona !== undefined) {
    updates.push("ai_persona = ?");
    params.push(body.persona);
  }
  if (body.tone !== undefined) {
    updates.push("tone_preference = ?");
    params.push(body.tone);
  }

  if (updates.length > 0) {
    updates.push("updated_at = unixepoch()");
    await db.prepare(`UPDATE profile SET ${updates.join(", ")} WHERE id = 1`).bind(...params).run();
  }

  if (body.addExample) {
    await db
      .prepare("INSERT INTO reply_examples (text, context) VALUES (?, ?)")
      .bind(body.addExample.text, body.addExample.context || null)
      .run();
  }

  if (body.removeExampleId) {
    await db.prepare("DELETE FROM reply_examples WHERE id = ?").bind(body.removeExampleId).run();
  }

  return NextResponse.json({ ok: true });
}
