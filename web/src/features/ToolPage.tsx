import { useState } from "react";
import type { AdminChannelBundle } from "../types";
import { useCuts } from "../hooks/useChannelTools";
import { ChannelWizard } from "./ChannelWizard";
import { CutsWorkspace } from "./CutsWorkspace";
import { RadarPanel } from "./RadarPanel";
import { ScheduleBoard } from "./ScheduleBoard";

type Tab = "wizard" | "cuts" | "schedule" | "radar";
const TABS: { id: Tab; label: string }[] = [
  { id: "wizard", label: "Criar canal" },
  { id: "cuts", label: "Cortes manuais" },
  { id: "schedule", label: "Agenda" },
  { id: "radar", label: "Radar" },
];

export function ToolPage({ adminToken, channelId, onBack, onSaveChannel }: {
  adminToken: string;
  channelId: string;
  onBack: () => void;
  onSaveChannel: (bundle: AdminChannelBundle) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("wizard");
  const cuts = useCuts(adminToken, channelId);

  return (
    <div className="min-h-screen bg-[#050914] px-8 py-7">
      <button className="btn btn-ghost mb-4" onClick={onBack}>← Console</button>
      <nav className="mb-6 flex gap-1 rounded-xl bg-white/5 p-1" aria-label="Ferramentas">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {tab === "wizard" && <ChannelWizard onSave={onSaveChannel} />}
      {tab === "cuts" && <CutsWorkspace adminToken={adminToken} channelId={channelId} />}
      {tab === "schedule" && <ScheduleBoard adminToken={adminToken} channelId={channelId} cuts={cuts.cuts} />}
      {tab === "radar" && <RadarPanel adminToken={adminToken} channelId={channelId} />}
    </div>
  );
}
