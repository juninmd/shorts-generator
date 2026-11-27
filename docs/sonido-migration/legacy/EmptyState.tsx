/**
 * Antes: estado vazio das runs recentes. Recorte literal de
 * `git show origin/master:web/src/App.tsx` (painel direito, `activeRuns.length === 0`).
 */
export function LegacyEmptyState() {
  return (
    <div style={{ padding: "24px 0", textAlign: "center", color: "#1e293b" }}>
      <div style={{ fontSize: "1.6rem", marginBottom: 8 }}>🎬</div>
      <div style={{ fontSize: ".75rem", lineHeight: 1.6, color: "#94a3b8" }}>Nenhuma execução ainda.<br />Configure e rode um canal para começar.</div>
    </div>
  );
}
