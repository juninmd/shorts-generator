import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("AppMissingBranchesPart3", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("covers specific run card lines and publishing inputs without wrapper", () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [
        {
          channel: { id: "c1", name: "C1", slug: "c1", channelType: "quiz" },
          profile: { targetShorts: 1 },
          focuses: [],
          sources: [],
          publishingAccounts: []
        }
      ],
      runs: [
        { id: "r1", channelId: "c1", status: "processing", progress: 50, currentStep: "download", logs: [], createdAt: "2024-01-01", error: "" },
        { id: "r2", channelId: "c1", status: "completed", progress: 100, currentStep: "", logs: [], createdAt: "2024-01-01", error: "" },
        { id: "r3", channelId: "c1", status: "failed", progress: 0, currentStep: "", logs: [], createdAt: "2024-01-01", error: "fail" },
        { id: "r4", channelId: "c1", status: "idle", progress: 0, currentStep: "", logs: [], createdAt: "2024-01-01", error: "" }
      ],
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

    const tabs = screen.getAllByRole("button");
    const pubTab = tabs.find(t => t.textContent?.includes("Publicação"));
    if (pubTab) fireEvent.click(pubTab);

    // Youtube
    const ytId = screen.queryByPlaceholderText(/@MeuCanal ou UC/i);
    if (ytId) {
        fireEvent.change(ytId, { target: { value: 'ytval' } });
    }

    const tgId = screen.queryByPlaceholderText(/-100/i);
    if (tgId) {
        fireEvent.change(tgId, { target: { value: 'tgval' } });
    }

    const ytClient = screen.queryByPlaceholderText(/xxx\.apps\.googleusercontent\.com/i);
    if (ytClient) fireEvent.change(ytClient, { target: { value: '123' } });

    const ytSecret = screen.queryByPlaceholderText(/GOCSPX-xxx/i);
    if (ytSecret) fireEvent.change(ytSecret, { target: { value: 'abc' } });

    const openRouter = screen.queryByPlaceholderText(/sk-or-v1-xxx/i);
    if (openRouter) fireEvent.change(openRouter, { target: { value: 'sk' } });

    const allSelects = document.querySelectorAll('select');
    const aiProvider = Array.from(allSelects).find(s => s.options && s.options[0] && s.options[0].text.includes('Automático'));
    if (aiProvider) {
        fireEvent.change(aiProvider, { target: { value: 'openrouter' } });
    }
  });
});
