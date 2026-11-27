/**
 * Antes: o aviso do dashboard. Cópia literal de
 * `git show origin/master:web/src/components/DashboardPage.tsx` (`function Notice`),
 * usada no estado de carregamento ("Carregando métricas…").
 */
export function LegacyNotice({ children }: { children: string }) {
  return (
    <div className="glass-inset" style={{ padding: "14px 18px", color: "#94a3b8", fontSize: ".82rem" }}>
      {children}
    </div>
  );
}
