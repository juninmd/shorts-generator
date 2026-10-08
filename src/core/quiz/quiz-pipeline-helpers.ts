import type { Quiz, QuizQuestion } from "./quiz.domain.js";

export const buildRevealNarration = (question: QuizQuestion): string =>
  `Letra ${question.resposta_correta}: ${question.opcoes[question.resposta_correta]}!`;

export const buildOutroNarration = (quiz: Quiz): string =>
  `${quiz.fato_curioso}. Comenta quantas você acertou e se inscreve para o próximo quiz!`;

export const buildTelegramCaption = (quiz: Quiz, watermarkText: string): string =>
  `🏆 <b>${quiz.titulo_youtube}</b>\n\nPrimeira pergunta: ${quiz.perguntas[0]?.pergunta}\n\nCanal: ${watermarkText}\n\n#quiz #shorts`;

export const buildYoutubeRelayCaption = (quiz: Quiz, url: string): string =>
  `📺 <b>O quiz "${quiz.tema.toUpperCase()}" já está no YouTube!</b>\n\nAssista e deixe aquele like: ${url}`;

export const buildOutputFileName = (quiz: Quiz): string => `quiz_${quiz.tema.replace(/\s+/g, "_")}_${Date.now()}.mp4`;

export const buildYoutubeMetadata = (quiz: Quiz, watermarkText: string): { title: string; description: string; tags: string[] } => {
  const slug = quiz.tema.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
  return {
    title: quiz.titulo_youtube || `${quiz.perguntas[0]?.pergunta ?? quiz.tema} 🧠`,
    description: `${quiz.hook} Teste seus conhecimentos de ${quiz.tema} em ${quiz.perguntas.length} perguntas — a última quase ninguém acerta.\n` +
      `Comenta quantas você acertou e se inscreve para o próximo!\n\n` +
      `#shorts #quiz #${slug}\n\nCanal: ${watermarkText}`,
    tags: [...(quiz.tags || []), quiz.tema, "quiz"],
  };
};
