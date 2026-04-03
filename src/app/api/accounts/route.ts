import { NextRequest, NextResponse } from "next/server";
import { getDb, dbAll, dbGet } from "@/lib/db";
import { TwitterClient } from "@/lib/twitter";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface MonitoredAccount {
  id: number;
  twitter_user_id: string;
  twitter_handle: string;
  twitter_name: string | null;
  twitter_avatar_url: string | null;
  is_active: number;
}

export async function GET() {
  const db = await getDb();
  const accounts = await dbAll<MonitoredAccount>(db, "SELECT * FROM monitored_accounts ORDER BY priority DESC, created_at DESC");
  return NextResponse.json({ accounts });
}

export async function POST(request: NextRequest) {
  const { username } = (await request.json()) as { username?: string };
  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }

  const handle = username.replace("@", "").trim();
  const db = await getDb();

  const existing = await dbGet<MonitoredAccount>(db, "SELECT * FROM monitored_accounts WHERE twitter_handle = ? COLLATE NOCASE", handle);
  if (existing) return NextResponse.json({ error: "Already monitoring this account" }, { status: 409 });

  const { env } = await getCloudflareContext();
  const client = new TwitterClient({
    consumerKey: env.X_CONSUMER_KEY,
    consumerSecret: env.X_CONSUMER_SECRET,
    accessToken: env.X_ACCESS_TOKEN,
    accessTokenSecret: env.X_ACCESS_TOKEN_SECRET,
  });

  let twitterUser;
  try {
    twitterUser = await client.getUserByUsername(handle);
  } catch {
    return NextResponse.json({ error: "Could not find that user" }, { status: 404 });
  }
  if (!twitterUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await db
    .prepare("INSERT INTO monitored_accounts (twitter_user_id, twitter_handle, twitter_name, twitter_avatar_url) VALUES (?, ?, ?, ?)")
    .bind(twitterUser.id, twitterUser.username, twitterUser.name, twitterUser.profile_image_url || null)
    .run();

  return NextResponse.json({ account: twitterUser });
}

export async function DELETE(request: NextRequest) {
  const { twitter_user_id } = (await request.json()) as { twitter_user_id?: string };
  if (!twitter_user_id) return NextResponse.json({ error: "twitter_user_id required" }, { status: 400 });

  const db = await getDb();
  await db.prepare("DELETE FROM monitored_accounts WHERE twitter_user_id = ?").bind(twitter_user_id).run();
  return NextResponse.json({ ok: true });
}
