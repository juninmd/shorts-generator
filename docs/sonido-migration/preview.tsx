import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  StatTile,
  Stepper,
  Tabs,
  ToastProvider,
  useToast,
} from "@juninmd/sonido";

// O CSS real do painel (Tailwind + .glass/.field) e o CSS do Sonido.
import "../../web/src/index.css";
import "@juninmd/sonido/styles.css";
// As classes antigas saíram do app; a cópia vive aqui só para o lado "antes".
import "./legacy/legacy.css";

import { LegacyAlert } from "./legacy/Alert";
import { LegacyBadge } from "./legacy/Badge";
import { LegacyButton } from "./legacy/Button";
import { LegacyEmptyState } from "./legacy/EmptyState";
import { LegacyStatRow } from "./legacy/StatRow";
import { LegacyTabs } from "./legacy/Tabs";
import { LegacyToast } from "./legacy/Toast";
import { LegacyWizardBar } from "./legacy/WizardBar";

const STEPS = ["Tipo de fluxo", "Identidade", "Pipeline", "Publicação"];
const EDITOR_TABS = [
  { key: "identity", label: "Identidade" },
  { key: "pipeline", label: "Pipeline" },
  { key: "publishing", label: "Publicação" },
];

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

/** Mostra o toast do Sonido já aberto, para caber na captura. */
function SonidoToastDemo() {
  const toast = useToast();
  useEffect(() => {
    toast({ title: "Canal salvo!", tone: "success", duration: 0 });
  }, [toast]);
  return null;
}

const page: React.CSSProperties = {
  background: "#050914",
  color: "#f1f5f9",
  fontFamily: '"Inter", system-ui, sans-serif',
  padding: 28,
  minHeight: "100vh",
  display: "grid",
  gap: 22,
};

const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "stretch" };
const card: React.CSSProperties = {
  background: "rgba(15,23,42,.6)",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 16,
  padding: 16,
  minWidth: 0,
};
const tag = (color: string): React.CSSProperties => ({
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color,
  fontWeight: 700,
  marginBottom: 12,
});
// `fixed` (toast) passa a ser relativo ao card: um transform cria o containing block.
const toastBox: React.CSSProperties = { position: "relative", transform: "translateZ(0)", minHeight: 108, overflow: "hidden", borderRadius: 12 };

function Row({ title, hint, before, after }: { title: string; hint: string; before: ReactNode; after: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15 }}>{title}</h2>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#94a3b8" }}>{hint}</p>
      </div>
      <div style={grid}>
        <div style={card}>
          <div style={tag("#94a3b8")}>Antes · componente do shorts-generator</div>
          <div className="glass" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>{before}</div>
        </div>
        <div style={card}>
          <div style={tag("#ff8fa8")}>Depois · @juninmd/sonido</div>
          <div className="glass" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>{after}</div>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [legacyTab, setLegacyTab] = useState("pipeline");
  const [sonidoTab, setSonidoTab] = useState("pipeline");

  return (
    <div style={page}>
      <header>
        <h1 style={{ margin: 0, fontSize: 20 }}>shorts-generator · trocas de componentes pelo Sonido</h1>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
          Mesmo conteúdo e o mesmo CSS do painel (Tailwind + <code>.glass</code>). À esquerda o primitivo local; à direita o do design system.
          Dados e nomes são fictícios.
        </p>
      </header>

      <Row
        title="Button"
        hint="Ações do console: salvar, testar conexão, rodar o pipeline e excluir o canal."
        before={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <LegacyButton variant="brand">Salvar</LegacyButton>
            <LegacyButton variant="ghost">Testar conexão</LegacyButton>
            <LegacyButton variant="green" icon={<PlayIcon />}>Rodar pipeline</LegacyButton>
            <LegacyButton variant="red" aria-label="Excluir canal"><TrashIcon /></LegacyButton>
          </div>
        }
        after={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button>Salvar</Button>
            <Button variant="ghost">Testar conexão</Button>
            <Button variant="secondary" iconStart={<PlayIcon />}>Rodar pipeline</Button>
            <Button variant="danger" size="icon" aria-label="Excluir canal"><TrashIcon /></Button>
          </div>
        }
      />

      <Row
        title="Badge"
        hint="Status do canal, tipo de fluxo e situação da execução."
        before={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <LegacyBadge tone="green">ativo</LegacyBadge>
            <LegacyBadge tone="slate">inativo</LegacyBadge>
            <LegacyBadge tone="brand">Cortes</LegacyBadge>
            <LegacyBadge tone="amber">Quiz</LegacyBadge>
            <LegacyBadge tone="green">completed</LegacyBadge>
            <LegacyBadge tone="amber">processing</LegacyBadge>
            <LegacyBadge tone="red">failed</LegacyBadge>
          </div>
        }
        after={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Badge tone="success">ativo</Badge>
            <Badge tone="neutral">inativo</Badge>
            <Badge tone="accent">Cortes</Badge>
            <Badge tone="warning">Quiz</Badge>
            <Badge tone="success" dot>completed</Badge>
            <Badge tone="warning" dot live>processing</Badge>
            <Badge tone="danger" dot>failed</Badge>
          </div>
        }
      />

      <Row
        title="Tabs"
        hint="Abas do editor do canal, com foco por setas e aria-selected no Sonido."
        before={<LegacyTabs items={EDITOR_TABS} value={legacyTab} onChange={setLegacyTab} />}
        after={<div style={{ alignSelf: "flex-start" }}><Tabs items={EDITOR_TABS} value={sonidoTab} onChange={setSonidoTab} label="Seções do canal" variant="pill" idPrefix="preview" /></div>}
      />

      <Row
        title="Stepper"
        hint="Passos do wizard de criação do canal."
        before={<LegacyWizardBar step={2} total={STEPS.length} labels={STEPS} />}
        after={<Stepper steps={STEPS.map((label) => ({ label }))} current={2} />}
      />

      <Row
        title="Alert"
        hint="Falha de carregamento do console."
        before={<LegacyAlert>Falha ao carregar os canais.</LegacyAlert>}
        after={<Alert tone="danger" title="Falha no painel">Falha ao carregar os canais.</Alert>}
      />

      <Row
        title="EmptyState"
        hint="Runs recentes quando o canal ainda não rodou."
        before={<LegacyEmptyState />}
        after={
          <EmptyState
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
              </svg>
            }
            title="Nenhuma execução ainda."
            description="Configure e rode um canal para começar."
          />
        }
      />

      <Row
        title="Toast"
        hint="Confirmação depois de salvar um canal."
        before={<div style={toastBox}><LegacyToast msg="Canal salvo!" type="ok" /></div>}
        after={
          <div style={toastBox}>
            <ToastProvider>
              <SonidoToastDemo />
              <span style={{ fontSize: 13, color: "#94a3b8" }}>O toast entra pela região aria-live do provider.</span>
            </ToastProvider>
          </div>
        }
      />

      <Row
        title="StatTile"
        hint="Mediana de views por janela etária no dashboard."
        before={<div className="glass-inset" style={{ padding: 14 }}><LegacyStatRow value="12.480" /></div>}
        after={<div className="glass-inset" style={{ padding: 14 }}><StatTile label="Mediana de views" value="12.480" tone="accent" /></div>}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
