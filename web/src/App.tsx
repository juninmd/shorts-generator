import { useMemo, useState } from "react";
import { useAdminConsole } from "./hooks/useAdminConsole";
import type { AdminChannelBundle } from "./types";

export default function App() {
  const {
    adminToken,
    setAdminToken,
    channels,
    runs,
    selectedChannelId,
    setSelectedChannelId,
    error,
    isPending,
    save,
    remove,
    test,
    run,
    refreshNow,
  } = useAdminConsole();
  const [draft, setDraft] = useState<AdminChannelBundle>(() => createEmptyBundle());
  const activeRuns = useMemo(() => runs.slice(0, 8), [runs]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.22),_transparent_35%),linear-gradient(160deg,_#111827,_#030712)] px-4 py-8 text-stone-100">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="card space-y-5 border-amber-500/20 bg-slate-950/80 backdrop-blur">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Control Plane</p>
              <h1 className="font-serif text-4xl text-amber-50">Gerenciamento de shorts por canal</h1>
            </div>
            <button className="btn-primary" onClick={() => setDraft(createEmptyBundle())}>Novo canal</button>
          </div>

          <label className="space-y-2 text-sm text-stone-300">
            Token admin
            <input className="input" type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="Bearer token" />
          </label>

          {error && <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              ID do canal
              <input className="input" value={draft.channel.id} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, id: event.target.value } }))} />
            </label>
            <label className="space-y-2 text-sm">
              Slug
              <input className="input" value={draft.channel.slug} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, slug: event.target.value } }))} />
            </label>
            <label className="space-y-2 text-sm">
              Nome
              <input className="input" value={draft.channel.name} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, name: event.target.value } }))} />
            </label>
            <label className="space-y-2 text-sm">
              Status
              <select className="input" value={draft.channel.status} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, status: event.target.value as "active" | "inactive" } }))}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
          </div>

          <label className="space-y-2 text-sm">
            Descrição
            <textarea className="input min-h-24" value={draft.channel.description} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, description: event.target.value } }))} />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              Logo path
              <input className="input" value={draft.channel.logoPath ?? ""} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, logoPath: event.target.value || null } }))} />
            </label>
            <label className="space-y-2 text-sm">
              Watermark
              <input className="input" value={draft.channel.watermarkText} onChange={(event) => setDraft(updateDraft(draft, { channel: { ...draft.channel, watermarkText: event.target.value } }))} />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              Fontes
              <textarea className="input min-h-28" value={stringifySources(draft)} onChange={(event) => setDraft(updateDraft(draft, { sources: parseSources(event.target.value) }))} placeholder="youtube_channel|Canal A|UC123" />
            </label>
            <label className="space-y-2 text-sm">
              Focos
              <textarea className="input min-h-28" value={stringifyFocuses(draft)} onChange={(event) => setDraft(updateDraft(draft, { focuses: parseFocuses(event.target.value) }))} placeholder="catolicos|Católicos" />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              YouTube client ID
              <input className="input" value={draft.publishingAccount?.clientId ?? ""} onChange={(event) => setDraft(updatePublishingField(draft, "clientId", event.target.value))} />
            </label>
            <label className="space-y-2 text-sm">
              YouTube client secret
              <input className="input" value={draft.publishingAccount?.clientSecret ?? ""} onChange={(event) => setDraft(updatePublishingField(draft, "clientSecret", event.target.value))} />
            </label>
            <label className="space-y-2 text-sm">
              Refresh token
              <input className="input" type="password" value={draft.publishingAccount?.refreshToken ?? ""} onChange={(event) => setDraft(updatePublishingField(draft, "refreshToken", event.target.value))} placeholder={draft.publishingAccount?.hasStoredToken ? "Token salvo; informe apenas para rotacionar" : "Cole o refresh token"} />
            </label>
            <label className="space-y-2 text-sm">
              Identificador da conta
              <input className="input" value={draft.publishingAccount?.accountIdentifier ?? ""} onChange={(event) => setDraft(updatePublishingField(draft, "accountIdentifier", event.target.value))} />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={isPending || !draft.channel.id} onClick={() => void save(draft)}>Salvar canal</button>
            <button className="rounded-full border border-amber-400/30 px-4 py-2 text-sm text-amber-100" disabled={isPending || !draft.channel.id} onClick={() => void test(draft.channel.id)}>Testar conexão</button>
            <button className="rounded-full border border-emerald-400/30 px-4 py-2 text-sm text-emerald-100" disabled={isPending || !draft.channel.id} onClick={() => void run(draft.channel.id)}>Rodar pipeline</button>
            <button className="rounded-full border border-rose-400/30 px-4 py-2 text-sm text-rose-100" disabled={isPending || !draft.channel.id} onClick={() => void remove(draft.channel.id)}>Excluir</button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="card bg-slate-950/80 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/70">Canais</p>
                <h2 className="font-serif text-2xl">Destinos configurados</h2>
              </div>
              <button className="rounded-full border border-cyan-400/30 px-3 py-1 text-sm" onClick={() => void refreshNow()}>Atualizar</button>
            </div>
            <div className="space-y-3">
              {channels.map((channel) => (
                <button key={channel.channel.id} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-amber-300/40" onClick={() => { setSelectedChannelId(channel.channel.id); setDraft(channel); }}>
                  <div className="flex items-center justify-between">
                    <strong>{channel.channel.name}</strong>
                    <span className="text-xs uppercase text-amber-200/70">{channel.channel.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone-400">{channel.sources.length} fontes · {channel.focuses.map((focus) => focus.label).join(", ") || "Sem focos"}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="card bg-slate-950/80 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/70">Execuções</p>
                <h2 className="font-serif text-2xl">Runs recentes</h2>
              </div>
              <select className="input max-w-52" value={selectedChannelId} onChange={(event) => setSelectedChannelId(event.target.value)}>
                <option value="">Todos os canais</option>
                {channels.map((channel) => <option key={channel.channel.id} value={channel.channel.id}>{channel.channel.name}</option>)}
              </select>
            </div>
            <div className="space-y-3">
              {activeRuns.map((runRecord) => (
                <div key={runRecord.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-stone-100">{runRecord.channelId}</span>
                    <span className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">{runRecord.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-stone-400">{runRecord.progress?.message ?? runRecord.errorMessage ?? "Sem progresso reportado ainda."}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function createEmptyBundle(): AdminChannelBundle {
  const now = new Date().toISOString();
  return {
    channel: { id: "", slug: "", name: "", description: "", status: "active", logoPath: null, watermarkText: "", createdAt: now, updatedAt: now },
    profile: { channelId: "", videoLimit: 3, minShortDuration: 15, maxShortDuration: 59, targetShorts: 3, videoQuery: null, sortByViews: false, aiProvider: "ollama", aiModel: "gemma3:1b" },
    focuses: [],
    sources: [],
    publishingAccount: { provider: "youtube", label: "YouTube", status: "active", accountIdentifier: "", clientId: "", clientSecret: "", refreshToken: "" },
  };
}

function updateDraft(draft: AdminChannelBundle, patch: Partial<AdminChannelBundle>): AdminChannelBundle {
  return { ...draft, ...patch, profile: patch.profile ?? draft.profile, channel: patch.channel ?? draft.channel };
}

function updatePublishingField(draft: AdminChannelBundle, field: keyof NonNullable<AdminChannelBundle["publishingAccount"]>, value: string): AdminChannelBundle {
  return { ...draft, publishingAccount: { ...(draft.publishingAccount ?? createEmptyBundle().publishingAccount!), [field]: value } };
}

function stringifySources(draft: AdminChannelBundle): string {
  return draft.sources.map((source) => `${source.kind}|${source.label}|${source.value}`).join("\n");
}

function parseSources(raw: string): AdminChannelBundle["sources"] {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [kind, label, value] = line.split("|");
    return { kind: (kind as AdminChannelBundle["sources"][number]["kind"]) || "youtube_channel", label: label || value || "", value: value || label || "" };
  });
}

function stringifyFocuses(draft: AdminChannelBundle): string {
  return draft.focuses.map((focus) => `${focus.key}|${focus.label}`).join("\n");
}

function parseFocuses(raw: string): AdminChannelBundle["focuses"] {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [key, label] = line.split("|");
    return { key: (key as AdminChannelBundle["focuses"][number]["key"]) || "tecnologia", label: label || key };
  });
}
