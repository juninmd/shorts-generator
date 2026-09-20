import type { DailyMetricPoint } from "../types";

const W = 640;
const H = 160;
const PAD = 12;

/** Dependency-free area+line chart for a channel's daily view series. */
export function MetricsSparkline({ series }: { series: DailyMetricPoint[] }) {
  if (series.length === 0) {
    return <EmptyState />;
  }
  const values = series.map((p) => p.totalViews);
  const max = Math.max(...values, 1);
  const stepX = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
  const points = series.map((p, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (p.totalViews / max) * (H - PAD * 2);
    return { x, y, point: p };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]!.x.toFixed(1)} ${H - PAD} L ${points[0]!.x.toFixed(1)} ${H - PAD} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução diária de views">
      <defs>
        <linearGradient id="sparklineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparklineFill)" stroke="none" />
      <path d={linePath} fill="none" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(({ x, y, point }) => (
        <g key={point.day}>
          <circle cx={x} cy={y} r="3.5" fill="#050914" stroke="#a5b4fc" strokeWidth="2" />
          <title>{`${point.day}: ${point.totalViews.toLocaleString("pt-BR")} views (${point.videoCount} vídeos)`}</title>
        </g>
      ))}
    </svg>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "36px 0", textAlign: "center", color: "#334155", fontSize: ".8rem" }}>
      Ainda sem snapshots suficientes para desenhar a curva.
    </div>
  );
}
