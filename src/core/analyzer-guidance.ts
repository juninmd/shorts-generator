import type { PipelineConfig } from "../types.js";

/** Genre-specific selection rules (Opus-style "genre curation"). Keys are matched case-insensitively. */
export const GENRE_GUIDANCE: Record<string, string> = {
  podcast: "Entrevista/podcast: priorize respostas que revelam algo inédito, discordâncias e histórias pessoais. Inclua a pergunta só se o corte não fizer sentido sem ela.",
  qa: "Perguntas e respostas: o corte começa na pergunta (ou na resposta, se ela se sustentar sozinha) e termina quando a resposta fecha. Prefira respostas diretas e surpreendentes.",
  vlog: "Vlog: priorize reações, imprevistos, humor espontâneo e viradas. Corte o que for só deslocamento ou cena de transição.",
  listicle: "Lista/ranking: escolha um item completo (título + explicação) com o melhor argumento; o número do item é um ótimo gancho.",
  webinar: "Aula/webinar: priorize uma dica aplicável, um erro comum ou um 'antes e depois'. Evite slides lidos em voz alta e agradecimentos.",
  sermon: "Pregação/reflexão: priorize testemunho, passagem aplicada à vida atual e frase marcante com raciocínio completo.",
  gaming: "Gameplay: priorize clutch, falhas engraçadas, reações intensas e momentos de virada; o clímax deve estar nos últimos segundos.",
  sports: "Esporte: priorize lances decisivos, polêmicas e declarações fortes; inclua a reação logo após o lance.",
  news: "Notícia/comentário: priorize o fato mais surpreendente nos primeiros segundos e a consequência prática no final.",
  comedy: "Humor: o corte deve conter preparação + punchline; termine logo após a risada, sem explicar a piada.",
};

/** Extra prompt sections driven by config: genre, natural-language request and audio hints. */
export function buildGuidanceBlock(config: Pick<PipelineConfig, "videoGenre" | "clipPrompt" | "analysisHints">): string {
  const sections: string[] = [];
  const genre = config.videoGenre?.trim().toLowerCase();
  if (genre) {
    sections.push(`GÊNERO DO VÍDEO (${genre}): ${GENRE_GUIDANCE[genre] ?? `conteúdo do tipo "${genre}"; adapte os critérios a esse formato.`}`);
  }
  const request = config.clipPrompt?.trim();
  if (request) {
    sections.push(`PEDIDO DO EDITOR: encontre APENAS momentos que atendam a: "${request}". Ignore trechos fortes que não tenham relação com o pedido.`);
  }
  if (config.analysisHints) sections.push(config.analysisHints.trim());
  return sections.length > 0 ? `\n${sections.join("\n")}\n` : "";
}
