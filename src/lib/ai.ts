interface ReplyContext {
  tweetText: string;
  authorHandle: string;
  authorName?: string;
  threadContext?: string;
  imageDescription?: string;
  quoteTweetContext?: string;
  userPersona: string;
  tonePreference: string;
  replyExamples: string[];
}

interface ReplyOption {
  type: "insightful" | "witty" | "question";
  text: string;
}

export async function generateReplies(
  claudeServerUrl: string,
  claudeServerApiToken: string,
  context: ReplyContext
): Promise<ReplyOption[]> {
  const examplesBlock =
    context.replyExamples.length > 0
      ? `\nExamples of how I write:\n${context.replyExamples.map((e, i) => `${i + 1}. "${e}"`).join("\n")}`
      : "";

  const threadBlock = context.threadContext ? `\nThread context:\n${context.threadContext}` : "";
  const imageBlock = context.imageDescription ? `\n\n[Images in this tweet: ${context.imageDescription}]` : "";
  const quoteBlock = context.quoteTweetContext ? `\n\n[Quoted tweet: ${context.quoteTweetContext}]` : "";

  const prompt = `You are helping me draft Twitter/X replies. Generate exactly 3 reply options.

My style/persona: ${context.userPersona || "Thoughtful and genuine"}
Tone: ${context.tonePreference || "professional"}${examplesBlock}

Tweet by @${context.authorHandle}${context.authorName ? ` (${context.authorName})` : ""}:
"${context.tweetText}"${imageBlock}${quoteBlock}${threadBlock}

Generate 3 reply options:
1. INSIGHTFUL - adds value, shares a perspective, or builds on the idea
2. WITTY - engaging, conversational, shows personality
3. QUESTION - asks a thoughtful follow-up that deepens the conversation

Rules:
- Each reply MUST be under 280 characters
- Be authentic, not generic
- No hashtags unless truly relevant
- No "Great point!" or similar empty affirmations
- Match the energy/register of the original tweet
- Sound human, not AI-generated
- If there are images or video, reference the visual content naturally

Respond in this exact JSON format:
[
  {"type": "insightful", "text": "..."},
  {"type": "witty", "text": "..."},
  {"type": "question", "text": "..."}
]

Return ONLY the JSON array, nothing else.`;

  const res = await fetch(`${claudeServerUrl}/api/claude`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": claudeServerApiToken,
    },
    body: JSON.stringify({
      prompt,
      model: "claude-sonnet-4-20250514",
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Claude server error: ${res.status} ${error}`);
  }

  const data = (await res.json()) as { result?: string; response?: string; text?: string };
  const responseText = data.result || data.response || data.text || "";

  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Could not parse reply options from Claude response");
  }

  return JSON.parse(jsonMatch[0]) as ReplyOption[];
}
