import type { JobStatus } from "../types";

interface ProcessingStatusProps {
  job: JobStatus;
}

export function ProcessingStatus({ job }: ProcessingStatusProps) {
  const progress = job.progress;

  if (!progress) return null;

  const stageLabels: Record<string, string> = {
    downloading: "📥 Baixando vídeo",
    transcribing: "🎙️ Transcrevendo áudio",
    analyzing: "🧠 Analisando momentos virais",
    cutting: "✂️ Gerando shorts",
    subtitling: "📝 Aplicando legendas",
    uploading: "📤 Enviando para Telegram",
    done: "✅ Concluído",
    error: "❌ Erro",
  };

  const stageLabel = stageLabels[progress.stage] ?? progress.stage;

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{stageLabel}</h3>
        <span className="text-xs text-gray-400">
          {progress.progress.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500"
          style={{ width: `${Math.min(progress.progress, 100)}%` }}
        />
      </div>

      <p className="text-sm text-gray-400">{progress.message}</p>

      {progress.videoTitle && (
        <p className="mt-1 text-xs text-gray-500">
          🎥 {progress.videoTitle}
        </p>
      )}

      {progress.currentShort != null && progress.totalShorts != null && (
        <p className="mt-1 text-xs text-gray-500">
          ✂️ Short {progress.currentShort} de {progress.totalShorts}
        </p>
      )}

      {job.status === "completed" && job.results && (
        <div className="mt-4 rounded-lg bg-green-950/50 p-3 text-sm text-green-400">
          ✅ Processamento concluído!{" "}
          {job.results.reduce((sum, r) => sum + r.shorts.length, 0)} shorts
          gerados.
        </div>
      )}

      {job.status === "failed" && (
        <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-400">
          ❌ Falha no processamento: {progress.message}
        </div>
      )}
    </div>
  );
}
