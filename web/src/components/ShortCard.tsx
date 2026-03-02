import type { ShortItem } from "../types";

interface ShortCardProps {
  short: ShortItem;
}

export function ShortCard({ short }: ShortCardProps) {
  const startFormatted = formatTime(short.startTime);
  const endFormatted = formatTime(short.endTime);

  return (
    <div className="card group transition hover:border-gray-700">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-white line-clamp-2">
            {short.title}
          </h3>
          <p className="mt-1 text-xs text-gray-500">{short.channelName}</p>
        </div>
        <ScoreBadge score={short.viralScore} />
      </div>

      {/* Description */}
      <p className="mb-3 text-xs text-gray-400 line-clamp-2">
        {short.description}
      </p>

      {/* Meta */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="rounded bg-gray-800 px-2 py-0.5">
          ⏱ {short.duration.toFixed(0)}s
        </span>
        <span className="rounded bg-gray-800 px-2 py-0.5">
          🕐 {startFormatted} → {endFormatted}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <a
          href={short.downloadUrl}
          download
          className="btn-primary flex-1 text-center text-xs"
        >
          ⬇ Download
        </a>
        <a
          href={short.originalVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-400 transition hover:border-gray-500 hover:text-white"
        >
          🔗 Original
        </a>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8
      ? "text-green-400 bg-green-950"
      : score >= 5
        ? "text-yellow-400 bg-yellow-950"
        : "text-red-400 bg-red-950";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>
      ⭐ {score}/10
    </span>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
