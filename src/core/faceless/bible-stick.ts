import type { AnimatedBook, StickBeat, StickChapter, StickFace, StickPose } from "../animated/animated-types.js";
import { wrapText } from "../quiz/quiz-assets.service.js";
import type { BibleAct, BibleScript } from "./bible-script.js";

/** Acting per act: the figure's pose and face carry the emotion of the passage, never a plot the text lacks. */
const ACT_STAGE: Record<BibleAct, { heading: string; pose: StickPose; face: StickFace }> = {
  gancho: { heading: "Uma pergunta", pose: "talk", face: "worried" },
  contexto: { heading: "Contexto", pose: "explain", face: "neutral" },
  acontecimento: { heading: "O que acontece", pose: "point", face: "neutral" },
  virada: { heading: "A virada", pose: "present", face: "determined" },
  aplicacao: { heading: "Para você", pose: "cheer", face: "happy" },
};

/** Verse columns per scroll line; the scroll prop shows up to eight lines, so a 140-char verse always fits. */
const VERSE_LINE_WIDTH = 22;

/**
 * Bible passage as a stick-figure short: one chapter per scene, the verse quoted word for word on a
 * scroll prop (never paraphrased), the figure acting the act's emotion. Pure: no I/O.
 */
export function buildBibleStickBook(script: BibleScript): AnimatedBook {
  const chapters: StickChapter[] = script.scenes.map((scene, index) => {
    const stage = ACT_STAGE[scene.act];
    const lines = wrapText(`“${scene.verse}”`, VERSE_LINE_WIDTH).split("\n");
    const beats: StickBeat[] = [
      { at: 0, pose: stage.pose, face: stage.face },
      { at: 0.05, prop: "scroll", id: "verse", slot: "right", lines },
    ];
    return {
      id: `scene${index + 1}`,
      title: scene.act,
      imagePath: "",
      narrationText: scene.narration,
      heading: stage.heading,
      enter: index === 0,
      beats,
    };
  });
  return { id: `bible-stick-${script.reference.replace(/\W+/g, "-").toLowerCase()}`, title: script.title, style: "line", chapters };
}
