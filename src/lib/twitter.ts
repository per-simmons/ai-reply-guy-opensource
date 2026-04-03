const API_BASE = "https://api.x.com/2";

// --- OAuth 1.0a Signing ---

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  const bytes = new Uint8Array(signature);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function signRequest(
  method: string,
  url: string,
  queryParams: Record<string, string>,
  credentials: OAuthCredentials
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...oauthParams, ...queryParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const signature = await hmacSha1(signingKey, baseString);

  oauthParams["oauth_signature"] = signature;

  const authHeader = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${authHeader}`;
}

// --- Types ---

export interface OAuthCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export interface ListTweetsResponse {
  data?: Array<{
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    conversation_id?: string;
    in_reply_to_user_id?: string;
    public_metrics?: {
      like_count: number;
      retweet_count: number;
      reply_count: number;
      impression_count: number;
    };
    referenced_tweets?: Array<{
      type: "quoted" | "retweeted" | "replied_to";
      id: string;
    }>;
    note_tweet?: {
      text: string;
      entities?: {
        urls?: Array<{
          start: number;
          end: number;
          url: string;
          expanded_url: string;
          display_url: string;
        }>;
      };
    };
    entities?: {
      urls?: Array<{
        start: number;
        end: number;
        url: string;
        expanded_url: string;
        display_url: string;
      }>;
    };
    attachments?: {
      media_keys?: string[];
    };
  }>;
  includes?: {
    users?: Array<{
      id: string;
      name: string;
      username: string;
      profile_image_url?: string;
    }>;
    tweets?: Array<{
      id: string;
      text: string;
      author_id: string;
      created_at: string;
      public_metrics?: {
        like_count: number;
        retweet_count: number;
        reply_count: number;
        impression_count: number;
      };
      attachments?: {
        media_keys?: string[];
      };
    }>;
    media?: Array<{
      media_key: string;
      type: string;
      url?: string;
      preview_image_url?: string;
      width?: number;
      height?: number;
      variants?: Array<{
        bit_rate?: number;
        content_type: string;
        url: string;
      }>;
    }>;
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count: number;
  };
}

// --- Single Client (OAuth 1.0a for everything) ---

export class TwitterClient {
  constructor(private credentials: OAuthCredentials) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async get(endpoint: string): Promise<any> {
    const url = new URL(`${API_BASE}${endpoint}`);
    const queryParams: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { queryParams[k] = v; });

    const baseUrl = `${url.origin}${url.pathname}`;
    const authHeader = await signRequest("GET", baseUrl, queryParams, this.credentials);

    const res = await fetch(url.toString(), {
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Twitter API error: ${res.status} ${error}`);
    }

    return res.json();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async post(endpoint: string, body: object): Promise<any> {
    const url = `${API_BASE}${endpoint}`;
    const authHeader = await signRequest("POST", url, {}, this.credentials);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Twitter API error: ${res.status} ${error}`);
    }

    return res.json();
  }

  async getListTweets(listId: string, sinceId?: string | null, maxResults: number = 50): Promise<ListTweetsResponse> {
    let endpoint = `/lists/${listId}/tweets?max_results=${maxResults}`;
    endpoint += "&tweet.fields=created_at,public_metrics,conversation_id,in_reply_to_user_id,referenced_tweets,entities,note_tweet";
    endpoint += "&expansions=author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id";
    endpoint += "&user.fields=profile_image_url,name,username";
    endpoint += "&media.fields=url,preview_image_url,type,width,height,variants";
    if (sinceId) {
      endpoint += `&since_id=${sinceId}`;
    }
    return this.get(endpoint);
  }

  async getUserByUsername(username: string) {
    const data = await this.get(
      `/users/by/username/${username}?user.fields=profile_image_url,name`
    );
    return data.data as {
      id: string;
      name: string;
      username: string;
      profile_image_url: string;
    } | null;
  }

  async postReply(text: string, inReplyToTweetId: string) {
    const data = await this.post("/tweets", {
      text,
      reply: { in_reply_to_tweet_id: inReplyToTweetId },
    });
    return (data as { data: { id: string; text: string } }).data;
  }
}
