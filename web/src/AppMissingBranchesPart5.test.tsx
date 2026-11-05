import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { Ico } from "./App";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("AppMissingBranchesPart5", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("covers missing branches", async () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [
        {
          channel: { id: "c1", name: "C1", slug: "c1", channelType: "quiz" },
          profile: { targetShorts: 1 },
          focuses: [],
          sources: [],
          publishingAccounts: [
              { provider: 'youtube' },
              { provider: 'telegram' }
          ]
        }
      ],
      runs: [],
      selectedChannelId: "c1",
      setSelectedChannelId: vi.fn(),
      error: null,
      isPending: false,
      save: vi.fn(),
      remove: vi.fn(),
      test: vi.fn(),
      run: vi.fn(),
      refreshNow: vi.fn(),
    } as any);

    render(<App />);

    const c1Btn = screen.getAllByText(/C1/i).find(el => el.tagName === 'DIV');
    if (c1Btn) fireEvent.click(c1Btn.closest('button') || c1Btn);

    // Fontes de video
    const fTab = screen.getAllByRole("button").find(t => t.textContent?.includes("Identidade"));
    if (fTab) fireEvent.click(fTab);
    const textareas = document.querySelectorAll('textarea');
    const fontsText = Array.from(textareas).find(ta => ta.placeholder.includes('youtube_channel'));
    if(fontsText) fireEvent.change(fontsText, { target: { value: 'kind|label|val' } });

    const slug = screen.getAllByPlaceholderText(/meu-canal/i).find(el => (el as HTMLInputElement).placeholder === 'meu-canal');
    if(slug) fireEvent.change(slug, { target: { value: 'slug2' } });

    const pipeTab = screen.getAllByRole("button").find(t => t.textContent?.includes("Pipeline"));
    if (pipeTab) fireEvent.click(pipeTab);

    // fields
    const videoLimit = screen.queryByDisplayValue(/10/i);
    if(videoLimit) fireEvent.change(videoLimit, { target: { value: '2' } });

    const allInputsNum = document.querySelectorAll('input[type="number"]');

    const meta = Array.from(allInputsNum).find(i => (i.parentElement?.previousElementSibling as any)?.textContent === 'Meta de shorts');
    if(meta) fireEvent.change(meta, { target: { value: '' } });

    const q = screen.queryByPlaceholderText(/homilia/i);
    if(q) fireEvent.change(q, { target: { value: 'q2' } });

    const sort = screen.getAllByDisplayValue(/Mais recentes/i).find(s => s.tagName === 'SELECT');
    if (sort) fireEvent.change(sort, { target: { value: 'true' } });

    const aiProv = screen.getAllByDisplayValue(/Ollama/i).find(s => s.tagName === 'SELECT');
    if (aiProv) fireEvent.change(aiProv, { target: { value: 'openrouter' } });

    const aiModel = screen.queryByPlaceholderText(/gemma3:1b/i);
    if(aiModel) fireEvent.change(aiModel, { target: { value: 'gemini' } });

    // step 3
    const pubTab = screen.getAllByRole("button").find(t => t.textContent?.includes("Publicação"));
    if (pubTab) fireEvent.click(pubTab);

    const ytId = screen.queryByPlaceholderText(/@MeuCanal/i);
    if (ytId) {
        fireEvent.change(ytId, { target: { value: 'yt2' } });
    }

    // Check Client ID
    const clientId = screen.queryByPlaceholderText(/439580...apps.googleusercontent.com/i);
    if (clientId) fireEvent.change(clientId, { target: { value: 'cid' } });

    // Check Client Secret
    const clientSecret = screen.queryByPlaceholderText(/GOCSPX-.../i);
    if (clientSecret) fireEvent.change(clientSecret, { target: { value: 'cs' } });

    // Check Refresh Token (youtube)
    const ytRt = screen.queryByPlaceholderText(/1\/\/0h.../i);
    if (ytRt) fireEvent.change(ytRt, { target: { value: 'rt' } });

    const tgRt = screen.queryByPlaceholderText(/123456:ABCdef.../i);
    if (tgRt) fireEvent.change(tgRt, { target: { value: 'tg' } });

    const tgId = screen.queryByPlaceholderText(/-100xxxxxxxxxx/i);
    if (tgId) fireEvent.change(tgId, { target: { value: 'tgid' } });

    const orKey = screen.queryByPlaceholderText(/sk-or-v1-.../i);
    if (orKey) fireEvent.change(orKey, { target: { value: 'sk' } });

    const refreshBtn = screen.getAllByRole("button").find(t => t.innerHTML?.includes("refresh"));
    if(refreshBtn) fireEvent.click(refreshBtn);
  });
});
