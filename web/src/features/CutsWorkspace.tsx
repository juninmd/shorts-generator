import { useState, type FormEvent } from "react";
import { Alert, Button, EmptyState } from "@juninmd/sonido";
import { useCuts, errorMessage } from "../hooks/useChannelTools";
import type { ManualCut } from "../types";
import { ShortPreview } from "./ShortPreview";

export function CutsWorkspace({ adminToken, channelId }: { adminToken: string; channelId: string }) {
  const { cuts, error, add, remove } = useCuts(adminToken, channelId);
  const [sourceVideoId, setSourceVideoId] = useState("");
  const [title, setTitle] = useState("");
  const [startSec, setStartSec] = useState("0");
  const [endSec, setEndSec] = useState("30");
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ManualCut | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      await add({ sourceVideoId, title, startSec: Number(startSec), endSec: Number(endSec) });
      setTitle("");
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  const removeCut = async (cut: ManualCut) => {
    setFormError(null);
    try {
      await remove(cut.id);
      // The preview must not keep showing a cut that no longer exists.
      setSelected((current) => (current?.id === cut.id ? null : current));
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  if (!adminToken || !channelId) {
    return <p className="glass-inset p-4 text-sm text-slate-400">Escolha um canal e informe o token para montar cortes.</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="glass p-5">
        <h2 className="text-base font-extrabold text-slate-100">Cortes manuais</h2>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Novo corte">
          <input className="field" aria-label="ID do vídeo" placeholder="ID do vídeo no YouTube" value={sourceVideoId} onChange={(e) => setSourceVideoId(e.target.value)} />
          <input className="field" aria-label="Título do corte" placeholder="Título do corte" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="field" aria-label="Início (s)" type="number" min={0} value={startSec} onChange={(e) => setStartSec(e.target.value)} />
          <input className="field" aria-label="Fim (s)" type="number" min={0} value={endSec} onChange={(e) => setEndSec(e.target.value)} />
          <Button className="sm:col-span-2" type="submit">Salvar corte</Button>
        </form>
        {formError && <Alert tone="danger" className="mt-3">{formError}</Alert>}
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        <ul className="mt-5 space-y-2">
          {cuts.map((cut) => (
            <li key={cut.id} className="glass-inset flex items-center gap-3 p-3">
              <button className="flex-1 truncate text-left text-sm text-slate-200" onClick={() => setSelected(cut)}>{cut.title}</button>
              <span className="font-mono text-xs text-slate-500">{cut.startSec}s → {cut.endSec}s</span>
              <Button variant="danger" size="sm" aria-label={`Excluir ${cut.title}`} onClick={() => void removeCut(cut)}>Excluir</Button>
            </li>
          ))}
        </ul>
        {cuts.length === 0 && <EmptyState className="mt-4" title="Nenhum corte manual ainda." description="Marque o início e o fim de um trecho para montar o primeiro." />}
      </section>
      <aside className="glass p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-300">Prévia</h3>
        <ShortPreview captions={selected?.title ?? "Escolha um corte para ver a prévia"} />
      </aside>
    </div>
  );
}
