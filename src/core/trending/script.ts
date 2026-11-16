import type { ComicBook, ComicChapter } from "../comic/comic-types.js";
import type { TrendingRepo } from "./github-trending.js";
import type { LocalImage } from "./fetch-images.js";
import type { ReadmeSection } from "./readme.js";

const MAX_NARRATION_CHARS = 240;

/** Keeps the first sentences of a README paragraph, within a speakable length. */
export function firstSentences(text: string, maxChars = MAX_NARRATION_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > 0) return cut.slice(0, end + 1);
  return `${cut.replace(/\s+\S*$/, "")}.`;
}

/** Narration for a screenshot: the prose of the README section it sits in, else its alt text. */
export function narrationFor(image: LocalImage, sections: ReadmeSection[]): string {
  const section = sections.find((candidate) => candidate.images.some((item) => item.url === image.url));
  const prose = section?.text ? firstSentences(section.text) : "";
  return prose || image.alt || "Veja a tela do projeto.";
}

export function safeBookId(fullName: string): string {
  return fullName.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase();
}

/**
 * Turns a repository and its README screenshots into a narrated book: an intro
 * card, one chapter per screenshot, and a closing card with the repo link.
 */
export function buildRepoBook(repo: TrendingRepo, sections: ReadmeSection[], images: LocalImage[]): ComicBook {
  const first = images[0];
  const last = images[images.length - 1];
  if (!first || !last) throw new Error(`No README images to narrate for ${repo.fullName}`);
  const name = repo.fullName.split("/")[1] ?? repo.fullName;
  const intro: ComicChapter = {
    id: "intro",
    title: name,
    imagePath: first.path,
    narrationText: `Projeto da semana: ${name}. ${repo.description ?? ""}`.trim(),
  };
  const shots: ComicChapter[] = images.map((image, index) => ({
    id: `shot-${index + 1}`,
    title: image.alt || `Tela ${index + 1}`,
    imagePath: image.path,
    narrationText: narrationFor(image, sections),
  }));
  const outro: ComicChapter = {
    id: "outro",
    title: "Onde encontrar",
    imagePath: last.path,
    narrationText: `O código está em ${repo.htmlUrl}. Até o próximo repositório da semana.`,
  };
  return { id: safeBookId(repo.fullName), title: name, chapters: [intro, ...shots, outro] };
}
