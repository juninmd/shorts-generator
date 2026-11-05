import { z } from "zod";

export const CONTENT_FORMATS = ["cuts", "quiz"] as const;
export const PUBLISH_MODES = ["auto", "review"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export type PublishMode = (typeof PUBLISH_MODES)[number];

const themeList = z.array(z.string().trim().min(2).max(60)).max(30);

export const editorialProfileSchema = z.object({
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default("pt-BR"),
  allowedThemes: themeList.default([]),
  excludedThemes: themeList.default([]),
  tone: z.string().max(200).default(""),
  allowedFormats: z.array(z.enum(CONTENT_FORMATS)).min(1).default(["cuts", "quiz"]),
  publishMode: z.enum(PUBLISH_MODES).default("auto"),
});

export type EditorialProfile = z.infer<typeof editorialProfileSchema>;

// Defaults preserve pre-migration behaviour: pt-BR, no theme filter, both formats, auto publish.
export const DEFAULT_EDITORIAL_PROFILE: EditorialProfile = editorialProfileSchema.parse({});

// Presets are suggestions for the panel only; nothing applies them to real channels.
export const EDITORIAL_PRESETS: Record<string, { label: string; profile: EditorialProfile }> = {
  "quiz-curiosidades": {
    label: "Quizzes e curiosidades",
    profile: editorialProfileSchema.parse({
      allowedThemes: ["conhecimentos gerais", "geografia", "história", "ciência", "curiosidades", "futebol"],
      excludedThemes: ["política partidária", "tragédia", "violência"],
      tone: "leve, desafiador e acolhedor; sem sensacionalismo",
      allowedFormats: ["quiz", "cuts"],
      publishMode: "review",
    }),
  },
  catolico: {
    label: "Conteúdo católico",
    profile: editorialProfileSchema.parse({
      allowedThemes: ["fé católica", "oração", "santos", "bíblia", "sacramentos", "vida espiritual"],
      excludedThemes: ["política partidária", "polêmica pessoal", "ataque a pessoas"],
      tone: "respeitoso, fiel ao magistério e sem distorcer a fala do pregador",
      allowedFormats: ["cuts"],
      publishMode: "review",
    }),
  },
};

function parseJsonArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Build a profile from DB columns (JSON stored as TEXT); invalid values fall back to explicit defaults. */
export function editorialProfileFromRow(row: Record<string, unknown>): EditorialProfile {
  const parsed = editorialProfileSchema.safeParse({
    language: row.language ?? undefined,
    allowedThemes: parseJsonArray(row.allowed_themes),
    excludedThemes: parseJsonArray(row.excluded_themes),
    tone: row.tone ?? undefined,
    allowedFormats: parseJsonArray(row.allowed_formats),
    publishMode: row.publish_mode ?? undefined,
  });
  return parsed.success ? parsed.data : DEFAULT_EDITORIAL_PROFILE;
}

export function languageLabel(language: string): string {
  const labels: Record<string, string> = { "pt-BR": "português do Brasil", pt: "português", en: "inglês", es: "espanhol" };
  return labels[language] ?? language;
}

/** Prompt block shared by discovery, review, quiz and metadata prompts. */
export function buildEditorialPromptBlock(profile: EditorialProfile, focusLabels: readonly string[] = []): string {
  const lines = ["PERFIL EDITORIAL DO CANAL DE DESTINO:", `- Idioma obrigatório: ${languageLabel(profile.language)} (${profile.language})`];
  if (focusLabels.length) lines.push(`- Focos do canal: ${focusLabels.join(", ")}`);
  if (profile.allowedThemes.length) lines.push(`- Temas permitidos: ${profile.allowedThemes.join(", ")}`);
  if (profile.excludedThemes.length) lines.push(`- Temas PROIBIDOS (descarte): ${profile.excludedThemes.join(", ")}`);
  if (profile.tone) lines.push(`- Tom: ${profile.tone}`);
  lines.push("- Preserve o contexto e a autoria da fala; não atribua a outra pessoa nem transforme opinião em fato.");
  return `\n${lines.join("\n")}\n`;
}
