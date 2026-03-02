const API_BASE = "/api";

export async function startGeneration(urls: string[]): Promise<{ jobId: string }> {
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error(`Failed to start generation: ${res.statusText}`);
  return res.json();
}

export async function getJobStatus(jobId: string) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to get job status: ${res.statusText}`);
  return res.json();
}

export async function getShorts() {
  const res = await fetch(`${API_BASE}/shorts`);
  if (!res.ok) throw new Error(`Failed to get shorts: ${res.statusText}`);
  return res.json();
}

export function getDownloadUrl(videoId: string, clipId: string): string {
  return `${API_BASE}/shorts/${videoId}/${clipId}`;
}
