import { useState, FormEvent } from "react";

interface VideoInputProps {
  onSubmit: (urls: string[]) => void;
  isLoading: boolean;
}

export function VideoInput({ onSubmit, isLoading }: VideoInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const urls = input
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith("http"));

    if (urls.length > 0) {
      onSubmit(urls);
    }
  };

  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-semibold text-white">
        Gerar Shorts
      </h2>
      <p className="mb-4 text-sm text-gray-400">
        Cole URLs de vídeos do YouTube (um por linha ou separados por vírgula)
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="input min-h-[100px] resize-y"
          placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />

        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {input.split(/[\n,]/).filter((u) => u.trim().startsWith("http")).length}{" "}
            URL(s) detectada(s)
          </p>
          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <>
                <Spinner /> Processando...
              </>
            ) : (
              <>
                <ScissorsIcon /> Gerar Cortes
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function ScissorsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
    </svg>
  );
}
