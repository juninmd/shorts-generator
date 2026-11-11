import { useEffect, useState } from "react";

export interface ShortPreviewProps {
  captions: string;
  hook?: string;
  cta?: string;
  watermark?: string;
  accent?: string;
  position?: "top" | "middle" | "bottom";
}

const TOP: Record<NonNullable<ShortPreviewProps["position"]>, string> = { top: "18%", middle: "44%", bottom: "68%" };

/** Prévia 9:16 do short. As legendas acendem palavra a palavra, como karaokê. */
export function ShortPreview({ captions, hook, cta, watermark, accent = "#818cf8", position = "bottom" }: ShortPreviewProps) {
  const words = captions.trim().split(/\s+/).filter(Boolean);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    setLit(0);
    if (words.length === 0) return;
    const id = setInterval(() => setLit((n) => (n >= words.length ? n : n + 1)), 300);
    return () => clearInterval(id);
  }, [captions]);

  return (
    <div data-testid="short-preview" className="relative mx-auto aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-[26px] border-[6px] border-slate-800 bg-gradient-to-br from-slate-800 to-slate-950">
      {watermark && <span className="absolute right-3 top-3 font-mono text-[10px] text-white/70">{watermark}</span>}
      {hook && <div className="absolute inset-x-[8%] top-[12%] text-center text-sm font-extrabold text-white">{hook}</div>}
      <p className="absolute inset-x-[6%] text-center text-base font-extrabold uppercase leading-tight text-white" style={{ top: TOP[position] }}>
        {words.map((word, i) => (
          <span key={`${i}-${word}`} style={{ color: i < lit ? accent : "#ffffff" }}>
            {word}{" "}
          </span>
        ))}
      </p>
      {cta && <div className="absolute inset-x-[10%] bottom-[6%] rounded-full bg-indigo-500 py-1.5 text-center text-xs font-bold text-white">{cta}</div>}
    </div>
  );
}
