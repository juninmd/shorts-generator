import { useState } from "react";
import type { AdminChannelBundle } from "../types";
import { errorMessage } from "../hooks/useChannelTools";
import { createDraft, validateStep } from "./wizardDraft";
import { StepIdentity, StepReview, StepRules, StepSources, StepType, type Update } from "./wizardSteps";
import { ShortPreview } from "./ShortPreview";

const STEPS = ["Tipo", "Identidade", "Fontes", "Regras", "Revisão"];

export function ChannelWizard({ onSave }: { onSave: (bundle: AdminChannelBundle) => Promise<void> }) {
  const [draft, setDraft] = useState<AdminChannelBundle>(createDraft);
  const [step, setStep] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update: Update = (patch) => setDraft((current) => patch(current));
  const last = step === STEPS.length - 1;

  const next = () => {
    const issue = validateStep(draft, step);
    setProblem(issue);
    if (!issue) setStep((s) => s + 1);
  };
  const finish = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setDraft(createDraft());
      setStep(0);
    } catch (err) {
      setProblem(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const body = [
    <StepType key="t" draft={draft} update={update} />,
    <StepIdentity key="i" draft={draft} update={update} />,
    <StepSources key="s" draft={draft} update={update} />,
    <StepRules key="r" draft={draft} update={update} />,
    <StepReview key="v" draft={draft} />,
  ][step];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <section className="glass p-5">
        <ol className="mb-5 flex flex-wrap gap-2 text-xs" aria-label="Passos">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined} className={`rounded-full px-3 py-1 font-semibold ${i <= step ? "bg-indigo-500/20 text-indigo-200" : "bg-white/5 text-slate-500"}`}>
              {i + 1}. {name}
            </li>
          ))}
        </ol>
        {body}
        {problem && <p role="alert" className="mt-4 text-sm text-rose-300">⚠ {problem}</p>}
        <div className="mt-6 flex justify-between gap-2">
          <button className="btn btn-ghost" type="button" disabled={step === 0} onClick={() => { setProblem(null); setStep((s) => s - 1); }}>← Voltar</button>
          {last
            ? <button className="btn btn-green" type="button" disabled={saving} onClick={() => void finish()}>Criar canal</button>
            : <button className="btn btn-brand" type="button" onClick={next}>Continuar →</button>}
        </div>
      </section>
      <aside className="glass p-5">
        <ShortPreview captions={draft.channel.name || "Nome do canal aparece aqui"} watermark={draft.channel.watermarkText} />
      </aside>
    </div>
  );
}
