import { useState } from "react";
import { bandGeometry, energyPath, formatTime, RADAR_H, RADAR_W } from "./radarGeometry";
import type { SourceAnalysisPayload, SuggestedCut } from "../types";
import { ShortPreview } from "./ShortPreview";

export function RadarMap({ durationSec, analysis, onApprove }: { durationSec: number; analysis: SourceAnalysisPayload; onApprove: (cut: SuggestedCut) => void }) {
  const [selected, setSelected] = useState(0);
  const suggestion = analysis.suggestions[selected];
  const replayMax = Math.max(1, ...analysis.replay);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="space-y-4">
        <svg viewBox={`0 0 ${RADAR_W} ${RADAR_H}`} className="glass w-full p-2" role="img" aria-label="Mapa do vídeo-fonte">
          <path d={energyPath(analysis.energy)} fill="#818cf8" fillOpacity={0.2} stroke="#818cf8" strokeWidth={1.5} />
          {analysis.replay.map((value, i) => {
            const h = (value / replayMax) * 16;
            const x = (i / Math.max(1, analysis.replay.length - 1)) * RADAR_W;
            return <rect key={i} x={x - 1.5} y={164 - h} width={3} height={h} fill="#94a3b8" fillOpacity={0.6} />;
          })}
          {analysis.speakerLanes.map((lane, i) => {
            const { x, width } = bandGeometry(lane.startSec, lane.endSec, durationSec);
            return <rect key={`lane-${i}`} x={x} y={134} width={Math.max(0, width - 2)} height={5} rx={2} fill={lane.speaker % 2 ? "#34d399" : "#fbbf24"} />;
          })}
          {analysis.suggestions.map((cut, i) => {
            const { x, width } = bandGeometry(cut.startSec, cut.endSec, durationSec);
            return (
              <g key={`cut-${i}`} role="button" tabIndex={0} aria-label={`Corte ${cut.title}`} onClick={() => setSelected(i)} onKeyDown={(e) => e.key === "Enter" && setSelected(i)} style={{ cursor: "pointer" }}>
                <rect x={x} y={4} width={width} height={126} rx={6} fill="#818cf8" fillOpacity={i === selected ? 0.4 : 0.15} stroke="#818cf8" strokeWidth={1.5} />
                <text x={x + 6} y={22} fill="#e2e8f0" fontSize={14} fontWeight={700}>{cut.viralScore}</text>
              </g>
            );
          })}
        </svg>
        {suggestion && (
          <div className="glass-inset p-4">
            <p className="font-mono text-xs text-slate-500">{formatTime(suggestion.startSec)} → {formatTime(suggestion.endSec)}</p>
            <h3 className="mt-1 font-bold text-slate-100">{suggestion.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{suggestion.reason}</p>
            <button className="btn btn-green mt-3" onClick={() => onApprove(suggestion)}>Aprovar corte</button>
          </div>
        )}
      </div>
      <aside className="glass p-5">
        <ShortPreview captions={suggestion?.title ?? ""} />
      </aside>
    </div>
  );
}
