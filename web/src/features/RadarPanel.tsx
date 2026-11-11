import { useState } from "react";
import { createCut } from "../api";
import { errorMessage, useAnalysis } from "../hooks/useChannelTools";
import type { SuggestedCut } from "../types";
import { RadarMap } from "./RadarMap";

export function RadarPanel({ adminToken, channelId }: { adminToken: string; channelId: string }) {
  const [videoId, setVideoId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const { analysis, error } = useAnalysis(adminToken, channelId, videoId.trim());

  const approve = async (cut: SuggestedCut) => {
    try {
      await createCut(adminToken, channelId, { sourceVideoId: videoId.trim(), title: cut.title, startSec: cut.startSec, endSec: cut.endSec });
      setNotice(`Corte "${cut.title}" salvo em Cortes manuais.`);
    } catch (err) {
      setNotice(errorMessage(err));
    }
  };

  if (!adminToken || !channelId) {
    return <p className="glass-inset p-4 text-sm text-slate-400">Escolha um canal e informe o token para usar o Radar.</p>;
  }

  return (
    <section className="space-y-4">
      <input className="field max-w-md" aria-label="ID do vídeo-fonte" placeholder="ID do vídeo-fonte no YouTube" value={videoId} onChange={(e) => setVideoId(e.target.value)} />
      {!videoId.trim() && <p className="text-sm text-slate-500">Informe o ID de um vídeo já analisado.</p>}
      {videoId.trim() && error && <p role="alert" className="text-sm text-amber-300">Ainda não há análise para este vídeo. ({error})</p>}
      {analysis && <RadarMap durationSec={analysis.durationSec} analysis={analysis.analysis} onApprove={(cut) => void approve(cut)} />}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
    </section>
  );
}
