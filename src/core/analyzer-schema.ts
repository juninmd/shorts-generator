import { z } from "zod";

export const ClipItemSchema = z.object({
  title: z.string().describe("Título chamativo e relevante para o trecho"),
  presenter: z.string().optional().describe("Nome (ou sobrenome) da pessoa que está falando/apresentando neste trecho, se identificável. Deixe vazio se desconhecido."),
  description: z.string().describe("Breve resumo do conteúdo deste clipe"),
  contentValue: z.string().describe("Explique o valor deste trecho (ex: uma oração, um ensinamento, uma reflexão profunda)"),
  hookText: z.string().optional().describe("Primeira frase literal do corte"),
  payoffText: z.string().optional().describe("Última frase literal do corte"),
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
