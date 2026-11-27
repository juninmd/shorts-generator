/**
 * Antes: toast local. Cópia literal de `git show origin/master:web/src/App.tsx`
 * (`function Toast`), sem alterações além do export.
 */
export function LegacyToast({ msg, type }: { msg: string; type: "ok" | "err" }) {
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
