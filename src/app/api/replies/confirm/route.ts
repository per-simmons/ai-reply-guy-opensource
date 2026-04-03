import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// POST - Confirm a reply was posted (called by client after extension succeeds)
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { tweetId: number; replyText: string };
  if (!body.tweetId) return NextResponse.json({ error: "tweetId required" }, { status: 400 });

  const db = await getDb();
  await db.prepare("UPDATE tweets SET status = 'replied' WHERE id = ?").bind(body.tweetId).run();

  // Fire background analysis (non-blocking)
  // The client will call /api/replies/analyze separately

  return NextResponse.json({ ok: true });
}
