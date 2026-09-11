export interface PostJsonResult {
  ok: boolean;
  status: number | null;
  bodySnippet: string;
}

export async function postJsonWithTimeout(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<PostJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, bodySnippet: text.slice(0, 500) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, bodySnippet: `request failed: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}
