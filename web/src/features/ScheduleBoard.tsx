import { useState, type FormEvent } from "react";
import { useSchedule, errorMessage } from "../hooks/useChannelTools";
import type { ManualCut, ScheduleEntry } from "../types";

const DAYS = 7;

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function groupByDay(entries: readonly ScheduleEntry[], start: Date): Record<string, ScheduleEntry[]> {
  const days: Record<string, ScheduleEntry[]> = {};
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days[dayKey(day)] = [];
  }
  for (const entry of entries) {
    const key = dayKey(new Date(entry.runAt));
    days[key]?.push(entry);
  }
  return days;
}

export function ScheduleBoard({ adminToken, channelId, cuts }: { adminToken: string; channelId: string; cuts: readonly ManualCut[] }) {
  const { entries, error, add, remove } = useSchedule(adminToken, channelId);
  const [runAt, setRunAt] = useState("");
  const [kind, setKind] = useState<"programmed" | "manual">("programmed");
  const [cutId, setCutId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date();
  const grouped = groupByDay(entries, today);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    try {
      await add({ runAt: new Date(runAt).toISOString(), kind, cutId: kind === "manual" ? cutId : null });
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  if (!adminToken || !channelId) {
    return <p className="glass-inset p-4 text-sm text-slate-400">Escolha um canal e informe o token para ver a agenda.</p>;
  }

  return (
    <section className="space-y-5">
      <form onSubmit={submit} className="glass grid gap-3 p-5 sm:grid-cols-4" aria-label="Agendar">
        <input className="field" type="datetime-local" aria-label="Quando" value={runAt} onChange={(e) => setRunAt(e.target.value)} required />
        <select className="field" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as "programmed" | "manual")}>
          <option value="programmed">Programado</option>
          <option value="manual">Corte manual</option>
        </select>
        <select className="field" aria-label="Corte" value={cutId} disabled={kind !== "manual"} onChange={(e) => setCutId(e.target.value)}>
          <option value="">Escolha um corte</option>
          {cuts.map((cut) => <option key={cut.id} value={cut.id}>{cut.title}</option>)}
        </select>
        <button className="btn btn-brand" type="submit">Agendar</button>
        {formError && <p role="alert" className="text-sm text-rose-300 sm:col-span-4">⚠ {formError}</p>}
      </form>
      {error && <p role="alert" className="text-sm text-rose-300">⚠ {error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {Object.entries(grouped).map(([day, items]) => (
          <div key={day} className="glass-inset min-h-[90px] p-2">
            <p className="font-mono text-xs text-slate-500">{day.slice(5)}</p>
            {items.map((entry) => (
              <div key={entry.id} className="mt-1 flex items-center justify-between gap-1 rounded bg-white/5 px-1.5 py-1 text-xs text-slate-200">
                <span className="truncate">{new Date(entry.runAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} {entry.kind === "manual" ? "corte" : "auto"}</span>
                <button aria-label="Remover agendamento" className="text-rose-300" onClick={() => void remove(entry.id)}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
