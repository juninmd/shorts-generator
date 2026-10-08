import type { ComicBook } from "./comic-types.js";
import { buildColorCardBook } from "./demo-books-utils.js";

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
