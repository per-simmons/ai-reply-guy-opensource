// Routes vision/transcription requests through the Mac Mini Claude server

export async function describeImages(
  claudeServerUrl: string,
  claudeServerApiToken: string,
  imageUrls: string[],
  context?: string
): Promise<string> {
  if (imageUrls.length === 0) return "";

  const res = await fetch(`${claudeServerUrl}/api/vision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": claudeServerApiToken,
    },
    body: JSON.stringify({ image_urls: imageUrls, context: context || "" }),
  });

  if (!res.ok) return "";
  const data = (await res.json()) as { description?: string };
  return data.description || "";
}

export async function transcribeVideo(
  claudeServerUrl: string,
  claudeServerApiToken: string,
  videoUrl: string
): Promise<string> {
  if (!videoUrl) return "";

  const res = await fetch(`${claudeServerUrl}/api/transcribe-video`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": claudeServerApiToken,
    },
    body: JSON.stringify({ video_url: videoUrl }),
  });

  if (!res.ok) return "";
  const data = (await res.json()) as { transcript?: string };
  return data.transcript || "";
}
