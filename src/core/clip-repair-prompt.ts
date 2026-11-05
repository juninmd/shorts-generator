import type { Transcript } from "../types.js";
import type { ClipItem } from "./analyzer-schema.js";
import { formatTranscriptForLLM } from "./analyzer-chunks.js";
import type { Interval } from "./source-gaps.js";

export interface RepairContext {
  /** Reviewer reasons per rejected candidate title. */
  reasons?: { title: string; reason: string }[];
  /** Unexplored stretches of the source (>= 30s) worth a fresh look. */
  gaps?: Interval[];
  /** Approved footage that must not be proposed again. */
  exclude?: Interval[];
}

function failedCandidates(clips: ClipItem[], reasons: RepairContext["reasons"] = []): string {
  return clips.map((clip, index) => [
    `CANDIDATO REPROVADO ${index}`,
    `Título: ${clip.title}`,
    `Intervalo: ${clip.startTime}-${clip.endTime} (${clip.endTime - clip.startTime}s)`,
    `Gancho alegado: ${clip.hookText ?? "ausente"}`,
    `Payoff alegado: ${clip.payoffText ?? "ausente"}`,
    `Motivo da reprovação: ${reasons.find((item) => item.title === clip.title)?.reason ?? "não informado"}`,
  ].join("\n")).join("\n\n");
}

const range = (interval: Interval): string => `${interval.startTime.toFixed(1)}-${interval.endTime.toFixed(1)}`;

export function repairPrompt(
  clips: ClipItem[],
  transcript: Transcript,
  minDuration: number,
  maxDuration: number,
  maxClips: number,
  context: RepairContext = {},
): string {
  const gaps = context.gaps?.length
    ? `\nLACUNAS AINDA NÃO EXPLORADAS (procure candidatos novos nelas): ${context.gaps.map(range).join("; ")}\n`
    : "";
  const exclude = context.exclude?.length
    ? `\nTRECHOS JÁ APROVADOS (não repita): ${context.exclude.map(range).join("; ")}\n`
    : "";
  return `Você é um editor de resgate. Os candidatos abaixo foram reprovados por
gancho, contexto, payoff ou timestamps. Encontre momentos melhores na transcrição
completa. Não repita intervalos ruins; recorte apenas ideias autossuficientes.

REGRAS INEGOCIÁVEIS:
- Cada intervalo deve durar entre ${minDuration} e ${maxDuration} segundos
- startTime e endTime devem copiar limites existentes [início-fim]
- A primeira frase deve funcionar como gancho sem introdução
- A última frase deve concluir a ideia, nunca terminar truncada
- hookText e payoffText devem ser cópias literais dessas frases
- Ao corrigir um candidato reprovado, preencha "diagnosis" com {"check": critério que falhou,
  "quote": frase LITERAL da transcrição que prova o problema, "explanation": curta};
  citação que não exista na transcrição invalida a correção
- Varra especialmente o meio e o terço final
- Retorne no máximo ${maxClips} candidatos; zero é melhor que material mediano
${gaps}${exclude}
JSON EXATO:
{"clips":[{"title":"...","presenter":"","description":"...","contentValue":"...","hookText":"primeira frase literal","payoffText":"última frase literal","startTime":0,"endTime":40,"viralScore":8,"reason":"...","hashtags":["#tema"],"diagnosis":{"check":"completeEnding","quote":"frase literal","explanation":"..."}}]}

${failedCandidates(clips, context.reasons)}

TRANSCRIÇÃO COMPLETA:
${formatTranscriptForLLM(transcript.segments)}`;
}
