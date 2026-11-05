const SOURCE_LINE = /^.*(v[íi]deo original|fonte|source)\s*:.*$/gim;
const AI_NOTICE = "📱 Shorts gerado por IA - Cortado e editado automaticamente";

/** Removes any user/LLM supplied source lines so the fixed footer stays the single source of truth. */
export function stripSourceLines(body: string): string {
  return body.replace(SOURCE_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Final description = editable body + fixed attribution footer.
 * The original link lives outside the editable text, so no edit can drop it.
 */
export function composeDescription(body: string, sourceUrl: string, presenter: string | null): string {
  if (!sourceUrl.trim()) throw new Error("composeDescription: source URL is mandatory");
  const footer = [presenter ? `🗣️ Apresentador: ${presenter}` : null, `🎥 Vídeo Original: ${sourceUrl}`, AI_NOTICE]
    .filter(Boolean)
    .join("\n");
  const cleanBody = stripSourceLines(body);
  return cleanBody ? `${cleanBody}\n\n${footer}` : footer;
}

export function hasSourceAttribution(description: string, sourceUrl: string): boolean {
  return description.includes(`🎥 Vídeo Original: ${sourceUrl}`);
}
