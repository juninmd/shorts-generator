import type { ComicBook, ComicChapter } from "../comic/comic-types.js";

export type StickPose = "idle" | "talk" | "point" | "alarm" | "typing";
export type StickProp = "none" | "database" | "warning" | "shield";

/** A chapter drawn as a stick figure in `pose` with an optional `prop`, narrated like a comic chapter. */
export interface StickChapter extends ComicChapter {
  pose: StickPose;
  prop: StickProp;
}

export interface AnimatedBook extends Omit<ComicBook, "chapters"> {
  chapters: StickChapter[];
}
