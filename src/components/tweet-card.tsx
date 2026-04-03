"use client";

import { MessageSquare } from "lucide-react";
import { InlineReply } from "./inline-reply";
import type { Tweet, ReplySession } from "./dashboard";

interface TweetCardProps {
  tweet: Tweet;
  isOpen: boolean;
  session: ReplySession | undefined;
  updateSession: (updates: Partial<ReplySession>) => void;
  onToggle: () => void;
  onDismiss: () => void;
  onSkip: () => void;
  onSent: () => void;
}

function renderTweetText(text: string) {
  const parts = text.split(/(https?:\/\/\S+|@\w+)/g);
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      let display = part;
      try {
        const url = new URL(part);
        display = url.hostname.replace("www.", "") + (url.pathname.length > 1 ? url.pathname : "");
        if (display.length > 40) display = display.slice(0, 40) + "...";
      } catch { /* keep original */ }
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" onClick={(e) => e.stopPropagation()}>{display}</a>;
    }
    if (part.match(/^@\w+/)) {
      return <a key={i} href={`https://x.com/${part.slice(1)}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" onClick={(e) => e.stopPropagation()}>{part}</a>;
    }
    return part;
  });
}

function MediaGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className={`mt-2.5 grid gap-0.5 rounded-xl overflow-hidden ${urls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          <img src={url} alt="" className={`w-full object-cover bg-muted ${urls.length === 1 ? "max-h-[300px]" : "h-[140px]"}`} />
        </a>
      ))}
    </div>
  );
}

export function TweetCard({ tweet, isOpen, session, updateSession, onToggle, onDismiss, onSkip, onSent }: TweetCardProps) {
  const timeAgo = getTimeAgo(tweet.created_at_twitter);
  const tweetUrl = `https://x.com/${tweet.author_handle}/status/${tweet.twitter_tweet_id}`;

  return (
    <div
      className="grid border-b border-border"
      style={{ gridTemplateColumns: "var(--feed-width, 550px) var(--reply-width, 450px)" }}
    >
      {/* Left cell: tweet content (always narrow ~500px) */}
      <div
        onClick={onToggle}
        className={`px-4 py-3 cursor-pointer transition-colors ${
          isOpen ? "bg-blue-500/5 border-l-2 border-l-blue-400" : "hover:bg-muted/30"
        }`}
      >
        <div className="flex gap-3">
          <a href={`https://x.com/${tweet.author_handle}`} target="_blank" rel="noopener noreferrer" className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {tweet.author_avatar_url ? (
              <img src={tweet.author_avatar_url} alt="" className="w-10 h-10 rounded-full bg-muted" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-[13px] font-medium text-muted-foreground">
                {tweet.author_handle[0]?.toUpperCase()}
              </div>
            )}
          </a>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold truncate">{tweet.author_name || tweet.author_handle}</span>
              <span className="text-[13px] text-muted-foreground truncate">@{tweet.author_handle}</span>
              <span className="text-[13px] text-muted-foreground">·</span>
              <a href={tweetUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground hover:underline shrink-0" onClick={(e) => e.stopPropagation()}>{timeAgo}</a>
            </div>

            <p className="text-[15px] mt-0.5 whitespace-pre-wrap leading-[1.4]">
              {renderTweetText(tweet.text)}
            </p>

            <MediaGrid urls={tweet.media_urls} />

            {/* Bottom actions */}
            <div className="flex items-center gap-4 mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className={`flex items-center gap-1 text-[13px] transition-colors ${
                  isOpen ? "text-blue-400" : "text-muted-foreground/50 hover:text-blue-400"
                }`}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onSkip(); }}
                className="text-[12px] text-muted-foreground/30 hover:text-muted-foreground transition-colors ml-auto"
              >
                skip
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right cell: inline reply card or empty space */}
      <div className="p-3 flex items-start min-w-0">
        {isOpen && (
          <InlineReply
            tweet={tweet}
            session={session}
            updateSession={updateSession}
            onDismiss={onDismiss}
            onSent={onSent}
          />
        )}
      </div>
    </div>
  );
}

function getTimeAgo(unixTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixTimestamp;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(unixTimestamp * 1000).toLocaleDateString();
}
