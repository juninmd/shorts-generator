import { generateText } from "ai";
import type { PipelineConfig } from "../types.js";
import { scheduleAbort } from "./abort-timeout.js";
import { createModel } from "./ai-provider.js";
import { buildAnalysisPrompt } from "./analyzer-prompt.js";
import { ClipSchema, type ClipItem } from "./analyzer-schema.js";
import { generateJsonObject } from "./generate-json.js";
import { logger } from "./logger.js";
import { formatFeedbackForPrompt, getChannelFeedback } from "./viral-feedback.js";

function parseFallback(text: string): ClipItem[] {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start === -1) return [];
  const match = cleaned.match(cleaned[start] === "[" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!match) return [];
  const parsed = JSON.parse(match[0]);
  const items = Array.isArray(parsed) ? parsed
    : (Array.isArray(parsed.clips) ? parsed.clips : [parsed]);
  return items.filter((item: unknown) => item && typeof item === "object").map((item: any) => ({
    ...item,
    startTime: typeof item.startTime === "number" ? item.startTime
      : (typeof item.start === "number" ? item.start : 0),
    endTime: typeof item.endTime === "number" ? item.endTime
      : (typeof item.end === "number" ? item.end : 0),
  }));
}

async function promptFor(
  transcript: string,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<string> {
  const feedback = formatFeedbackForPrompt(await getChannelFeedback(config));
  return buildAnalysisPrompt(
    transcript, videoTitle, channelName, minCuts, maxCuts,
    config.minShortDuration, config.maxShortDuration, feedback,
  );
}

async function fallback(
  transcript: string,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<ClipItem[]> {
  const prompt = await promptFor(transcript, videoTitle, channelName, config, minCuts, maxCuts);
  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    const { text } = await generateText({
      model: createModel(config),
      prompt: `${prompt}\n\nRetorne APENAS o JSON solicitado, sem explicações.`,
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal,
    });
    return parseFallback(text);
  } catch (error) {
    logger.error({ error }, "Falha no fallback do LLM");
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function analyzeSinglePass(
  transcript: string,
  videoTitle: string,
  channelName: string,
  config: PipelineConfig,
  minCuts: number,
  maxCuts: number,
): Promise<ClipItem[]> {
  const prompt = await promptFor(transcript, videoTitle, channelName, config, minCuts, maxCuts);
  const controller = new AbortController();
  const timeoutId = scheduleAbort(controller, config.aiTimeoutMs ?? 300_000);
  try {
    const object = await generateJsonObject<{ clips?: ClipItem[] }>({
      model: createModel(config),
      schema: ClipSchema,
      prompt,
      temperature: 0.7,
      maxRetries: 5,
      abortSignal: controller.signal,
    });
    return object.clips ?? [];
  } catch (error) {
    logger.error({ error }, "Falha na geração estruturada; tentando fallback");
    return fallback(transcript, videoTitle, channelName, config, minCuts, maxCuts);
  } finally {
    clearTimeout(timeoutId);
  }
}
