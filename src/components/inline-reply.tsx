"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ArrowUp, Loader2, Send, Check, ShieldCheck, Undo2, Redo2 } from "lucide-react";
import type { Tweet, ReplySession, ChatMessage } from "./dashboard";

// Chrome extension types (only available when extension is installed)
declare const chrome: {
  runtime?: {
    sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
    lastError?: { message: string };
  };
};

interface InlineReplyProps {
  tweet: Tweet;
  session: ReplySession | undefined;
  updateSession: (updates: Partial<ReplySession>) => void;
  onDismiss: () => void;
  onSent: () => void;
}

export function InlineReply({ tweet, session, updateSession, onDismiss, onSent }: InlineReplyProps) {
  const [explanation, setExplanation] = useState<string>(session?.explanation || "");
  const [loadingExplain, setLoadingExplain] = useState(!session?.explanation);
  const [draft, setDraft] = useState(session?.draft || "");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(session?.chatMessages || []);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [approved, setApproved] = useState(session?.approved || false);
  const [replyStatus, setReplyStatus] = useState("");
  const [draftHistory, setDraftHistory] = useState<string[]>(session?.draft ? [session.draft] : []);
  const [historyIndex, setHistoryIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  function pushDraftHistory(newDraft: string) {
    setDraftHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, newDraft];
    });
    setHistoryIndex((prev) => prev + 1);
  }

  function undo() {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    const prev = draftHistory[newIndex];
    setDraft(prev);
    setApproved(false);
    syncSession({ draft: prev, approved: false });
  }

  function redo() {
    if (historyIndex >= draftHistory.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    const next = draftHistory[newIndex];
    setDraft(next);
    setApproved(false);
    syncSession({ draft: next, approved: false });
  }

  // Sync local state back to session whenever it changes
  const syncSession = useCallback((updates: Partial<ReplySession>) => {
    updateSession(updates);
  }, [updateSession]);

  // Fetch explanation only if no session exists
  useEffect(() => {
    if (session?.explanation) {
      // Already have session data, skip fetch
      return;
    }
    setLoadingExplain(true);
    fetch("/api/replies/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tweetId: tweet.id }),
    })
      .then((r) => r.json() as Promise<{ explanation?: string; draft?: string }>)
      .then((d) => {
        const exp = d.explanation || "";
        const dr = d.draft || "";
        setExplanation(exp);
        if (dr) {
          setDraft(dr);
          pushDraftHistory(dr);
        }
        syncSession({ explanation: exp, draft: dr || draft });
      })
      .catch(() => {
        setExplanation("Could not analyze.");
        syncSession({ explanation: "Could not analyze." });
      })
      .finally(() => setLoadingExplain(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweet.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  function handleDraftChange(newDraft: string) {
    setDraft(newDraft);
    // Un-approve if draft changes after approval
    if (approved) {
      setApproved(false);
      syncSession({ draft: newDraft, approved: false });
    } else {
      syncSession({ draft: newDraft });
    }
  }

  function handleApprove() {
    setApproved(true);
    syncSession({ approved: true });
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: msg }];
    setChatMessages(newMessages);
    syncSession({ chatMessages: newMessages });
    setChatLoading(true);
    try {
      const res = await fetch("/api/replies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tweetId: tweet.id,
          message: msg,
          currentDraft: draft,
          history: chatMessages,
        }),
      });
      const data = (await res.json()) as { reply?: string; updatedDraft?: string | null };
      if (data.reply) {
        const withReply: ChatMessage[] = [...newMessages, { role: "assistant", content: data.reply }];
        setChatMessages(withReply);
        syncSession({ chatMessages: withReply });
      }
      if (data.updatedDraft) {
        setDraft(data.updatedDraft);
        pushDraftHistory(data.updatedDraft);
        setApproved(false);
        syncSession({ draft: data.updatedDraft, approved: false });
      }
    } finally {
      setChatLoading(false);
    }
  }

  const tweetUrl = `https://x.com/${tweet.author_handle}/status/${tweet.twitter_tweet_id}`;

  const EXTENSION_ID = "YOUR_CHROME_EXTENSION_ID";

  async function postReply() {
    if (!draft.trim() || draft.length > 280 || sending || !approved) return;
    setSending(true);
    setReplyStatus("Sending via extension...");

    try {
      // Try Chrome extension first
      let extensionSuccess = false;
      if (typeof chrome !== "undefined" && chrome?.runtime && EXTENSION_ID) {
        try {
          const result = await new Promise<{ success: boolean; error?: string }>((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (chrome.runtime as any).sendMessage(EXTENSION_ID, {
              action: "postReply",
              tweetUrl,
              replyText: draft,
            }, (response: { success: boolean; error?: string } | undefined) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const rt = chrome.runtime as any;
              if (rt.lastError) {
                reject(new Error(rt.lastError.message));
              } else {
                resolve(response || { success: false, error: "No response" });
              }
            });
          });
          extensionSuccess = result.success;
          if (!extensionSuccess) {
            setReplyStatus(`Extension error: ${result.error}. Trying clipboard fallback...`);
          }
        } catch {
          setReplyStatus("Extension not found. Using clipboard fallback...");
        }
      }

      if (extensionSuccess) {
        // Confirm in DB
        await fetch("/api/replies/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tweetId: tweet.id, replyText: draft }),
        });
        setSent(true);
        setReplyStatus("Reply sent!");
      } else {
        // Fallback: copy to clipboard + open tweet
        await navigator.clipboard.writeText(draft);
        window.open(tweetUrl, "_blank");
        setSent(true);
        setReplyStatus("Copied to clipboard! Paste your reply on X.");
      }

      // Fire background analysis (non-blocking)
      fetch("/api/replies/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tweetId: tweet.id,
          tweetText: tweet.text,
          authorHandle: tweet.author_handle,
          finalDraft: draft,
          chatMessages,
        }),
      }).catch(() => {});

      setTimeout(() => onSent(), 2000);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="w-full max-h-[400px] overflow-y-auto border border-border rounded-lg bg-background [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border sticky top-0 bg-background z-10">
        <div className="flex items-center gap-1.5 min-w-0">
          {tweet.author_avatar_url ? (
            <img src={tweet.author_avatar_url} alt="" className="w-4 h-4 rounded-full shrink-0" />
          ) : (
            <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground shrink-0">
              {tweet.author_handle[0]?.toUpperCase()}
            </div>
          )}
          <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-muted-foreground hover:text-blue-400 hover:underline truncate" onClick={(e) => e.stopPropagation()}>@{tweet.author_handle}</a>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Context / explanation */}
      <div className="px-3 py-2 border-b border-border/50">
        {loadingExplain ? (
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Analyzing...
          </div>
        ) : (
          <div>
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-0.5">
              Context
            </div>
            <p className="text-[13px] leading-[1.4] text-foreground/80">{explanation}</p>
          </div>
        )}
      </div>

      {/* Chat messages */}
      {chatMessages.length > 0 && (
        <div className="px-3 py-2 space-y-2 border-b border-border/50">
          {chatMessages.map((msg, i) => (
            <div key={i}>
              <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest mb-0.5">
                {msg.role === "user" ? "You" : "AI"}
              </div>
              <p className="text-[13px] leading-[1.4] text-foreground/80">{msg.content}</p>
            </div>
          ))}
          {chatLoading && (
            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {/* Draft textarea + Approve/Reply buttons */}
      {!sent && (
        <div className="px-3 py-2 border-b border-border/50">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">
              Draft reply
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); undo(); }}
                disabled={historyIndex <= 0}
                className="p-1 rounded text-muted-foreground/40 hover:text-foreground disabled:opacity-20 transition-colors"
                title="Undo"
              >
                <Undo2 className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); redo(); }}
                disabled={historyIndex >= draftHistory.length - 1}
                className="p-1 rounded text-muted-foreground/40 hover:text-foreground disabled:opacity-20 transition-colors"
                title="Redo"
              >
                <Redo2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Your reply..."
            rows={2}
            readOnly={approved}
            className={`w-full text-[13px] p-2 rounded-md border border-border resize-none focus:outline-none focus:ring-1 focus:ring-ring/50 leading-[1.4] ${
              approved ? "bg-green-500/5 border-green-500/30 text-foreground/90" : "bg-muted/20"
            }`}
            maxLength={280}
          />
          <div className="flex items-center justify-between mt-1">
            <span
              className={`text-[10px] tabular-nums ${
                draft.length > 280 ? "text-red-400" : "text-muted-foreground/40"
              }`}
            >
              {draft.length}/280
            </span>
            <div className="flex items-center gap-1.5">
              {!approved && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleApprove(); }}
                  disabled={!draft.trim() || draft.length > 280}
                  className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full border border-green-500/40 text-green-400 hover:bg-green-500/10 disabled:opacity-20 transition-all"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Approve
                </button>
              )}
              {approved && (
                <span className="flex items-center gap-1 text-[10px] text-green-400 mr-1">
                  <ShieldCheck className="h-3 w-3" /> Approved
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); postReply(); }}
                disabled={sending || !draft.trim() || draft.length > 280 || !approved}
                className="flex items-center gap-1 text-[12px] px-2.5 py-1 rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-20 transition-all"
              >
                {sending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Reply
              </button>
            </div>
          </div>
        </div>
      )}

      {sent && (
        <div className="px-3 py-3 flex items-center justify-center gap-2 text-[12px] text-muted-foreground border-b border-border/50">
          <Check className="h-3.5 w-3.5" /> {replyStatus || "Reply sent"}
        </div>
      )}

      {!sent && replyStatus && (
        <div className="px-3 py-1 text-[11px] text-muted-foreground/60 border-b border-border/50">
          {replyStatus}
        </div>
      )}

      {/* Chat input */}
      <div className="px-3 py-2 sticky bottom-0 bg-background">
        <div className="flex items-center gap-1.5">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                sendChat();
              }
            }}
            placeholder="Refine the draft..."
            className="flex-1 text-[13px] px-2.5 py-1.5 rounded-full bg-muted/20 border border-border focus:outline-none focus:ring-1 focus:ring-ring/50 placeholder:text-muted-foreground/40"
          />
          <button
            onClick={(e) => { e.stopPropagation(); sendChat(); }}
            disabled={chatLoading || !chatInput.trim()}
            className="p-1.5 rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-20 transition-all"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
