import { z } from "zod";

export const manualCutSchema = z
  .object({
    sourceVideoId: z.string().min(3).max(40),
    title: z.string().min(1).max(120),
    startSec: z.number().min(0).max(86400),
    endSec: z.number().min(0).max(86400),
  })
  .refine((cut) => cut.endSec - cut.startSec >= 3 && cut.endSec - cut.startSec <= 180, {
    message: "A duração do corte deve estar entre 3 e 180 segundos",
    path: ["endSec"],
  });

export const scheduleEntrySchema = z
  .object({
    runAt: z.string().datetime(),
    kind: z.enum(["programmed", "manual"]),
    cutId: z.string().min(1).nullable().optional(),
  })
  .refine((entry) => entry.kind !== "manual" || !!entry.cutId, {
    message: "Agendamento manual precisa de um corte",
    path: ["cutId"],
  });
