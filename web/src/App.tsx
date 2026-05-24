import { useMemo, useState, type ReactNode } from "react";
import { useAdminConsole } from "./hooks/useAdminConsole";
import type { AdminChannelBundle } from "./types";

// ─── Tiny SVG icons ───────────────────────────────────────────────────────────
const Ico = {
  Play:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>,
  Save:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>,
  Trash:    ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  Refresh:  ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Plus:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Check:    ()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20,6 9,17 4,12"/></svg>,
  Info:     ()=><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  Scissors: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/></svg>,
  Sparkles: ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.88 5.76L20 10.5l-5.12 3.38L16.76 20 12 17l-4.76 3 1.88-6.12L4 10.5l6.12-1.74z"/></svg>,
  Activity: ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>,
  Key:      ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Book:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  Zap:      ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>,
  Arrow:    ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>,
  Channel:  ()=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17,2 12,7 7,2"/></svg>,
  Wifi:     ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>,
};

// ─── Small building blocks ────────────────────────────────────────────────────
function Tooltip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <span className="tooltip-wrap">
      {children}
      <span className="tooltip">{tip}</span>
    </span>
  );
}

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="label">
      {children}
      {hint && <span className="label-hint">— {hint}</span>}
    </span>
  );
}

function Field({ label, hint, tip, ...props }: { label: string; hint?: string; tip?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <Label hint={hint}>{label}</Label>
        {tip && <Tooltip tip={tip}><span style={{ color: "#475569", cursor: "help", display: "flex" }}><Ico.Info /></span></Tooltip>}
      </div>
      <input className="field" {...props} />
    </label>
  );
}

function FieldArea({ label, hint, tip, ...props }: { label: string; hint?: string; tip?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <Label hint={hint}>{label}</Label>
        {tip && <Tooltip tip={tip}><span style={{ color: "#475569", cursor: "help", display: "flex" }}><Ico.Info /></span></Tooltip>}
      </div>
      <textarea className="field" style={{ resize: "vertical", minHeight: 90 }} {...props} />
    </label>
  );
}

function FieldSelect({ label, hint, tip, children, ...props }: { label: string; hint?: string; tip?: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        <Label hint={hint}>{label}</Label>
        {tip && <Tooltip tip={tip}><span style={{ color: "#475569", cursor: "help", display: "flex" }}><Ico.Info /></span></Tooltip>}
      </div>
      <select className="field" {...props}>{children}</select>
    </label>
  );
}

// ─── Wizard step indicator ────────────────────────────────────────────────────
function WizardBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < total - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div className={`step-circle ${i < step ? "step-done" : i === step ? "step-active" : "step-idle"}`}>
              {i < step ? <Ico.Check /> : i + 1}
            </div>
            <span style={{ fontSize: ".68rem", fontWeight: 600, color: i === step ? "#a5b4fc" : i < step ? "#6ee7b7" : "#334155", whiteSpace: "nowrap" }}>{labels[i]}</span>
          </div>
          {i < total - 1 && (
            <div style={{ flex: 1, height: 2, background: i < step ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.06)", margin: "0 8px", marginBottom: 20, borderRadius: 2 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function createEmptyBundle(): AdminChannelBundle {
  const now = new Date().toISOString();
  return {
    channel: { id: "", slug: "", name: "", description: "", status: "active", logoPath: null, watermarkText: "", channelType: "cuts", createdAt: now, updatedAt: now },
    profile: { channelId: "", videoLimit: 3, minShortDuration: 15, maxShortDuration: 59, targetShorts: 3, videoQuery: null, sortByViews: false, aiProvider: "ollama", aiModel: "gemma3:1b" },
    focuses: [], sources: [], publishingAccounts: [],
  };
}
const ch = (d: AdminChannelBundle, p: Partial<AdminChannelBundle["channel"]>): AdminChannelBundle => ({ ...d, channel: { ...d.channel, ...p } });
const pr = (d: AdminChannelBundle, p: Partial<AdminChannelBundle["profile"]>): AdminChannelBundle => ({ ...d, profile: { ...d.profile, ...p } });

function parseSources(raw: string): AdminChannelBundle["sources"] {
  return raw.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [kind, label, value] = l.split("|");
    return { kind: (kind as AdminChannelBundle["sources"][number]["kind"]) || "youtube_channel", label: label || value || "", value: value || label || "" };
  });
}
function stringifySources(d: AdminChannelBundle) { return d.sources.map(s => `${s.kind}|${s.label}|${s.value}`).join("\n"); }
function parseFocuses(raw: string): AdminChannelBundle["focuses"] {
  return raw.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const [key, label] = l.split("|");
    return { key: (key as AdminChannelBundle["focuses"][number]["key"]) || "tecnologia", label: label || key };
  });
}
function stringifyFocuses(d: AdminChannelBundle) { return d.focuses.map(f => `${f.key}|${f.label}`).join("\n"); }

function dotClass(s: string) { return s === "processing" ? "dot dot-processing" : s === "completed" ? "dot dot-completed" : s === "failed" ? "dot dot-failed" : "dot dot-pending"; }
function badgeClass(s: string) { return s === "processing" ? "badge badge-amber" : s === "completed" ? "badge badge-green" : s === "failed" ? "badge badge-red" : "badge badge-slate"; }
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.round(d)}s atrás`;
  if (d < 3600) return `${Math.round(d / 60)}m atrás`;
  return `${Math.round(d / 3600)}h atrás`;
}

// ─── Setup checklist ─────────────────────────────────────────────────────────
function SetupChecklist({ hasToken, hasChannel }: { hasToken: boolean; hasChannel: boolean }) {
  const items = [
    { done: hasToken, current: !hasToken, label: "Configure o token de admin", desc: "Insira o Bearer token na barra lateral para autenticar." },
    { done: hasChannel, current: hasToken && !hasChannel, label: "Crie seu primeiro canal", desc: "Clique em '+ Novo canal' e siga o wizard de 4 passos." },
    { done: false, current: hasToken && hasChannel, label: "Rode o pipeline", desc: "Clique em '▶ Rodar' no canal configurado e acompanhe a execução." },
  ];
  return (
    <div className="glass" style={{ padding: 24, maxWidth: 480 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><Ico.Zap /></div>
        <div>
          <div style={{ fontWeight: 800, fontSize: ".9375rem", color: "#e2e8f0" }}>Primeiros passos</div>
          <div style={{ fontSize: ".72rem", color: "#475569" }}>Complete os 3 itens para começar a gerar shorts</div>
        </div>
      </div>
      {items.map((item, i) => (
        <div key={i} className="check-row">
          <div className={`check-icon ${item.done ? "check-done" : item.current ? "check-current" : "check-idle"}`}>
            {item.done ? <Ico.Check /> : <span style={{ fontSize: ".7rem", fontWeight: 800 }}>{i + 1}</span>}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: ".8125rem", color: item.done ? "#6ee7b7" : item.current ? "#a5b4fc" : "#475569" }}>{item.label}</div>
            <div style={{ fontSize: ".73rem", color: "#334155", marginTop: 3, lineHeight: 1.5 }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── How-to guide ─────────────────────────────────────────────────────────────
function HowToGuide({ flowType }: { flowType: "cuts" | "quiz" }) {
  const cutSteps = [
    { title: "Fontes", desc: "Informe os canais do YouTube de onde o sistema vai buscar vídeos." },
    { title: "IA analisa", desc: "O LLM lê a transcrição de cada vídeo e seleciona os melhores momentos virais." },
    { title: "Geração de shorts", desc: "FFmpeg corta, coloca legendas e marca d'água automaticamente." },
    { title: "Publicação", desc: "Os vídeos são enviados para o YouTube e/ou Telegram configurados." },
  ];
  const quizSteps = [
    { title: "Focos (temas)", desc: "Defina os temas. A IA vai gerar as perguntas baseadas neles." },
    { title: "Geração por IA", desc: "O LLM cria perguntas, respostas e roteiro completo do quiz." },
    { title: "TTS + vídeo", desc: "O áudio é sintetizado via TTS e o vídeo é montado com animações." },
    { title: "Publicação", desc: "O short de quiz vai automaticamente para o canal configurado." },
  ];
  const steps = flowType === "cuts" ? cutSteps : quizSteps;
  return (
    <div className="glass-sm" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Ico.Book />
        <span style={{ fontWeight: 700, fontSize: ".875rem", color: "#e2e8f0" }}>Como funciona — {flowType === "cuts" ? "Cortes" : "Quiz"}</span>
      </div>
      {steps.map((s, i) => (
        <div key={i} className="howto-step">
          <div className="howto-num">{i + 1}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: ".8125rem", color: "#cbd5e1", marginBottom: 3 }}>{s.title}</div>
            <div style={{ fontSize: ".74rem", color: "#64748b", lineHeight: 1.6 }}>{s.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Channel card ─────────────────────────────────────────────────────────────
function ChannelCard({ bundle, selected, onClick }: { bundle: AdminChannelBundle; selected: boolean; onClick: () => void }) {
  const isQuiz = bundle.channel.channelType === "quiz";
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "block", padding: "13px 14px", marginBottom: 8,
      borderRadius: 13, cursor: "pointer", textAlign: "left",
      border: selected ? "1.5px solid rgba(99,102,241,.5)" : "1.5px solid rgba(255,255,255,.06)",
      background: selected ? "rgba(99,102,241,.1)" : "transparent",
      transition: "all .15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: isQuiz ? "rgba(245,158,11,.15)" : "rgba(99,102,241,.15)", display: "flex", alignItems: "center", justifyContent: "center", color: isQuiz ? "#fcd34d" : "#a5b4fc", flexShrink: 0 }}>
          {isQuiz ? <Ico.Sparkles /> : <Ico.Scissors />}
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: ".875rem", fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bundle.channel.name || <span style={{ color: "#334155" }}>Sem nome</span>}</div>
          <div style={{ fontSize: ".68rem", color: "#334155" }}>{bundle.channel.slug || bundle.channel.id}</div>
        </div>
        <span className={bundle.channel.status === "active" ? "badge badge-green" : "badge badge-slate"}>{bundle.channel.status === "active" ? "ativo" : "inativo"}</span>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        <span className={isQuiz ? "badge badge-amber" : "badge badge-brand"}>{isQuiz ? "Quiz" : "Cortes"}</span>
        {!isQuiz && bundle.sources.length > 0 && <span className="badge badge-slate">{bundle.sources.length} fonte{bundle.sources.length !== 1 ? "s" : ""}</span>}
        {bundle.focuses.map(f => <span key={f.key} className="badge badge-slate">{f.label}</span>)}
      </div>
    </button>
  );
}

// ─── Run card ─────────────────────────────────────────────────────────────────
function RunCard({ r }: { r: { id: string; channelId: string; status: string; progress: { message?: string } | null; errorMessage: string | null; createdAt: string } }) {
  return (
    <div className="glass-inset" style={{ padding: "13px 15px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span className={dotClass(r.status)} />
        <span style={{ flex: 1, fontSize: ".8125rem", fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.channelId}</span>
        <span className={badgeClass(r.status)}>{r.status}</span>
      </div>
      <p style={{ margin: 0, fontSize: ".73rem", color: "#64748b", lineHeight: 1.5 }}>{r.progress?.message ?? r.errorMessage ?? "Aguardando progresso…"}</p>
      <p style={{ margin: "4px 0 0", fontSize: ".68rem", color: "#334155" }}>{timeAgo(r.createdAt)}</p>
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "ok" | "err" }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, padding: "13px 20px", borderRadius: 14, zIndex: 9999,
      background: type === "ok" ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)",
      border: `1px solid ${type === "ok" ? "rgba(16,185,129,.3)" : "rgba(239,68,68,.3)"}`,
      color: type === "ok" ? "#6ee7b7" : "#fca5a5",
      fontSize: ".875rem", fontWeight: 600,
      boxShadow: "0 10px 40px rgba(0,0,0,.5)",
      backdropFilter: "blur(20px)",
    }}>
      {type === "ok" ? "✓ " : "✗ "}{msg}
    </div>
  );
}

// ─── Wizard steps ─────────────────────────────────────────────────────────────
const WIZARD_LABELS = ["Tipo de fluxo", "Identidade", "Pipeline", "Publicação"];

function Step0FlowType({ draft, setDraft }: { draft: AdminChannelBundle; setDraft: (d: AdminChannelBundle) => void }) {
  const isQuiz = draft.channel.channelType === "quiz";
  return (
    <div>
      <p className="section-title">Qual tipo de conteúdo este canal vai gerar?</p>
      <p className="section-sub">Você pode mudar isso depois. Cada tipo tem um pipeline diferente.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 28 }}>
        <button className={`flow-card ${!isQuiz ? "active-cuts" : ""}`} onClick={() => setDraft(ch(draft, { channelType: "cuts" }))}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#a5b4fc" }}><Ico.Scissors /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: ".9rem", color: "#e2e8f0" }}>Cortes</div>
              {!isQuiz && <div style={{ fontSize: ".68rem", color: "#6366f1", fontWeight: 700 }}>✓ Selecionado</div>}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: ".75rem", color: "#64748b", lineHeight: 1.6 }}>Baixa vídeos de canais do YouTube, a IA identifica os melhores momentos e gera shorts automaticamente.</p>
        </button>
        <button className={`flow-card ${isQuiz ? "active-quiz" : ""}`} onClick={() => setDraft(ch(draft, { channelType: "quiz" }))}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fcd34d" }}><Ico.Sparkles /></div>
            <div>
              <div style={{ fontWeight: 800, fontSize: ".9rem", color: "#e2e8f0" }}>Quiz</div>
              {isQuiz && <div style={{ fontSize: ".68rem", color: "#f59e0b", fontWeight: 700 }}>✓ Selecionado</div>}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: ".75rem", color: "#64748b", lineHeight: 1.6 }}>A IA gera perguntas e respostas sobre temas definidos, monta o vídeo com TTS e animações.</p>
        </button>
      </div>
      <HowToGuide flowType={draft.channel.channelType} />
    </div>
  );
}

function Step1Identity({ draft, setDraft }: { draft: AdminChannelBundle; setDraft: (d: AdminChannelBundle) => void }) {
  const isQuiz = draft.channel.channelType === "quiz";
  return (
    <div>
      <p className="section-title">Identidade do canal</p>
      <p className="section-sub">Estes dados identificam o canal no painel e podem aparecer como marca d'água nos vídeos.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
        <Field label="ID único" hint="ex: canal-catolico-01" tip="Identificador interno único. Use letras minúsculas e hífens." value={draft.channel.id} onChange={e => setDraft(ch(draft, { id: e.target.value }))} placeholder="meu-canal-01" />
        <Field label="Slug" hint="URL amigável" tip="Versão curta do nome para URLs. Gerada automaticamente se vazia." value={draft.channel.slug} onChange={e => setDraft(ch(draft, { slug: e.target.value }))} placeholder="meu-canal" />
        <Field label="Nome do canal" value={draft.channel.name} onChange={e => setDraft(ch(draft, { name: e.target.value }))} placeholder="Canal Católico Shorts" />
        <FieldSelect label="Status" tip="Somente canais ativos aparecem nas execuções automáticas." value={draft.channel.status} onChange={e => setDraft(ch(draft, { status: e.target.value as "active" | "inactive" }))}>
          <option value="active">✓ Ativo</option>
          <option value="inactive">✗ Inativo</option>
        </FieldSelect>
        <Field label="Watermark" hint="texto sobreposto" tip="Texto exibido no canto do vídeo como marca d'água." value={draft.channel.watermarkText} onChange={e => setDraft(ch(draft, { watermarkText: e.target.value }))} placeholder="@MeuCanal" />
        <Field label="Logo (caminho)" hint="opcional" tip="Caminho absoluto para um arquivo de imagem .png usado como logo." value={draft.channel.logoPath ?? ""} onChange={e => setDraft(ch(draft, { logoPath: e.target.value || null }))} placeholder="/app/assets/logo.png" />
      </div>

      <FieldArea label="Descrição" hint="aparece no painel" value={draft.channel.description} onChange={e => setDraft(ch(draft, { description: e.target.value }))} placeholder="Shorts católicos gerados automaticamente a partir de homilias e reflexões…" />

      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {isQuiz ? (
          <div className="info-box">
            <div style={{ fontWeight: 700, fontSize: ".8rem", color: "#a5b4fc", marginBottom: 6 }}>💡 Modo Quiz — Fontes não são necessárias</div>
            <p style={{ margin: 0, fontSize: ".74rem", color: "#64748b", lineHeight: 1.6 }}>A IA gera o conteúdo a partir dos Focos abaixo. Não é preciso vincular canais de origem.</p>
          </div>
        ) : (
          <FieldArea
            label="Fontes de vídeos" hint="um por linha"
            tip="Cada linha: kind|Label|Valor. Ex: youtube_channel|Pe. João|UCxxxx"
            value={stringifySources(draft)}
            onChange={e => setDraft({ ...draft, sources: parseSources(e.target.value) })}
            placeholder={"youtube_channel|Padre João|UCxxxxxxxxxxxxxx\nyoutube_handle|Frei Gil|@FreiGilson"}
          />
        )}
        <FieldArea
          label="Focos / Temas" hint="um por linha"
          tip="Cada linha: chave|Rótulo. As chaves devem ser: politica, catolicos, musica, filmes, series, jogos, tecnologia."
          value={stringifyFocuses(draft)}
          onChange={e => setDraft({ ...draft, focuses: parseFocuses(e.target.value) })}
          placeholder={"catolicos|Católicos\ncristandade|Cristandade"}
        />
      </div>
    </div>
  );
}

function Step2Pipeline({ draft, setDraft }: { draft: AdminChannelBundle; setDraft: (d: AdminChannelBundle) => void }) {
  return (
    <div>
      <p className="section-title">Configuração do pipeline</p>
      <p className="section-sub">Controla quantos vídeos processar por execução, limites de duração e qual IA usar.</p>

      <div className="warn-box" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: ".8rem", color: "#fcd34d", marginBottom: 4 }}>⚡ Dica de performance</div>
        <p style={{ margin: 0, fontSize: ".74rem", color: "#b45309", lineHeight: 1.6 }}>
          Comece com <strong>videoLimit = 1</strong> para testar o canal antes de escalar. Cada vídeo consome espaço em disco e tempo de processamento.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Vídeos por run" type="number" tip="Máximo de vídeos baixados e processados em uma única execução." value={draft.profile.videoLimit} onChange={e => setDraft(pr(draft, { videoLimit: Number(e.target.value) }))} />
        <Field label="Duração mín (s)" type="number" tip="Clips mais curtos que este valor são descartados pelo filtro." value={draft.profile.minShortDuration} onChange={e => setDraft(pr(draft, { minShortDuration: Number(e.target.value) }))} />
        <Field label="Duração máx (s)" type="number" tip="Clips mais longos que este valor são descartados. YouTube Shorts aceita até 60s." value={draft.profile.maxShortDuration} onChange={e => setDraft(pr(draft, { maxShortDuration: Number(e.target.value) }))} />
        <Field label="Meta de shorts" type="number" hint="opcional" tip="Para a execução assim que atingir esta quantidade de shorts gerados." value={draft.profile.targetShorts ?? ""} onChange={e => setDraft(pr(draft, { targetShorts: e.target.value ? Number(e.target.value) : null }))} />
        <Field label="Query de busca" hint="opcional" tip="Filtra vídeos do canal que contenham esse termo no título. Ex: 'homilia', 'reflexão'." value={draft.profile.videoQuery ?? ""} onChange={e => setDraft(pr(draft, { videoQuery: e.target.value || null }))} placeholder="homilia" />
        <FieldSelect label="Ordenar por" tip="Define como os vídeos do canal são selecionados antes de processar." value={String(draft.profile.sortByViews)} onChange={e => setDraft(pr(draft, { sortByViews: e.target.value === "true" }))}>
          <option value="false">📅 Mais recentes</option>
          <option value="true">🔥 Mais vistos</option>
        </FieldSelect>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FieldSelect label="Provedor de IA" tip="OpenRouter usa modelos cloud (requer chave). Ollama roda localmente (gratuito, mais lento)." value={draft.profile.aiProvider} onChange={e => setDraft(pr(draft, { aiProvider: e.target.value as "openrouter" | "ollama" }))}>
          <option value="ollama">🏠 Ollama (local, gratuito)</option>
          <option value="openrouter">☁ OpenRouter (cloud, rápido)</option>
        </FieldSelect>
        <Field label="Modelo de IA" hint="ex: gemma3:1b ou gemini-2.0-flash" tip="Nome do modelo conforme o provedor. Ollama: 'gemma3:1b'. OpenRouter: 'google/gemini-2.0-flash-lite-001'." value={draft.profile.aiModel} onChange={e => setDraft(pr(draft, { aiModel: e.target.value }))} placeholder="gemma3:1b" />
      </div>
    </div>
  );
}

function Step3Publishing({ draft, setDraft }: { draft: AdminChannelBundle; setDraft: (d: AdminChannelBundle) => void }) {
  const acc = (p: string) => draft.publishingAccounts.find(a => a.provider === p) || { provider: p, label: p, status: "active" as const, accountIdentifier: "", refreshToken: "", hasStoredToken: false };
  const upd = (provider: "youtube" | "telegram" | "openrouter", field: string, value: unknown) => {
    const ex = draft.publishingAccounts.find(a => a.provider === provider);
    const updated = ex ? { ...ex, [field]: value } : { provider, label: provider, status: "active" as const, accountIdentifier: provider === "openrouter" ? "openrouter" : "", [field]: value };
    setDraft({ ...draft, publishingAccounts: [...draft.publishingAccounts.filter(a => a.provider !== provider), updated] });
  };
  const yt = acc("youtube") as typeof draft.publishingAccounts[number] & { clientId?: string; clientSecret?: string };
  const tg = acc("telegram");
  const or = acc("openrouter");

  return (
    <div>
      <p className="section-title">Credenciais de publicação</p>
      <p className="section-sub">Configure onde os vídeos gerados serão publicados. YouTube é obrigatório; os demais são opcionais.</p>

      {/* YouTube */}
      <div className="glass-inset" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(239,68,68,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f87171"><path d="M23.5 6.2c-.3-1-1-1.8-2-2.1C19.7 3.5 12 3.5 12 3.5s-7.7 0-9.5.6c-1 .3-1.7 1.1-2 2.1C0 8 0 12 0 12s0 4 .5 5.8c.3 1 1 1.8 2 2.1C4.3 20.5 12 20.5 12 20.5s7.7 0 9.5-.6c1-.3 1.7-1.1 2-2.1C24 16 24 12 24 12s0-4-.5-5.8zM9.8 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: ".875rem", color: "#e2e8f0" }}>YouTube</div>
            <div style={{ fontSize: ".7rem", color: "#64748b" }}>Destino principal dos shorts gerados</div>
          </div>
          <span className="badge badge-brand">Obrigatório</span>
        </div>
        <div className="info-box" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: ".73rem", color: "#a5b4fc", lineHeight: 1.7 }}>
            <strong>Como obter?</strong> Acesse o <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{ color: "#818cf8" }}>Google Cloud Console</a> → APIs → YouTube Data API v3 → Criar credenciais OAuth → Copie o Client ID e Secret → Use o script <code style={{ background: "rgba(0,0,0,.3)", padding: "1px 5px", borderRadius: 4 }}>pnpm generate</code> para obter o Refresh Token.
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Client ID" tip="OAuth 2.0 Client ID do Google Cloud Console." value={yt.clientId ?? ""} onChange={e => upd("youtube", "clientId", e.target.value)} placeholder="439580...apps.googleusercontent.com" />
          <Field label="Client Secret" type="password" tip="OAuth 2.0 Client Secret do Google Cloud Console." value={yt.clientSecret ?? ""} onChange={e => upd("youtube", "clientSecret", e.target.value)} placeholder="GOCSPX-..." />
          <Field label="Refresh Token" type="password" tip="Token de longa duração para renovar o acesso sem re-autorizar." value={yt.refreshToken ?? ""} onChange={e => upd("youtube", "refreshToken", e.target.value)} placeholder={yt.hasStoredToken ? "••••• (salvo — preencha apenas para rotacionar)" : "1//0h..."} />
          <Field label="Canal Handle ou ID" tip="O @handle ou UCxxxxx do canal onde os vídeos serão publicados." value={yt.accountIdentifier} onChange={e => upd("youtube", "accountIdentifier", e.target.value)} placeholder="@MeuCanal ou UCxxxxxxxxx" />
        </div>
      </div>

      {/* Telegram */}
      <div className="glass-inset" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(56,189,248,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.9 8.2l-2 9.5c-.2.7-.6.9-1.2.6l-3.2-2.4-1.6 1.5c-.2.2-.4.3-.7.3l.2-3.3 5.6-5.1c.2-.2 0-.3-.4-.1L7.1 14.5 4 13.6c-.7-.2-.7-.7.1-1l11-4.2c.7-.3 1.3.2 1 1z"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: ".875rem", color: "#e2e8f0" }}>Telegram</div>
            <div style={{ fontSize: ".7rem", color: "#64748b" }}>Publicação espelho no Telegram (canal ou grupo)</div>
          </div>
          <span className="badge badge-slate">Opcional</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Bot Token" type="password" tip="Crie um bot com @BotFather no Telegram e copie o token gerado." value={tg.refreshToken ?? ""} onChange={e => upd("telegram", "refreshToken", e.target.value)} placeholder={tg.hasStoredToken ? "••••• (salvo)" : "123456:ABCdef..."} />
          <Field label="Chat / Canal ID" tip="O ID numérico do grupo ou canal. Grupos geralmente começam com -100." value={tg.accountIdentifier} onChange={e => upd("telegram", "accountIdentifier", e.target.value)} placeholder="-100xxxxxxxxxx" />
        </div>
      </div>

      {/* OpenRouter */}
      <div className="glass-inset" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(99,102,241,.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#a5b4fc" }}>
            <Ico.Zap />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: ".875rem", color: "#e2e8f0" }}>OpenRouter API</div>
            <div style={{ fontSize: ".7rem", color: "#64748b" }}>Sobrescreve a chave global do LLM apenas para este canal</div>
          </div>
          <span className="badge badge-slate">Opcional</span>
        </div>
        <Field label="Chave de API" type="password" tip="Obtenha em openrouter.ai → Keys. Prefixo: sk-or-v1-..." value={or.refreshToken ?? ""} onChange={e => upd("openrouter", "refreshToken", e.target.value)} placeholder={or.hasStoredToken ? "••••• (salvo)" : "sk-or-v1-..."} />
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { adminToken, setAdminToken, channels, runs, selectedChannelId, setSelectedChannelId, error, isPending, save, remove, test, run, refreshNow } = useAdminConsole();

  const [draft, setDraft] = useState<AdminChannelBundle>(createEmptyBundle);
  const [wizardStep, setWizardStep] = useState(0);
  const [isNew, setIsNew] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const activeRuns = useMemo(() => runs.slice(0, 10), [runs]);

  function toast$(msg: string, type: "ok" | "err") { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); }

  async function handleSave() {
    try { await save(draft); toast$("Canal salvo!", "ok"); }
    catch (e) { toast$(String(e), "err"); }
  }
  async function handleRun() {
    try { await run(draft.channel.id); toast$("Pipeline iniciado!", "ok"); }
    catch (e) { toast$(String(e), "err"); }
  }
  async function handleRemove() {
    if (!confirm(`Excluir o canal "${draft.channel.name}"?`)) return;
    try { await remove(draft.channel.id); setDraft(createEmptyBundle()); setIsNew(true); setWizardStep(0); toast$("Canal excluído.", "ok"); }
    catch (e) { toast$(String(e), "err"); }
  }
  function selectChannel(bundle: AdminChannelBundle) {
    setDraft(bundle); setSelectedChannelId(bundle.channel.id); setIsNew(false); setWizardStep(0);
  }
  function newChannel() {
    setDraft(createEmptyBundle()); setSelectedChannelId(""); setIsNew(true); setWizardStep(0);
  }

  const hasToken = !!adminToken;
  const hasChannel = channels.length > 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#050914" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 256, flexShrink: 0, borderRight: "1px solid rgba(255,255,255,.06)", padding: "24px 14px", display: "flex", flexDirection: "column", gap: 6, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 20px" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polygon points="5,3 19,12 5,21" fill="white"/></svg>
          </div>
          <div>
            <div style={{ fontSize: ".9rem", fontWeight: 900, color: "#e2e8f0", letterSpacing: "-.02em" }}>Shorts <span className="grad">Generator</span></div>
            <div style={{ fontSize: ".65rem", color: "#334155" }}>Painel de controle</div>
          </div>
        </div>

        {/* Token */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <Label>Token admin</Label>
            <Tooltip tip="Bearer token definido em ADMIN_API_TOKEN no .env do servidor."><span style={{ color: "#334155", cursor: "help", display: "flex" }}><Ico.Info /></span></Tooltip>
          </div>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#334155" }}><Ico.Key /></span>
            <input className="field" type="password" value={adminToken} onChange={e => setAdminToken(e.target.value)} placeholder="Bearer …" style={{ paddingLeft: 28, fontSize: ".8rem" }} />
          </div>
          {!hasToken && <div style={{ fontSize: ".68rem", color: "#6366f1", marginTop: 5 }}>👆 Configure o token para começar</div>}
        </div>

        <div className="divider" />

        {/* Channels */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 4px", marginBottom: 2 }}>
          <span style={{ fontSize: ".68rem", color: "#334155", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>Canais {channels.length > 0 && `(${channels.length})`}</span>
          <button className="btn btn-ghost" style={{ padding: "3px 7px", fontSize: ".7rem" }} onClick={() => void refreshNow()}><Ico.Refresh /></button>
        </div>

        {!hasToken && (
          <div style={{ padding: "12px 8px", textAlign: "center", color: "#1e293b", fontSize: ".75rem" }}>
            Configure o token para ver os canais
          </div>
        )}

        {hasToken && channels.length === 0 && (
          <div style={{ padding: "20px 8px", textAlign: "center" }}>
            <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>📺</div>
            <div style={{ fontSize: ".75rem", color: "#334155", lineHeight: 1.6 }}>Nenhum canal ainda.<br />Crie o primeiro abaixo!</div>
          </div>
        )}

        {channels.map(c => <ChannelCard key={c.channel.id} bundle={c} selected={selectedChannelId === c.channel.id} onClick={() => selectChannel(c)} />)}

        <div style={{ marginTop: "auto", paddingTop: 12 }}>
          <button className="btn btn-brand" style={{ width: "100%", justifyContent: "center" }} onClick={newChannel}>
            <Ico.Plus /> Novo canal
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* Top bar */}
        <header style={{ borderBottom: "1px solid rgba(255,255,255,.06)", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#e2e8f0" }}>
              {isNew ? <span style={{ color: "#334155" }}>Novo canal</span> : (draft.channel.name || <span style={{ color: "#475569" }}>Canal sem nome</span>)}
            </h1>
            {!isNew && draft.channel.id && <p style={{ margin: "1px 0 0", fontSize: ".72rem", color: "#334155" }}>ID: {draft.channel.id}</p>}
          </div>
          {!isNew && (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" disabled={isPending || !draft.channel.id} onClick={() => void test(draft.channel.id)}>
                <Ico.Wifi /> Testar conexão
              </button>
              <button className="btn btn-green" disabled={isPending || !draft.channel.id} onClick={() => void handleRun()}>
                <Ico.Play /> Rodar pipeline
              </button>
              <button className="btn btn-brand" disabled={isPending} onClick={() => void handleSave()}>
                <Ico.Save /> Salvar
              </button>
              <button className="btn btn-red" disabled={isPending || !draft.channel.id} onClick={() => void handleRemove()}>
                <Ico.Trash />
              </button>
            </div>
          )}
          {isNew && (
            <div style={{ display: "flex", gap: 8 }}>
              {wizardStep > 0 && <button className="btn btn-ghost" onClick={() => setWizardStep(s => s - 1)}>← Anterior</button>}
              {wizardStep < 3
                ? <button className="btn btn-brand" onClick={() => setWizardStep(s => s + 1)}>Próximo →</button>
                : <button className="btn btn-green" disabled={isPending} onClick={() => void handleSave()}><Ico.Save /> Salvar canal</button>
              }
            </div>
          )}
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 24, alignItems: "start" }}>
          {/* ── Editor ── */}
          <div>
            {error && <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#fca5a5", fontSize: ".8125rem" }}>⚠ {error}</div>}

            {isNew && <WizardBar step={wizardStep} total={4} labels={WIZARD_LABELS} />}

            {!isNew && (
              <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,.04)", borderRadius: 10, padding: 4, width: "fit-content" }}>
                {[["identity", "Identidade"], ["pipeline", "Pipeline"], ["publishing", "Publicação"]].map(([k, label]) => (
                  <button key={k} className={`tab ${wizardStep === ["identity","pipeline","publishing"].indexOf(k) + 1 ? "active" : ""}`}
                    onClick={() => setWizardStep(["identity","pipeline","publishing"].indexOf(k) + 1)}>{label}</button>
                ))}
              </div>
            )}

            {(isNew ? wizardStep === 0 : false) && <Step0FlowType draft={draft} setDraft={setDraft} />}
            {(isNew ? wizardStep === 1 : wizardStep === 1 || wizardStep === 0) && wizardStep !== 0 && <Step1Identity draft={draft} setDraft={setDraft} />}
            {(isNew ? wizardStep === 2 : wizardStep === 2) && <Step2Pipeline draft={draft} setDraft={setDraft} />}
            {(isNew ? wizardStep === 3 : wizardStep === 3) && <Step3Publishing draft={draft} setDraft={setDraft} />}
            {!isNew && wizardStep === 0 && <Step1Identity draft={draft} setDraft={setDraft} />}
          </div>

          {/* ── Right panel ── */}
          <aside style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Setup checklist when relevant */}
            {(!hasToken || !hasChannel) && <SetupChecklist hasToken={hasToken} hasChannel={hasChannel} />}

            {/* How-to for the current channel type */}
            {isNew && wizardStep === 0 && null}
            {(!isNew || wizardStep > 0) && (
              <HowToGuide flowType={draft.channel.channelType} />
            )}

            {/* Runs */}
            <div className="glass" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <Ico.Activity />
                  <span style={{ fontWeight: 700, fontSize: ".875rem", color: "#e2e8f0" }}>Runs recentes</span>
                </div>
                <select className="field" style={{ maxWidth: 130, padding: "4px 8px", fontSize: ".72rem" }} value={selectedChannelId} onChange={e => setSelectedChannelId(e.target.value)}>
                  <option value="">Todos</option>
                  {channels.map(c => <option key={c.channel.id} value={c.channel.id}>{c.channel.name}</option>)}
                </select>
              </div>
              {activeRuns.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: "#1e293b" }}>
                  <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>🎬</div>
                  <div style={{ fontSize: ".75rem", lineHeight: 1.6, color: "#334155" }}>Nenhuma execução ainda.<br />Configure e rode um canal para começar.</div>
                </div>
              ) : (
                activeRuns.map(r => <RunCard key={r.id} r={r} />)
              )}
            </div>
          </aside>
        </div>
      </main>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
