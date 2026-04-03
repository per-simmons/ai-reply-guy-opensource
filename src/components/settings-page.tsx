"use client";

import { useState, useEffect } from "react";

export function SettingsPage() {
  const [tweetCount, setTweetCount] = useState(0);
  const [repliedCount, setRepliedCount] = useState(0);

  useEffect(() => {
    fetch("/api/tweets/feed?status=all&limit=1000")
      .then((r) => r.json() as Promise<{ tweets?: Array<{ status: string }> }>)
      .then((d) => {
        const tweets = d.tweets || [];
        setTweetCount(tweets.length);
        setRepliedCount(tweets.filter((t) => t.status === "replied").length);
      });
  }, []);

  // Realistic cost estimates:
  // We poll every 2 min = 720 polls/day. But each poll returns ~0-5 new tweets.
  // The API charges per tweet READ, not per request.
  // With since_id, we only get NEW tweets. Maybe 50-100 new tweets/day from the list.
  // So ~100 reads/day * 30 days = ~3,000 reads/month
  const monthlyReads = tweetCount > 0 ? Math.max(tweetCount * 30, 3000) : 3000;
  const readCost = (monthlyReads * 0.005).toFixed(2);
  const writeCost = (repliedCount * 0.01).toFixed(2);

  return (
    <div className="flex flex-col h-full max-w-[600px] border-r border-border">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[15px] font-bold">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* API Costs */}
        <div>
          <h3 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-3">API costs (estimated)</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/20 border border-border">
              <div>
                <div className="text-[14px]">X API reads</div>
                <div className="text-[12px] text-muted-foreground">~{monthlyReads.toLocaleString()} reads/mo @ $0.005 each</div>
                <div className="text-[11px] text-muted-foreground/60 mt-0.5">Only charges for new tweets via since_id — not per poll</div>
              </div>
              <span className="text-[14px] font-mono">${readCost}</span>
            </div>

            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/20 border border-border">
              <div>
                <div className="text-[14px]">X API replies</div>
                <div className="text-[12px] text-muted-foreground">{repliedCount} replies @ $0.01 each</div>
              </div>
              <span className="text-[14px] font-mono">${writeCost}</span>
            </div>

            <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/20 border border-border">
              <div>
                <div className="text-[14px]">Claude + Gemini</div>
                <div className="text-[12px] text-muted-foreground">Routed through Mac Mini</div>
              </div>
              <span className="text-[14px] font-mono text-muted-foreground">$0</span>
            </div>

            <div className="flex items-center justify-between py-3 px-3 rounded-lg border border-border">
              <span className="text-[14px] font-bold">Estimated total</span>
              <span className="text-[14px] font-mono font-bold">~${(parseFloat(readCost) + parseFloat(writeCost)).toFixed(2)}/mo</span>
            </div>
          </div>
        </div>

        {/* Activity */}
        <div>
          <h3 className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Activity</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="py-3 px-3 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-[20px] font-bold">{tweetCount}</div>
              <div className="text-[12px] text-muted-foreground">posts seen</div>
            </div>
            <div className="py-3 px-3 rounded-lg bg-muted/20 border border-border text-center">
              <div className="text-[20px] font-bold">{repliedCount}</div>
              <div className="text-[12px] text-muted-foreground">replied</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
