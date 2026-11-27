/**
 * Antes: o botão do painel. Recorte literal dos call sites de
 * `git show origin/master:web/src/App.tsx` (sidebar, header e wizard), onde cada ação montava
 * `<button className="btn btn-brand|btn-ghost|btn-green|btn-red">`. Só o wrapper mudou.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function LegacyButton({ variant = "brand", children, icon, ...rest }: {
  variant?: "brand" | "ghost" | "green" | "red" | "amber";
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn btn-${variant}`} {...rest}>
      {icon}
      {children}
    </button>
  );
}
