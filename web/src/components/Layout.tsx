import { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎬</span>
            <div>
              <h1 className="text-lg font-bold text-white">Shorts Generator</h1>
              <p className="text-xs text-gray-500">
                AI-powered viral clip extraction
              </p>
            </div>
          </div>
          <a
            href="https://github.com/jr-acc/shorts-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-400 transition hover:text-white"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 text-center text-xs text-gray-600">
        Shorts Generator — Powered by Whisper + GPT + FFmpeg
      </footer>
    </div>
  );
}
