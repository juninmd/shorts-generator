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

export function badgeClass(s: string) { return s === "processing" ? "badge badge-amber" : s === "completed" ? "badge badge-green" : s === "failed" ? "badge badge-red" : "badge badge-slate"; }

export function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.round(d)}s atrás`;
  if (d < 3600) return `${Math.round(d / 60)}m atrás`;
  return `${Math.round(d / 3600)}h atrás`;
}
