import type { Quiz, QuizQuestion } from "./quiz.domain.js";

// Rotating calls to action: identical narration on every video reads as mass-produced.
export const OUTRO_CALLS = [
  "Comenta quantas você acertou e se inscreve para o próximo quiz!",
  "Conta nos comentários qual foi a mais difícil pra você!",
  "Desafia um amigo com esse quiz e se inscreve no canal!",
  "Quantas você acertou? Deixa aqui embaixo e volta amanhã!",
];

export function pickVariant<T>(options: readonly T[], seed: string): T {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return options[hash % options.length]!;
}

export const buildRevealNarration = (question: QuizQuestion): string =>
  `Letra ${question.resposta_correta}: ${question.opcoes[question.resposta_correta]}!`;

export const buildOutroNarration = (quiz: Quiz): string =>
  `${quiz.fato_curioso}. ${pickVariant(OUTRO_CALLS, quiz.titulo_youtube || quiz.tema)}`;

export const buildTelegramCaption = (quiz: Quiz, watermarkText: string): string =>
  `🏆 <b>${quiz.titulo_youtube}</b>\n\nPrimeira pergunta: ${quiz.perguntas[0]?.pergunta}\n\nCanal: ${watermarkText}\n\n#quiz #shorts`;

export const buildYoutubeRelayCaption = (quiz: Quiz, url: string): string =>
  `📺 <b>O quiz "${quiz.tema.toUpperCase()}" já está no YouTube!</b>\n\nAssista e deixe aquele like: ${url}`;

export const buildOutputFileName = (quiz: Quiz): string => `quiz_${quiz.tema.replace(/\s+/g, "_")}_${Date.now()}.mp4`;

export const buildYoutubeMetadata = (quiz: Quiz, watermarkText: string, provenance: readonly string[] = []): { title: string; description: string; tags: string[] } => {
  const slug = quiz.tema.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  const sources = provenance.filter((p) => p.includes("http")).map((p) => `• ${p.split(" <- ")[1]}`);
  return {
    title: quiz.titulo_youtube || `${quiz.perguntas[0]?.pergunta ?? quiz.tema} 🧠`,
    description: `${quiz.hook} Teste seus conhecimentos de ${quiz.tema} em ${quiz.perguntas.length} perguntas.\n` +
      `${pickVariant(OUTRO_CALLS, quiz.tema)}\n\n` +
      (sources.length ? `Fontes:\n${sources.join("\n")}\n\n` : "") +
      `#shorts #quiz #${slug}\n\nCanal: ${watermarkText}`,
    tags: [...(quiz.tags || []), quiz.tema, "quiz"],
  };
};
