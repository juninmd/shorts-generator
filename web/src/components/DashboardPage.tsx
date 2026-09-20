import type { ReactNode } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import type { ChannelDashboard } from "../types";
import { MetricsSparkline } from "./MetricsSparkline";
import { WindowLeaderboard } from "./WindowLeaderboard";

export function DashboardPage({ adminToken, onBack }: { adminToken: string; onBack: () => void }) {
  const { data, error, loading } = useDashboardData(adminToken);

  return (
    <div style={{ minHeight: "100vh", background: "#050914", padding: "28px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 10 }}>← Console</button>
          <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900, color: "#e2e8f0" }}>📊 Dashboard de <span className="grad">métricas</span></h1>
          <p style={{ margin: "4px 0 0", fontSize: ".78rem", color: "#334155" }}>
            Evolução diária de views e comparação por janela etária (24h/72h/7d) — este link é enviado diariamente no Telegram.
          </p>
        </div>
        {data && <span style={{ fontSize: ".68rem", color: "#334155" }}>Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}</span>}
      </div>

      {!adminToken && <Notice>Configure o token admin no console para carregar o dashboard.</Notice>}
      {adminToken && error && <Notice tone="err">⚠ {error}</Notice>}
      {adminToken && loading && !data && <Notice>Carregando métricas…</Notice>}
      {adminToken && data && data.channels.length === 0 && <Notice>Nenhum canal ativo com snapshots ainda.</Notice>}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {data?.channels.map((c) => <ChannelSection key={c.channelId} channel={c} />)}
      </div>
    </div>
  );
}

function ChannelSection({ channel }: { channel: ChannelDashboard }) {
  return (
    <section className="glass" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#e2e8f0" }}>{channel.channelName}</h2>
        <span style={{ fontSize: ".68rem", color: "#334155", textTransform: "uppercase", letterSpacing: ".06em" }}>{channel.channelType}</span>
      </div>
      <MetricsSparkline series={channel.series} />
      {channel.windows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 18 }}>
          {channel.windows.map((g) => <WindowLeaderboard key={g.key + g.window} group={g} />)}
        </div>
      )}
    </section>
  );
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "err" }) {
  const isErr = tone === "err";
  return (
    <div className="glass-inset" style={{ padding: "14px 18px", marginBottom: 20, color: isErr ? "#fca5a5" : "#94a3b8", fontSize: ".82rem" }}>
      {children}
    </div>
  );
}
