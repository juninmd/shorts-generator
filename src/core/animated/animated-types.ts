import type { ComicBook, ComicChapter } from "../comic/comic-types.js";

/** `pop` = A2 Modern Pop (white studio, beanie figure, holograms); `line` = B1 Minimal Line Art (paper, pen, crayon). */
export type StickStyle = "pop" | "line";
export type StickPose =
  | "stand" | "talk" | "explain" | "point" | "present" | "alarm" | "facepalm"
  | "think" | "shrug" | "type" | "cheer" | "thumbs" | "stop";
export type StickFace = "neutral" | "happy" | "worried" | "shocked" | "angry" | "determined" | "smug";
export type StickProp = "terminal" | "database" | "shield" | "warning" | "checklist" | "approval" | "robot" | "lock" | "x";
export type StickSlot = "right" | "top" | "low" | "left";
export type StickSound = "pop" | "ding" | "alarm" | "scribble" | "whoosh";

/**
 * One acting beat. It fires when the narration speaks a word starting with `cue`
 * (accent-insensitive), or at the `at` fraction of the chapter when there is no cue match.
 */
export interface StickBeat {
  cue?: string;
  at?: number;
  pose?: StickPose;
  face?: StickFace;
  prop?: StickProp;
  slot?: StickSlot;
  /** Name a prop so a later beat can change its state. */
  id?: string;
  lines?: string[];
  items?: string[];
  label?: string;
  title?: string;
  set?: { id: string; state: "danger" | "aprovar" | "negar" };
  sfx?: StickSound;
}

export interface StickChapter extends ComicChapter {
  /** Short on-screen heading; words listed in `emphasis` are highlighted. */
  heading: string;
  emphasis?: string;
  /** Walk the character in from the left before the first pose. */
  enter?: boolean;
  beats: StickBeat[];
}

export interface AnimatedBook extends Omit<ComicBook, "chapters"> {
  style?: StickStyle;
  chapters: StickChapter[];
}
