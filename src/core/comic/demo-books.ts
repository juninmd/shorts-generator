import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import type { ComicBook } from "./comic-types.js";
import { buildFontEnv } from "../ffmpeg-env.js";

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  return (ffmpeg as any).ffmpegPath?.() ?? "ffmpeg";
}

interface DemoChapter {
  id: string;
  title: string;
  narrationText: string;
}

/**
 * Renders one plain color card per chapter (no drawtext: that filter segfaults
 * in some fontconfig setups — see video-processor.ts's own drawtext avoidance
 * note) and wraps them into a narratable book. Used for smoke-testing the
 * narration -> video pipeline with original, non-infringing synopsis text —
 * never actual copyrighted stills, panels or dialogue.
 */
async function buildColorCardBook(
  workDir: string,
  id: string,
  title: string,
  chapters: DemoChapter[],
): Promise<ComicBook> {
  fs.mkdirSync(workDir, { recursive: true });

  const palette = ["0x1a1a2e", "0x16213e", "0x0f3460", "0x2c1e4a"];
  for (const [index, chapter] of chapters.entries()) {
    const imagePath = path.join(workDir, `${chapter.id}.png`);
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=${palette[index % palette.length]}:s=1080x1920`,
      "-frames:v", "1",
      imagePath,
    ];
    await execFileAsync(getFfmpegPath(), args, { maxBuffer: 8 * 1024 * 1024, env: buildFontEnv() });
  }

  return {
    id,
    title,
    chapters: chapters.map((chapter) => ({
      ...chapter,
      imagePath: path.join(workDir, `${chapter.id}.png`),
    })),
  };
}

/** Placeholder "Flash: Flashpoint" (comic) test book. */
export function buildFlashpointDemoBook(workDir: string): Promise<ComicBook> {
  return buildColorCardBook(workDir, "flashpoint-demo", "Flash: Flashpoint (teste)", [
    {
      id: "ch1",
      title: "Capítulo 1: O Mundo Mudou",
      narrationText:
        "Barry Allen acorda em uma realidade que não reconhece. Sua mãe está viva, " +
        "mas o mundo ao seu redor caiu na guerra entre Atlantis e a Amazônia, e ele " +
        "descobre que não é mais o Flash.",
    },
    {
      id: "ch2",
      title: "Capítulo 2: A Busca por Respostas",
      narrationText:
        "Barry recupera seus poderes e procura versões alternativas de seus aliados. " +
        "Ele percebe que uma corrida através do tempo alterou a linha temporal inteira, " +
        "e que apenas ele se lembra de como o mundo deveria ser.",
    },
    {
      id: "ch3",
      title: "Capítulo 3: A Escolha",
      narrationText:
        "Para consertar a realidade, Barry precisa desfazer o próprio ato que a quebrou: " +
        "voltar correndo no tempo e deixar sua mãe morrer outra vez, restaurando a linha " +
        "temporal original ao custo de sua própria felicidade.",
    },
  ]);
}

/** Placeholder "Shrek (2001)" movie-recap test book. */
export function buildShrek1DemoBook(workDir: string): Promise<ComicBook> {
  return buildColorCardBook(workDir, "shrek1-demo", "Shrek (2001, teste)", [
    {
      id: "ch1",
      title: "Parte 1: O Pântano Invadido",
      narrationText:
        "Shrek, um ogro que vive isolado em seu pântano, tem sua paz interrompida " +
        "quando o Lorde Farquaad exila dezenas de personagens de contos de fadas " +
        "para as terras do ogro, obrigando-o a agir para recuperar seu sossego.",
    },
    {
      id: "ch2",
      title: "Parte 2: A Missão de Resgate",
      narrationText:
        "Para reaver seu pântano, Shrek aceita resgatar a Princesa Fiona de uma " +
        "torre guardada por um dragão, acompanhado do Burro falante, que não para " +
        "de tagarelar durante toda a jornada.",
    },
    {
      id: "ch3",
      title: "Parte 3: O Amor Quebra a Maldição",
      narrationText:
        "No caminho de volta, Shrek e Fiona se aproximam e se apaixonam. Fiona " +
        "revela seu segredo: uma maldição a transforma em ogra ao anoitecer, e ela " +
        "escolhe viver assim para sempre, ao lado de Shrek.",
    },
  ]);
}

/** Placeholder "The Flash — 1x01 Pilot" series-recap test book. */
export function buildFlashEpisode1DemoBook(workDir: string): Promise<ComicBook> {
  return buildColorCardBook(workDir, "flash-s01e01-demo", "The Flash 1x01 (teste)", [
    {
      id: "ch1",
      title: "Parte 1: O Acidente",
      narrationText:
        "Barry Allen, perito forense de Central City, é atingido por um raio durante " +
        "a explosão do acelerador de partículas do S.T.A.R. Labs e entra em coma " +
        "por nove meses.",
    },
    {
      id: "ch2",
      title: "Parte 2: O Despertar",
      narrationText:
        "Ao acordar, Barry descobre que ganhou super-velocidade. Com a ajuda da " +
        "equipe do S.T.A.R. Labs, ele começa a entender e treinar seus novos " +
        "poderes, enquanto investiga a morte da própria mãe.",
    },
    {
      id: "ch3",
      title: "Parte 3: O Primeiro Vilão",
      narrationText:
        "Barry enfrenta Clyde Mardon, outro afetado pela explosão que ganhou o " +
        "poder de controlar tempestades, e assume pela primeira vez o manto de " +
        "Flash para detê-lo.",
    },
  ]);
}

/** Placeholder biography test book: Ada Lovelace (public-domain historical facts). */
export function buildBiographyDemoBook(workDir: string): Promise<ComicBook> {
  return buildColorCardBook(workDir, "ada-lovelace-demo", "Ada Lovelace (teste)", [
    {
      id: "ch1",
      title: "Parte 1: A Filha do Poeta",
      narrationText:
        "Ada Lovelace nasceu em 1815, filha do poeta Lord Byron. Criada pela mãe " +
        "para longe da poesia, foi educada em matemática e lógica desde cedo, algo " +
        "raro para mulheres na Inglaterra da época.",
    },
    {
      id: "ch2",
      title: "Parte 2: O Encontro com a Máquina",
      narrationText:
        "Aos dezessete anos, Ada conheceu Charles Babbage e sua Máquina Analítica. " +
        "Fascinada, passou a traduzir e anotar os trabalhos sobre a máquina, " +
        "expandindo-os com ideias próprias.",
    },
    {
      id: "ch3",
      title: "Parte 3: A Primeira Programadora",
      narrationText:
        "Em suas anotações, Ada descreveu um algoritmo para a máquina calcular " +
        "números de Bernoulli, hoje considerado o primeiro programa de computador " +
        "da história, décadas antes de existir um computador de verdade.",
    },
  ]);
}

/** Placeholder news-digest test book: example headlines in a fixed 3-story format. */
export function buildNewsDigestDemoBook(workDir: string): Promise<ComicBook> {
  return buildColorCardBook(workDir, "news-digest-demo", "Resumo do Dia (teste)", [
    {
      id: "ch1",
      title: "Manchete 1",
      narrationText:
        "Esta é uma manchete de exemplo para testar o fluxo de resumo de notícias. " +
        "Em produção, este texto viria de uma fonte de notícias configurada pelo " +
        "usuário, como um feed RSS.",
    },
    {
      id: "ch2",
      title: "Manchete 2",
      narrationText:
        "Segunda manchete de exemplo, mostrando como o pipeline narra múltiplas " +
        "notícias em sequência, cada uma como um capítulo independente do short.",
    },
    {
      id: "ch3",
      title: "Manchete 3",
      narrationText:
        "Terceira e última manchete de exemplo, fechando o resumo do dia com uma " +
        "chamada para o próximo vídeo.",
    },
  ]);
}

/** Placeholder book-recap test book: "Dom Casmurro" (Machado de Assis, public domain in Brazil). */
export function buildBookRecapDemoBook(workDir: string): Promise<ComicBook> {
  return buildColorCardBook(workDir, "dom-casmurro-demo", "Dom Casmurro (teste)", [
    {
      id: "ch1",
      title: "Parte 1: A Promessa",
      narrationText:
        "Bentinho, destinado ao seminário pela promessa da mãe, se apaixona pela " +
        "vizinha Capitu. Os dois planejam formas de escapar do destino imposto pela " +
        "família.",
    },
    {
      id: "ch2",
      title: "Parte 2: O Casamento",
      narrationText:
        "Bentinho consegue se livrar do seminário e, anos depois, se casa com " +
        "Capitu. O casal tem um filho, Ezequiel, e vive momentos de aparente " +
        "felicidade.",
    },
    {
      id: "ch3",
      title: "Parte 3: A Dúvida",
      narrationText:
        "Bentinho passa a suspeitar que Ezequiel seja filho de seu melhor amigo, " +
        "Escobar, e não seu. A dúvida nunca é confirmada, mas consome o narrador " +
        "até o fim de sua vida.",
    },
  ]);
}
