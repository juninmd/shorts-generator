import type { ShortItem } from "../types";
import { ShortCard } from "./ShortCard";

interface ShortsListProps {
  shorts: ShortItem[];
}

export function ShortsList({ shorts }: ShortsListProps) {
  if (shorts.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-sm text-gray-500">
          Nenhum short gerado ainda. Cole um link acima para começar.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">
          Shorts Gerados ({shorts.length})
        </h2>
        <div className="flex gap-2 text-xs text-gray-500">
          <span>Ordenado por score viral</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shorts
          .sort((a, b) => b.viralScore - a.viralScore)
          .map((short) => (
            <ShortCard key={short.id} short={short} />
          ))}
      </div>
    </div>
  );
}
