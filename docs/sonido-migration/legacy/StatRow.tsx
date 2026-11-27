/**
 * Antes: a linha "Mediana de views" do leaderboard. Cópia literal de
 * `git show origin/master:web/src/components/WindowLeaderboard.tsx` (`function Row`),
 * chamada com label="Mediana de views".
 */
export function LegacyStatRow({ value }: { value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", color: "#64748b", marginBottom: 8 }}>
      <span>Mediana de views</span>
      <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{value}</span>
    </div>
  );
}
