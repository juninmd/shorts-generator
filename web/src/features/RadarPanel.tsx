import { useEffect, useState } from "react";
import { Alert } from "@juninmd/sonido";
import { createCut } from "../api";
import { errorMessage, useAnalysis } from "../hooks/useChannelTools";
import type { SuggestedCut } from "../types";
import { RadarMap } from "./RadarMap";

const LOOKUP_DELAY_MS = 400;

export function RadarPanel({ adminToken, channelId }: { adminToken: string; channelId: string }) {
  const [videoId, setVideoId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Busca só quando a digitação pausa: uma requisição (e um alerta) por ID, não por tecla.
  const [lookupId, setLookupId] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setLookupId(videoId.trim()), LOOKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [videoId]);
  const settled = lookupId === videoId.trim();
  const { analysis, error } = useAnalysis(adminToken, channelId, lookupId);
  const [saveError, setSaveError] = useState<string | null>(null);

  const approve = async (cut: SuggestedCut) => {
    setNotice(null);
    setSaveError(null);
    try {
      await createCut(adminToken, channelId, { sourceVideoId: lookupId, title: cut.title, startSec: cut.startSec, endSec: cut.endSec });
      setNotice(`Corte "${cut.title}" salvo em Cortes manuais.`);
    } catch (err) {
      setSaveError(errorMessage(err));
    }
  };

  if (!adminToken || !channelId) {
    return <p className="glass-inset p-4 text-sm text-slate-400">Escolha um canal e informe o token para usar o Radar.</p>;
  }

  return (
    <section className="space-y-4">
      <input className="field max-w-md" aria-label="ID do vídeo-fonte" placeholder="ID do vídeo-fonte no YouTube" value={videoId} onChange={(e) => { setVideoId(e.target.value); setNotice(null); setSaveError(null); }} />
      {!videoId.trim() && <p className="text-sm text-slate-500">Informe o ID de um vídeo já analisado.</p>}
      {lookupId && settled && error && <Alert tone="danger">Ainda não há análise para este vídeo. ({error})</Alert>}
      {analysis && <RadarMap durationSec={analysis.durationSec} analysis={analysis.analysis} onApprove={(cut) => void approve(cut)} />}
      {notice && <Alert tone="success">{notice}</Alert>}
      {saveError && <Alert tone="danger">{saveError}</Alert>}
    </section>
  );
}
