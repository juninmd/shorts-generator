import type { ComicBook } from "./comic-types.js";
import { buildColorCardBook } from "./demo-books-utils.js";

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
