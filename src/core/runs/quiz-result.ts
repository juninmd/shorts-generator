import type { runQuizPipeline } from "../quiz/quiz-pipeline.js";
import type { PipelineResult } from "../../types.js";

export function mapQuizResultToPipeline(
  result: Awaited<ReturnType<typeof runQuizPipeline>>,
  channelName: string,
): PipelineResult {
  if (!result.quiz || !result.outputPath) {
    return { videoId: "quiz", videoTitle: result.quiz?.tema ?? "quiz", channelName, shorts: [], errors: result.reasons.map((r) => `quiz retido: ${r}`), processingTimeMs: 0 };
  }
  return mapRenderedQuiz({ ...result, quiz: result.quiz, outputPath: result.outputPath }, channelName);
}

function mapRenderedQuiz(
  result: Awaited<ReturnType<typeof runQuizPipeline>> & { quiz: NonNullable<Awaited<ReturnType<typeof runQuizPipeline>>["quiz"]>; outputPath: string },
  channelName: string,
): PipelineResult {
  return {
    videoId: "quiz",
    videoTitle: result.quiz.tema,
    channelName,
    shorts: [
      {
        id: "quiz-short",
        clip: {
          id: "quiz-short",
          videoId: "quiz",
          title: result.quiz.tema,
          description: result.quiz.fato_curioso,
          startTime: 0,
          endTime: 0,
          duration: 0,
          viralScore: 100,
          reason: "Quiz",
          transcript: [],
          words: [],
          hashtags: ["quiz"],
        },
        outputPath: result.outputPath,
        subtitlePath: "",
        originalVideoUrl: "",
        originalVideoTitle: "",
        channelName,
        status: "completed",
        publicationStatus: result.outcome,
        createdAt: new Date().toISOString(),
      },
    ],
    errors: [],
    processingTimeMs: 0,
  };
}
