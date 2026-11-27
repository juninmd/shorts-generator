/**
 * Antes: indicador de passos do wizard. Cópia literal de
 * `git show origin/master:web/src/App.tsx` (`function WizardBar`), sem alterações além do export.
 */
export function LegacyWizardBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  const Check = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: i < total - 1 ? 1 : 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div className={`step-circle ${i < step ? "step-done" : i === step ? "step-active" : "step-idle"}`}>
              {i < step ? <Check /> : i + 1}
            </div>
            <span style={{ fontSize: ".68rem", fontWeight: 600, color: i === step ? "#a5b4fc" : i < step ? "#6ee7b7" : "#94a3b8", whiteSpace: "nowrap" }}>{labels[i]}</span>
          </div>
          {i < total - 1 && (
            <div style={{ flex: 1, height: 2, background: i < step ? "rgba(99,102,241,.4)" : "rgba(255,255,255,.06)", margin: "0 8px", marginBottom: 20, borderRadius: 2 }} />
          )}
        </div>
      ))}
    </div>
  );
}
