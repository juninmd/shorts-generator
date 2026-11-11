export const RADAR_W = 1000;
export const RADAR_H = 170;

/** Caminho SVG da curva de energia. Valores entre 0 e 1 viram altura dentro do quadro. */
export function energyPath(energy: readonly number[]): string {
  if (energy.length === 0) return "";
  const step = energy.length > 1 ? RADAR_W / (energy.length - 1) : 0;
  const points = energy.map((value, i) => `${(i * step).toFixed(1)} ${(118 - Math.min(1, Math.max(0, value)) * 100).toFixed(1)}`);
  return `M${points.join(" L")} L${RADAR_W} 130 L0 130Z`;
}

/** Posição horizontal de um instante do vídeo-fonte. */
export function xAt(sec: number, durationSec: number): number {
  return durationSec > 0 ? (sec / durationSec) * RADAR_W : 0;
}

export function bandGeometry(startSec: number, endSec: number, durationSec: number) {
  const x = xAt(startSec, durationSec);
  return { x, width: Math.max(2, xAt(endSec, durationSec) - x) };
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
