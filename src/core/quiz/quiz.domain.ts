import { z } from "zod";

export const quizSchema = z.object({
  tema: z.string(),
  pergunta: z.string(),
  opcoes: z.object({
    A: z.string(),
    B: z.string(),
    C: z.string(),
    D: z.string(),
  }),
  resposta_correta: z.enum(["A", "B", "C", "D"]),
  fato_curioso: z.string(),
});

export type Quiz = z.infer<typeof quizSchema>;
