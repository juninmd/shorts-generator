import type { WindowGroup } from "../types";

/** Top/flop videos for one age-comparable window (24h/72h/7d). */
export function WindowLeaderboard({ group }: { group: WindowGroup }) {
  return (
    <div className="glass-inset" style={{ padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: ".78rem", color: "#e2e8f0" }}>Janela {group.window}</span>
        <span style={{ fontSize: ".68rem", color: "#334155" }}>{group.sampleSize} vídeos maduros{group.immature > 0 ? ` · ${group.immature} aguardando` : ""}</span>
      </div>
      <Row label="Mediana de views" value={group.medianViews?.toLocaleString("pt-BR") ?? "—"} />
      <List title="🔥 Top" items={group.top} color="#4ade80" />
      <List title="📉 Abaixo da mediana" items={group.flop} color="#f87171" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "#64748b", marginBottom: 8 }}>
      <span>{label}</span>
      <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function List({ title, items, color }: { title: string; items: WindowGroup["top"]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: ".68rem", color, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {items.slice(0, 4).map((v) => (
        <div key={v.youtubeVideoId} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: ".72rem", color: "#94a3b8", padding: "3px 0", borderTop: "1px solid rgba(255,255,255,.04)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</span>
          <span style={{ flexShrink: 0, color: "#e2e8f0" }}>{v.views.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}
