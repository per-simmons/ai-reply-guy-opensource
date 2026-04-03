"use client";

import { useState, useRef, useCallback } from "react";
import { TweetCard } from "./tweet-card";
import { RefreshCw, Loader2 } from "lucide-react";
import type { Tweet, ReplySession } from "./dashboard";

interface FeedProps {
  tweets: Tweet[];
  loading: boolean;
  openComments: Set<number>;
  sessions: Map<number, ReplySession>;
  updateSession: (tweetId: number, updates: Partial<ReplySession>) => void;
  onToggle: (id: number) => void;
  onDismiss: (id: number) => void;
  onSkip: (tweetId: number) => void;
  onSent: (tweetId: number) => void;
  onRefresh: () => void;
}

export function Feed({ tweets, loading, openComments, sessions, updateSession, onToggle, onDismiss, onSkip, onSent, onRefresh }: FeedProps) {
  const [feedWidth, setFeedWidth] = useState(550);
  const [replyWidth, setReplyWidth] = useState(450);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const makeDragHandler = useCallback((setter: (w: number) => void, getCurrentWidth: () => number, min: number, max: number) => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = getCurrentWidth();

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = ev.clientX - startX;
        setter(Math.max(min, Math.min(startWidth + delta, max)));
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleFeedResize = useCallback((e: React.MouseEvent) => {
    makeDragHandler(setFeedWidth, () => feedWidth, 350, window.innerWidth - 68 - replyWidth - 50)(e);
  }, [feedWidth, replyWidth, makeDragHandler]);

  const handleReplyResize = useCallback((e: React.MouseEvent) => {
    // Reply right-edge drag: dragging right makes it wider
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = replyWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - startX;
      setReplyWidth(Math.max(300, Math.min(startWidth + delta, window.innerWidth - 68 - feedWidth - 50)));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [replyWidth, feedWidth]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col flex-1 min-w-0 h-full"
      style={{ "--feed-width": `${feedWidth}px`, "--reply-width": `${replyWidth}px` } as React.CSSProperties}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-[13px] text-muted-foreground">{tweets.length} posts</span>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Content area with full-height resize divider */}
      <div className="flex-1 relative min-h-0">
        {/* Left divider — between feed and reply columns */}
        <div
          onMouseDown={handleFeedResize}
          className="absolute top-0 bottom-0 z-10 w-[5px] cursor-col-resize group"
          style={{ left: `${feedWidth}px`, transform: "translateX(-50%)" }}
        >
          <div className="w-[1px] h-full bg-border mx-auto group-hover:w-[3px] group-hover:bg-blue-400/40 group-active:bg-blue-400/60 transition-all" />
        </div>

        {/* Right divider — right edge of reply column */}
        <div
          onMouseDown={handleReplyResize}
          className="absolute top-0 bottom-0 z-10 w-[5px] cursor-col-resize group"
          style={{ left: `${feedWidth + replyWidth}px`, transform: "translateX(-50%)" }}
        >
          <div className="w-[1px] h-full bg-border mx-auto group-hover:w-[3px] group-hover:bg-blue-400/40 group-active:bg-blue-400/60 transition-all" />
        </div>

        {/* Scrollable feed + reply area */}
        <div className="h-full overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && tweets.length === 0 && (
            <div className="px-4 py-16 text-center text-[15px] text-muted-foreground">
              No new posts.
            </div>
          )}

          {!loading &&
            tweets.map((tweet) => (
              <TweetCard
                key={tweet.id}
                tweet={tweet}
                isOpen={openComments.has(tweet.id)}
                session={sessions.get(tweet.id)}
                updateSession={(updates) => updateSession(tweet.id, updates)}
                onToggle={() => onToggle(tweet.id)}
                onDismiss={() => onDismiss(tweet.id)}
                onSkip={() => onSkip(tweet.id)}
                onSent={() => onSent(tweet.id)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
