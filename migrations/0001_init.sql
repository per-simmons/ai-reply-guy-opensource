-- AI Reply Guy - Initial Schema

-- User profile (single user). OAuth credentials are kept in wrangler secrets,
-- NOT in this table. Do not add token columns here — if you store OAuth tokens
-- in D1, an unauthenticated leak becomes a full account takeover.
CREATE TABLE profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ai_persona TEXT DEFAULT '',
  tone_preference TEXT DEFAULT 'professional',
  x_list_id TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Monitored accounts
CREATE TABLE monitored_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  twitter_user_id TEXT NOT NULL UNIQUE,
  twitter_handle TEXT NOT NULL,
  twitter_name TEXT,
  twitter_avatar_url TEXT,
  is_active INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at INTEGER DEFAULT (unixepoch())
);

-- Fetched tweets
CREATE TABLE tweets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  twitter_tweet_id TEXT NOT NULL UNIQUE,
  author_twitter_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_name TEXT,
  author_avatar_url TEXT,
  text TEXT NOT NULL,
  conversation_id TEXT,
  in_reply_to_tweet_id TEXT,
  like_count INTEGER DEFAULT 0,
  retweet_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  impression_count INTEGER DEFAULT 0,
  media_urls TEXT,
  created_at_twitter INTEGER,
  fetched_at INTEGER DEFAULT (unixepoch()),
  status TEXT DEFAULT 'new'
);

-- AI-generated reply drafts
CREATE TABLE reply_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id INTEGER NOT NULL REFERENCES tweets(id),
  draft_text TEXT NOT NULL,
  reply_type TEXT,
  edited_text TEXT,
  status TEXT DEFAULT 'draft',
  posted_tweet_id TEXT,
  posted_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Polling state
CREATE TABLE poll_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_tweet_id TEXT,
  last_polled_at INTEGER
);

-- User's reply examples for AI style matching
CREATE TABLE reply_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  context TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Indexes
CREATE INDEX idx_tweets_status ON tweets(status);
CREATE INDEX idx_tweets_created ON tweets(created_at_twitter DESC);
CREATE INDEX idx_tweets_author ON tweets(author_twitter_id);
CREATE INDEX idx_drafts_tweet ON reply_drafts(tweet_id);
CREATE INDEX idx_drafts_status ON reply_drafts(status);

-- Insert default poll state
INSERT INTO poll_state (id, last_tweet_id, last_polled_at) VALUES (1, NULL, NULL);
