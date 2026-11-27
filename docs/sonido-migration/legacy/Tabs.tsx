/**
 * Antes: as abas do editor. Recorte literal de `git show origin/master:web/src/App.tsx`
 * (bloco `EDITOR_TABS`) — contêiner com padding 4 e botões `.tab`, `.tab.active`.
 */
export function LegacyTabs({ items, value, onChange }: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,.04)", borderRadius: 10, padding: 4, width: "fit-content" }}>
      {items.map((item) => (
        <button key={item.key} className={`tab ${value === item.key ? "active" : ""}`} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
