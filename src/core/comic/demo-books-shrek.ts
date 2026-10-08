import type { ComicBook } from "./comic-types.js";
import { buildColorCardBook } from "./demo-books-utils.js";

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
