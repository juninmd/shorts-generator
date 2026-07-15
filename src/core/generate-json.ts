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
}

/** generateObject replacement that works with non-structured-output models. */
export async function generateJsonObject<T>(opts: GenerateJsonOptions): Promise<T> {
  const { model, schema, prompt, system, temperature, abortSignal, maxRetries = 2 } = opts;
  const { text } = await generateText({
    model,
    system,
    temperature,
    abortSignal,
    maxRetries,
    prompt: prompt + JSON_INSTRUCTION,
  });
  const raw = extractJson(text);
  if (!raw) throw new Error(`No JSON found in model output: ${text.slice(0, 200)}`);
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error(`JSON did not match schema: ${parsed.error.message}`);
  return parsed.data as T;
}
