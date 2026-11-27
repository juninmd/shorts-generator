/**
 * Antes: banner de erro do console. Recorte literal de
 * `git show origin/master:web/src/App.tsx` (editor, quando `error` existe).
 */
import type { ReactNode } from "react";

export function LegacyAlert({ children }: { children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20, padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "#fca5a5", fontSize: ".8125rem" }}>
      ⚠ {children}
    </div>
  );
}
