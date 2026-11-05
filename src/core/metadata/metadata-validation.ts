import { z } from "zod";
import { matchesLanguage } from "./language-check.js";
import { checkTitleFidelity } from "./title-fidelity.js";

// Template leftovers / textual nulls that must never reach a published field.
const PLACEHOLDER = /\b(presenter|unknown|undefined|null|n\/a|nao informado|não informado|nome do apresentador|lorem ipsum)\b|\{\{?|\}\}|\[nome|<nome/i;

export const metadataDraftSchema = z.object({
  title: z.string().trim().min(8).max(100),
  description: z.string().trim().min(10).max(4000).refine((v) => !/[<>]/.test(v), "description cannot contain angle brackets"),
  tags: z.array(z.string().trim().min(2).max(40)).max(15).default([]),
});

export type MetadataDraft = z.infer<typeof metadataDraftSchema>;

export interface MetadataContext {
  readonly language: string;
  readonly transcript: string;
  readonly presenter: string | null;
}

export interface MetadataCheck {
  readonly ok: boolean;
  readonly reasons: string[];
  readonly draft?: MetadataDraft;
}

export function findPlaceholders(text: string): boolean {
  return PLACEHOLDER.test(text);
}

/** Full validation of an editable metadata draft (schema, placeholders, language and fidelity). */
export function validateMetadataDraft(input: unknown, ctx: MetadataContext): MetadataCheck {
  const parsed = metadataDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reasons: parsed.error.issues.map((i) => `${i.path.join(".") || "draft"}: ${i.message}`) };
  }
  const draft = parsed.data;
  const reasons: string[] = [];
  for (const [field, value] of [["title", draft.title], ["description", draft.description], ["tags", draft.tags.join(" ")]] as const) {
    if (findPlaceholders(value)) reasons.push(`${field}: contém placeholder ou nulo textual`);
  }
  if (!matchesLanguage(draft.title, ctx.language)) reasons.push(`title: idioma diferente de ${ctx.language}`);
  if (!matchesLanguage(draft.description, ctx.language)) reasons.push(`description: idioma diferente de ${ctx.language}`);
  const fidelity = checkTitleFidelity(draft.title, ctx.transcript, ctx.presenter ? [ctx.presenter] : []);
  reasons.push(...fidelity.reasons.map((r) => `title: ${r}`));
  return { ok: reasons.length === 0, reasons, draft };
}
