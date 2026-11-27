/**
 * Antes: as pílulas de status. Recorte de `git show origin/master:web/src/App.tsx`
 * (ChannelCard, RunCard) e de `web/src/utils.ts` (`badgeClass`), que devolvia
 * `badge badge-green|badge-amber|badge-red|badge-slate`.
 */
import type { ReactNode } from "react";

export type LegacyBadgeTone = "brand" | "amber" | "green" | "red" | "slate";

export function LegacyBadge({ tone = "slate", children }: { tone?: LegacyBadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
