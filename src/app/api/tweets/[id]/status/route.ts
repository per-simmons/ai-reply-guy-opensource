import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = (await request.json()) as { status?: string };

  const validStatuses = ["new", "replied", "skipped", "archived"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = await getDb();
  await db.prepare("UPDATE tweets SET status = ? WHERE id = ?").bind(status, parseInt(id)).run();
  return NextResponse.json({ ok: true });
}
