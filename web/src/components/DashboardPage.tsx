import { Alert, Button, Card, EmptyState, Skeleton } from "@juninmd/sonido";
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
          <Button variant="secondary" className="mb-2" onClick={onBack}>← Console</Button>
          <h1 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900, color: "#e2e8f0" }}>📊 Dashboard de <span className="grad">métricas</span></h1>
          <p style={{ margin: "4px 0 0", fontSize: ".78rem", color: "#334155" }}>
            Evolução diária de views e comparação por janela etária (24h/72h/7d) — este link é enviado diariamente no Telegram.
          </p>
        </div>
        {data && <span style={{ fontSize: ".68rem", color: "#334155" }}>Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}</span>}
      </div>

      {!adminToken && <EmptyState className="mb-5" title="Configure o token admin no console para carregar o dashboard." />}
      {adminToken && error && <Alert tone="danger" className="mb-5">{error}</Alert>}
      {adminToken && loading && !data && <Skeleton className="mb-5" label="Carregando métricas…" rows={3} />}
      {adminToken && data && data.channels.length === 0 && <EmptyState className="mb-5" title="Nenhum canal ativo com snapshots ainda." description="O resumo diário aparece aqui assim que o pipeline registrar views." />}

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {data?.channels.map((c) => <ChannelSection key={c.channelId} channel={c} />)}
      </div>
    </div>
  );
}

function ChannelSection({ channel }: { channel: ChannelDashboard }) {
  return (
    <Card surface="glass" padding="lg" role="region" aria-label={channel.channelName}>
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
    </Card>
  );
}
