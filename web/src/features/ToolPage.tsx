import { useState } from "react";
import { Button, Tabs } from "@juninmd/sonido";
import type { AdminChannelBundle } from "../types";
import { useCuts } from "../hooks/useChannelTools";
import { ChannelWizard } from "./ChannelWizard";
import { CutsWorkspace } from "./CutsWorkspace";
import { RadarPanel } from "./RadarPanel";
import { ScheduleBoard } from "./ScheduleBoard";

type Tab = "wizard" | "cuts" | "schedule" | "radar";
const TABS: { key: Tab; label: string }[] = [
  { key: "wizard", label: "Criar canal" },
  { key: "cuts", label: "Cortes manuais" },
  { key: "schedule", label: "Agenda" },
  { key: "radar", label: "Radar" },
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
      <Button variant="secondary" className="mb-4" onClick={onBack}>← Console</Button>
      <Tabs
        idPrefix="tools"
        label="Ferramentas"
        variant="pill"
        className="mb-6 w-fit"
        items={TABS}
        value={tab}
        onChange={setTab}
      />
      {tab === "wizard" && <ChannelWizard onSave={onSaveChannel} />}
      {tab === "cuts" && <CutsWorkspace adminToken={adminToken} channelId={channelId} />}
      {tab === "schedule" && <ScheduleBoard adminToken={adminToken} channelId={channelId} cuts={cuts.cuts} />}
      {tab === "radar" && <RadarPanel adminToken={adminToken} channelId={channelId} />}
    </div>
  );
}
