import type { ChangeEvent } from "react";
import type { AdminChannelBundle } from "../types";
import { parseSources, stringifySources } from "../utils";

export type Update = (patch: (draft: AdminChannelBundle) => AdminChannelBundle) => void;

export function StepType({ draft, update }: { draft: AdminChannelBundle; update: Update }) {
  const choose = (channelType: "cuts" | "quiz") => update((d) => ({ ...d, channel: { ...d.channel, channelType } }));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["cuts", "quiz"] as const).map((type) => (
        <button key={type} type="button" aria-pressed={draft.channel.channelType === type} onClick={() => choose(type)}
          className={`glass-inset p-4 text-left ${draft.channel.channelType === type ? "ring-2 ring-indigo-400" : ""}`}>
          <span className="block font-bold text-slate-100">{type === "cuts" ? "Cortes" : "Quiz"}</span>
          <span className="text-sm text-slate-400">{type === "cuts" ? "A IA escolhe trechos de vídeos de canais." : "A IA cria perguntas sobre temas."}</span>
        </button>
      ))}
    </div>
  );
}

export function StepIdentity({ draft, update }: { draft: AdminChannelBundle; update: Update }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input className="field" aria-label="Nome do canal" placeholder="Nome do canal" value={draft.channel.name}
        onChange={(e) => update((d) => ({ ...d, channel: { ...d.channel, name: e.target.value } }))} />
      <input className="field" aria-label="ID único" placeholder="meu-canal-01" value={draft.channel.id}
        onChange={(e) => update((d) => ({ ...d, channel: { ...d.channel, id: e.target.value.toLowerCase() } }))} />
      <input className="field" aria-label="Marca d'água" placeholder="@MeuCanal" value={draft.channel.watermarkText}
        onChange={(e) => update((d) => ({ ...d, channel: { ...d.channel, watermarkText: e.target.value } }))} />
    </div>
  );
}

export function StepSources({ draft, update }: { draft: AdminChannelBundle; update: Update }) {
  if (draft.channel.channelType === "quiz") {
    return <p className="text-sm text-slate-400">Quiz não usa fontes: a IA gera o conteúdo a partir dos focos configurados depois.</p>;
  }
  return (
    <textarea className="field min-h-[120px]" aria-label="Fontes de vídeo" placeholder={"youtube_handle|Frei Gil|@FreiGilson"}
      value={stringifySources(draft)} onChange={(e) => update((d) => ({ ...d, sources: parseSources(e.target.value) }))} />
  );
}

export function StepRules({ draft, update }: { draft: AdminChannelBundle; update: Update }) {
  const num = (key: "videoLimit" | "minShortDuration" | "maxShortDuration") => (e: ChangeEvent<HTMLInputElement>) =>
    update((d) => ({ ...d, profile: { ...d.profile, [key]: Number(e.target.value) } }));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm text-slate-400">Vídeos por execução<input className="field mt-1" type="number" min={1} value={draft.profile.videoLimit} onChange={num("videoLimit")} /></label>
      <label className="text-sm text-slate-400">Duração mín (s)<input className="field mt-1" type="number" min={1} value={draft.profile.minShortDuration} onChange={num("minShortDuration")} /></label>
      <label className="text-sm text-slate-400">Duração máx (s)<input className="field mt-1" type="number" min={1} value={draft.profile.maxShortDuration} onChange={num("maxShortDuration")} /></label>
    </div>
  );
}

export function StepReview({ draft }: { draft: AdminChannelBundle }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <dt className="text-slate-500">Canal</dt><dd className="text-slate-200">{draft.channel.name || "—"}</dd>
      <dt className="text-slate-500">Tipo</dt><dd className="text-slate-200">{draft.channel.channelType === "cuts" ? "Cortes" : "Quiz"}</dd>
      <dt className="text-slate-500">Fontes</dt><dd className="text-slate-200">{draft.sources.length}</dd>
      <dt className="text-slate-500">Duração</dt><dd className="text-slate-200">{draft.profile.minShortDuration}–{draft.profile.maxShortDuration}s</dd>
    </dl>
  );
}
