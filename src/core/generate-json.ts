import { generateText, type LanguageModel } from "ai";
import type { ZodType } from "zod";

// litellm-proxied models (llama/gemma) don't honor OpenAI structured-output
// (response_format json_schema), so generateObject fails to parse their reply.
// They DO emit clean JSON when asked in plain text — so we drive generateText
// and parse/validate ourselves. Model-agnostic and gateway-agnostic.
const JSON_INSTRUCTION =
  "\n\nResponda EXCLUSIVAMENTE com um único JSON válido, sem markdown e sem ```," +
  " seguindo exatamente o formato pedido. Nada de texto antes ou depois do JSON.";

/** Extract the first complete JSON object/array via bracket matching (string-aware). */
export function extractJson(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === open) depth++;
    else if (c === close && --depth === 0) return cleaned.slice(start, i + 1);
  }
  return null;
}

export interface GenerateJsonOptions {
  model: LanguageModel;
  schema: ZodType;
  prompt: string;
  system?: string;
  temperature?: number;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  maxOutputTokens?: number;
  /** Hard wall-clock cap per attempt; a stalled connection is aborted and retried. */
  attemptTimeoutMs?: number;
}

/** One generateText call bounded by its own timeout, then parse + validate. */
async function attempt<T>(opts: GenerateJsonOptions, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.abortSignal?.addEventListener("abort", onExternalAbort);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A stalled litellm connection does NOT reliably reject on AbortSignal, so we
  // race the request against an independent timeout that rejects on its own.
  // Whichever settles first wins; a still-dangling request is left to die.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`generateText timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    const generation = generateText({
      model: opts.model,
      system: opts.system,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      maxRetries: 0,
      abortSignal: controller.signal,
      prompt: opts.prompt + JSON_INSTRUCTION,
    });
    const { text } = await Promise.race([generation, timeout]);
    const raw = extractJson(text);
    if (!raw) throw new Error(`No JSON found in model output: ${text.slice(0, 200)}`);
    const parsed = opts.schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new Error(`JSON did not match schema: ${parsed.error.message}`);
    return parsed.data as T;
  } finally {
    clearTimeout(timer);
    opts.abortSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * generateObject replacement for models that don't honor structured output.
 * Drives generateText and parses/validates the JSON ourselves, retrying with a
 * fresh per-attempt timeout so a stalled litellm connection can't hang forever.
 */
export async function generateJsonObject<T>(opts: GenerateJsonOptions): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const timeoutMs = opts.attemptTimeoutMs ?? 90_000;
  let lastError: unknown;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await attempt<T>(opts, timeoutMs);
    } catch (error) {
      lastError = error;
      if (opts.abortSignal?.aborted) throw error;
    }
  }
  throw lastError;
}
