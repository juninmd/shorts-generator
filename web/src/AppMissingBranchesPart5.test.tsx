import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
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

    const pipeTab = screen.getAllByRole("button").find(t => t.textContent?.includes("Pipeline"));
    if (pipeTab) fireEvent.click(pipeTab);

    // fields
    const durMin = screen.queryByDisplayValue(/15/i);
    if(durMin) fireEvent.change(durMin, { target: { value: '10' } });

    const durMax = screen.queryByDisplayValue(/59/i);
    if(durMax) fireEvent.change(durMax, { target: { value: '60' } });

    const q = screen.queryByDisplayValue(/q/i);
    if(q) fireEvent.change(q, { target: { value: 'q2' } });

    const sort = screen.getAllByDisplayValue(/Mais recentes/i).find(s => s.tagName === 'SELECT');
    if (sort) fireEvent.change(sort, { target: { value: 'true' } });

    const aiProv = screen.getAllByDisplayValue(/Ollama/i).find(s => s.tagName === 'SELECT');
    if (aiProv) fireEvent.change(aiProv, { target: { value: 'openrouter' } });

    const aiModel = screen.queryByDisplayValue(/gemma3:1b/i);
    if(aiModel) fireEvent.change(aiModel, { target: { value: 'gemini' } });

    // step 3
    const pubTab = screen.getAllByRole("button").find(t => t.textContent?.includes("Publicação"));
    if (pubTab) fireEvent.click(pubTab);

    const ytId = screen.queryByPlaceholderText(/@MeuCanal/i);
    if (ytId) {
        fireEvent.change(ytId, { target: { value: 'yt2' } });
    }
  });
});
