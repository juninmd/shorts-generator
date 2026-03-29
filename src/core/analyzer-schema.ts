import { z } from "zod";

export const ClipItemSchema = z.object({
  title: z.string().describe("Título chamativo e relevante para o trecho"),
  description: z.string().describe("Breve resumo do conteúdo deste clipe"),
  contentValue: z.string().describe("Explique o valor deste trecho (ex: uma oração, um ensinamento, uma reflexão profunda)"),
  startTime: z.number().describe("Tempo de início em segundos"),
  endTime: z.number().describe("Tempo de fim em segundos"),
  viralScore: z.number().describe("Pontuação de relevância narrativa de 1 a 10"),
  reason: z.string().describe("Por que este momento foi escolhido?"),
  hashtags: z.array(z.string()).describe("Hashtags relevantes para o Shorts"),
});

export const ClipSchema = z.object({
  clips: z.array(ClipItemSchema),
});

export type ClipItem = z.infer<typeof ClipItemSchema>;
