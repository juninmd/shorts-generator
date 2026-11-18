import type { PipelineConfig } from "../../types.js";
import { appendAffiliateBlock } from "../affiliate-links.js";
import { buildEngagementComment } from "../youtube-comment.service.js";
import { sanitizeYoutubeTags } from "../youtube-tags.js";
import type { BibleScript } from "./bible-script.js";

export interface BibleShortMeta {
  readonly channelId: string;
  readonly videoPath: string;
  readonly durationSec: number;
  readonly reference: string;
  readonly title: string;
  readonly description: string;
  readonly tags: string[];
  readonly commentText: string;
}

const HASHTAGS = "#shorts #biblia #catolico #fe #palavradedeus";
const COMMENT_QUESTION = "Qual trecho dessa passagem mais tocou você? Conta aqui nos comentários 🙏";

/** Título, descrição, tags e comentário fixo (com os links do canal) de um short bíblico. */
export function buildBibleMeta(
  script: BibleScript,
  videoPath: string,
  durationSec: number,
  config: Pick<PipelineConfig, "managedRun">,
): BibleShortMeta {
  const run = config.managedRun;
  const links = run?.affiliateLinks;
  const summary = script.scenes.map((s) => s.narration).join(" ");
  const body = `${summary}\n\n📖 Passagem: ${script.reference}\n\n${HASHTAGS}`;
  return {
    channelId: run?.channelId ?? "global",
    videoPath,
    durationSec,
    reference: script.reference,
    title: `${script.title} | ${script.reference}`.slice(0, 100),
    description: appendAffiliateBlock(body, links, videoPath, run?.focusLabels),
    tags: sanitizeYoutubeTags(["shorts", "bíblia", "católico", "fé", "palavra de deus", script.reference, ...script.title.split(" ")]),
    commentText: buildEngagementComment(undefined, run?.focusLabels, COMMENT_QUESTION, { links, seed: videoPath }),
  };
}
