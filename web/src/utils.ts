export function parseSources(raw: string): any {
  return raw.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [kind, label, value] = l.split("|");
    return { kind: kind || "youtube_channel", label: label || value || "", value: value || label || "" };
  });
}

export function stringifySources(d: any) { return d.sources.map((s: any) => `${s.kind}|${s.label}|${s.value}`).join("\n"); }

export function parseFocuses(raw: string): any {
  return raw.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [key, label] = l.split("|");
    return { key: key || "tecnologia", label: label || key };
  });
}

export function stringifyFocuses(d: any) { return d.focuses.map((f: any) => `${f.key}|${f.label}`).join("\n"); }

export function dotClass(s: string) { return s === "processing" ? "dot dot-processing" : s === "completed" ? "dot dot-completed" : s === "failed" ? "dot dot-failed" : "dot dot-pending"; }

/** Tom do `Badge` do Sonido para o status de uma execução. */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export function badgeTone(s: string): BadgeTone {
  return s === "processing" ? "warning" : s === "completed" ? "success" : s === "failed" ? "danger" : "neutral";
}

export function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  // Clock skew can put the server's timestamp slightly in the future.
  const d = Math.max(0, (Date.now() - t) / 1000);
  if (d < 60) return `${Math.round(d)}s atrás`;
  if (d < 3600) return `${Math.round(d / 60)}m atrás`;
  return `${Math.round(d / 3600)}h atrás`;
}
