"use client";

import { useState, useEffect, useCallback } from "react";
import { LeftSidebar } from "./left-sidebar";
import { Feed } from "./feed";
import { SettingsPage } from "./settings-page";
import type { Page } from "./left-sidebar";

interface Draft {
  id: number;
  draft_text: string;
  reply_type: string;
  edited_text: string | null;
  status: string;
}

export interface Tweet {
  id: number;
  twitter_tweet_id: string;
  author_handle: string;
  author_name: string | null;
  author_avatar_url: string | null;
  text: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  impression_count: number;
  media_urls: string[];
  quote_tweet: { id: string; text: string; author_name: string; author_handle: string; author_avatar_url?: string; media_urls: string[] } | null;
  video_url: string | null;
  created_at_twitter: number;
  status: string;
  drafts: Draft[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ReplySession {
  explanation: string;
  draft: string;
  chatMessages: ChatMessage[];
  approved: boolean;
}

export function Dashboard() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>("home");
  const [openComments, setOpenComments] = useState<Set<number>>(new Set());
  const [sessions, setSessions] = useState<Map<number, ReplySession>>(new Map());

  const updateSession = useCallback((tweetId: number, updates: Partial<ReplySession>) => {
    setSessions((prev) => {
      const next = new Map(prev);
      const existing = next.get(tweetId) || { explanation: "", draft: "", chatMessages: [], approved: false };
      next.set(tweetId, { ...existing, ...updates });
      return next;
    });
  }, []);

  const toggleComment = useCallback((id: number) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const removeComment = useCallback((id: number) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const fetchTweets = useCallback(async () => {
    try {
      const res = await fetch("/api/tweets/feed?status=new&limit=100");
      const data = (await res.json()) as { tweets?: Tweet[] };
      if (data.tweets) setTweets(data.tweets);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTweets();
    fetch("/api/tweets/poll", { method: "POST" }).then(() => fetchTweets());
  }, [fetchTweets]);

  useEffect(() => {
    const i = setInterval(fetchTweets, 15000);
    return () => clearInterval(i);
  }, [fetchTweets]);

  useEffect(() => {
    const i = setInterval(() => {
      fetch("/api/tweets/poll", { method: "POST" }).then(() => fetchTweets());
    }, 120000);
    return () => clearInterval(i);
  }, [fetchTweets]);

  async function skipTweet(tweetId: number) {
    await fetch(`/api/tweets/${tweetId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "skipped" }),
    });
    setTweets((prev) => prev.filter((t) => t.id !== tweetId));
    removeComment(tweetId);
  }

  function onSent(tweetId: number) {
    setTweets((prev) => prev.filter((t) => t.id !== tweetId));
    removeComment(tweetId);
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left: icon sidebar */}
      <LeftSidebar page={page} onPageChange={setPage} />

      {/* Center + Right: content area */}
      <div className="flex-1 flex min-w-0">
        {page === "home" && (
          <Feed
            tweets={tweets}
            loading={loading}
            openComments={openComments}
            sessions={sessions}
            updateSession={updateSession}
            onToggle={toggleComment}
            onDismiss={removeComment}
            onSkip={skipTweet}
            onSent={onSent}
            onRefresh={() => { fetch("/api/tweets/poll", { method: "POST" }).then(() => fetchTweets()); }}
          />
        )}
        {page === "memory" && <MemoryPage />}
        {page === "styleguide" && <StyleGuidePage />}
        {page === "settings" && <SettingsPage />}
      </div>
    </div>
  );
}

function MemoryPage() {
  const [memory, setMemory] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<{ persona?: string }>)
      .then((d) => setMemory(d.persona || ""));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: memory }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full max-w-[600px] border-r border-border">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[15px] font-bold">Memory</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Feedback you give in reply chats auto-appends here. The AI references this and the Style Guide.
        </p>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <textarea
          value={memory}
          onChange={(e) => setMemory(e.target.value)}
          placeholder={"Feedback log — notes get added here automatically when you give feedback in reply chats.\n\nYou can also add notes manually."}
          className="w-full h-full min-h-[400px] text-[15px] p-4 rounded-lg bg-muted/20 border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring/50 leading-relaxed placeholder:text-muted-foreground/30"
        />
      </div>
      <div className="px-4 py-3 border-t border-border flex items-center justify-end">
        <button onClick={save} disabled={saving} className="text-[13px] px-4 py-1.5 rounded-full bg-foreground text-background hover:opacity-80 transition-all disabled:opacity-50">
          {saving ? "saving..." : saved ? "saved" : "save"}
        </button>
      </div>
    </div>
  );
}

function StyleGuidePage() {
  const [guide, setGuide] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json() as Promise<{ tone?: string }>)
      .then((d) => setGuide(d.tone || ""));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tone: guide }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="flex flex-col h-full max-w-[600px] border-r border-border">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[15px] font-bold">Style Guide</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Writing rules the AI follows. Updated automatically from Memory feedback about writing style.
        </p>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <textarea
          value={guide}
          onChange={(e) => setGuide(e.target.value)}
          placeholder={"Your reply writing rules:\n\n- Direct and concise — no fluff or pleasantries\n- Ask sharp follow-up questions on technical posts\n- Reference specific details from the post\n- Never use emojis, hashtags, or 'Great point!' type affirmations\n- Keep replies under 180 characters when possible\n- Match the energy of the original poster\n- When someone shares a project, focus on technical choices\n- Avoid sounding like AI — no 'fascinating' or 'intriguing'\n- Don't start with 'I' — vary sentence openers\n- One idea per reply, not three"}
          className="w-full h-full min-h-[400px] text-[15px] p-4 rounded-lg bg-muted/20 border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring/50 leading-relaxed placeholder:text-muted-foreground/30"
        />
      </div>
      <div className="px-4 py-3 border-t border-border flex items-center justify-end">
        <button onClick={save} disabled={saving} className="text-[13px] px-4 py-1.5 rounded-full bg-foreground text-background hover:opacity-80 transition-all disabled:opacity-50">
          {saving ? "saving..." : saved ? "saved" : "save"}
        </button>
      </div>
    </div>
  );
}
