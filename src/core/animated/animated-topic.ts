import { z } from "zod";
import type { PipelineConfig } from "../../types.js";
import { createModel } from "../ai-provider.js";
import { generateJsonObject } from "../generate-json.js";
import { buildEngagementComment } from "../youtube-comment.service.js";
import { sanitizeYoutubeTags } from "../youtube-tags.js";
import type { BibleShortMeta } from "../faceless/bible-meta.js";
import type { AnimatedBook, StickStyle } from "./animated-types.js";

export const EVO_AGENT_FEED = "https://juninmd.github.io/evo-agent/feed.xml";
export const DAILY_THEME = "boas práticas de desenvolvimento de código e de programar com IA (agentes, revisão, testes, contexto, guardrails)";

export interface FeedEntry { title: string; link: string; summary: string; categories: string[] }

const decode = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** Entradas de um feed Atom (título, link, resumo, categorias), da mais nova para a mais antiga. */
export function parseAtomFeed(xml: string): FeedEntry[] {
  const pick = (block: string, tag: string) => decode(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? "");
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => ({
    title: pick(m[1]!, "title"),
    link: m[1]!.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "",
    summary: pick(m[1]!, "summary"),
    categories: [...m[1]!.matchAll(/<category term="([^"]+)"/g)].map((c) => c[1]!),
  })).filter((e) => e.title);
}

export async function fetchFeedEntries(url = EVO_AGENT_FEED, limit = 5): Promise<FeedEntry[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Feed ${url} respondeu ${res.status}`);
  return parseAtomFeed(await res.text()).slice(0, limit);
}

/** Alterna pop/line por dia: o canal mostra os dois visuais sem repetir o do dia anterior. */
export function styleForDate(date: Date): StickStyle {
  const day = Math.floor(date.getTime() / 86_400_000);
  return day % 2 === 0 ? "pop" : "line";
}

const PROPS = ["terminal", "database", "shield", "warning", "checklist", "approval", "robot", "lock", "x"] as const;
const POSES = ["stand", "talk", "explain", "point", "present", "alarm", "facepalm", "think", "shrug", "type", "cheer", "thumbs", "stop"] as const;
const FACES = ["neutral", "happy", "worried", "shocked", "angry", "determined", "smug"] as const;
const SLOTS = ["right", "top", "low", "left"] as const;
const SOUNDS = ["pop", "ding", "alarm", "scribble", "whoosh"] as const;

const BeatSchema = z.object({
  cue: z.string().min(2).optional(),
  at: z.number().min(0).max(1).optional(),
  pose: z.enum(POSES).optional(),
  face: z.enum(FACES).optional(),
  prop: z.enum(PROPS).optional(),
  slot: z.enum(SLOTS).optional(),
  id: z.string().optional(),
  lines: z.array(z.string().max(34)).max(4).optional(),
  items: z.array(z.string().max(28)).max(4).optional(),
  label: z.string().max(24).optional(),
  title: z.string().max(24).optional(),
  set: z.object({ id: z.string(), state: z.enum(["danger", "aprovar", "negar"]) }).optional(),
  sfx: z.enum(SOUNDS).optional(),
});

export const AnimatedScriptSchema = z.object({
  title: z.string().min(1).max(80),
  hashtags: z.array(z.string()).max(6).default([]),
  chapters: z.array(z.object({
    heading: z.string().min(3).max(44),
    emphasis: z.string().min(1).max(30).optional(),
    narration: z.string().min(1),
    beats: z.array(BeatSchema).min(2).max(6),
  })).min(4).max(6),
}).superRefine((script, ctx) => {
  const words = script.chapters.reduce((n, c) => n + c.narration.split(/\s+/).filter(Boolean).length, 0);
  if (words < 90 || words > 170) ctx.addIssue({ code: "custom", message: `Narração com ${words} palavras; precisa de 90 a 170` });
});

export type AnimatedScript = z.infer<typeof AnimatedScriptSchema>;

/** Roteiro do short do dia: o tema é fixo, o feed só sugere o assunto. */
export async function generateAnimatedScript(
  entries: FeedEntry[],
  config: Pick<PipelineConfig, "aiModel" | "litellmApiKey" | "litellmBaseUrl">,
  dateLabel: string,
): Promise<AnimatedScript> {
  const suggestions = entries.map((e, i) => `${i + 1}. ${e.title}: ${e.summary}`).join("\n") || "(sem sugestões hoje)";
  return generateJsonObject<AnimatedScript>({
    model: createModel(config as PipelineConfig),
    schema: AnimatedScriptSchema,
    temperature: 0.6,
    attemptTimeoutMs: 180_000,
    maxRetries: 3,
    prompt: [
      `Escreva o roteiro de um YouTube Short animado (personagem stick figure) do canal Antonio Code, em pt-BR, data ${dateLabel}.`,
      `Tema do canal: ${DAILY_THEME}. Escolha UM assunto prático e específico (uma regra, um erro comum ou um hábito), com começo, meio e fim.`,
      "Sugestões de inspiração (radar diário de IA para devs). Use no máximo uma, só se encaixar no tema; não invente versões, números nem fatos:",
      suggestions,
      "Duração falada: 40 a 55 segundos, 100 a 150 palavras no total, de 4 a 6 capítulos. Primeiro capítulo = gancho (pergunta ou erro doloroso); último = conclusão curta e convite para seguir o Antonio Code.",
      `Cada capítulo: "heading" (até 44 caracteres, aparece em tela), "emphasis" (palavras EXATAS do heading para destacar), "narration" (2 a 3 frases) e "beats" (2 a 6).`,
      `Beat: "cue" = palavra que aparece na narração do capítulo (a ação dispara quando ela é falada) ou "at" de 0 a 1; "pose" (${POSES.join(", ")}); "face" (${FACES.join(", ")});`,
      `"prop" (${PROPS.join(", ")}) com "slot" (${SLOTS.join(", ")}); terminal usa "lines" (até 4, 34 caracteres); checklist usa "items"; "label"/"title" até 24 caracteres; "sfx" (${SOUNDS.join(", ")}).`,
      'Para mudar o estado de um prop já exibido, dê "id" a ele e depois use {"set": {"id": "...", "state": "danger|aprovar|negar"}}.',
      'Tom didático e direto, sem emojis. Formato: {"title": string, "hashtags": string[], "chapters": [{"heading": string, "emphasis": string, "narration": string, "beats": [...]}]}',
    ].join("\n"),
  });
}

const slug = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28);

/** Converte o roteiro validado em AnimatedBook; cues que não aparecem na narração viram posição proporcional. */
export function scriptToBook(script: AnimatedScript, id: string, style: StickStyle): AnimatedBook {
  return {
    id,
    title: script.title,
    style,
    chapters: script.chapters.map((c, i) => {
      const spoken = c.narration.toLowerCase();
      const beats = c.beats.map((b, j) => {
        const { cue, at, ...rest } = b;
        const heard = cue && spoken.includes(cue.toLowerCase());
        return heard ? { ...rest, cue } : { ...rest, at: at ?? (j === 0 ? 0 : j / c.beats.length) };
      });
      const emphasis = c.emphasis && c.heading.toLowerCase().includes(c.emphasis.toLowerCase()) ? c.emphasis : undefined;
      return {
        id: `c${i + 1}-${slug(c.heading) || "cena"}`,
        title: c.heading,
        imagePath: "",
        heading: c.heading,
        emphasis,
        enter: i === 0 || undefined,
        narrationText: c.narration,
        beats,
      };
    }),
  };
}

/** Metadados de publicação no formato do card de aprovação do Telegram. */
export function buildAnimatedMeta(
  script: AnimatedScript,
  videoPath: string,
  durationSec: number,
  config: Pick<PipelineConfig, "managedRun">,
  source?: FeedEntry,
): BibleShortMeta {
  const run = config.managedRun;
  const links = run?.affiliateLinks;
  const tags = ["shorts", "programação", "inteligência artificial", "desenvolvimento", "antonio code"];
  const hashtags = ["#shorts", "#programacao", "#ia", ...script.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`))].slice(0, 8).join(" ");
  const summary = script.chapters.map((c) => c.narration).join(" ");
  const credit = source?.link ? `\n\nInspiração: ${source.title} (${source.link})` : "";
  return {
    channelId: run?.channelId ?? "global",
    videoPath,
    durationSec,
    reference: source?.title ?? "Antonio Code",
    title: `${script.title} | Antonio Code`.slice(0, 100),
    description: `${summary}\n\n${hashtags}${credit}`,
    tags: sanitizeYoutubeTags([...tags, ...script.title.split(" ")]),
    commentText: buildEngagementComment(undefined, run?.focusLabels, "Qual dessas práticas você já usa com IA no seu dia a dia? Conta nos comentários 👇", { links, seed: videoPath }),
  };
}
