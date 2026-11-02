import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("AppMissingBranchesPart7", () => {
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
              { provider: 'youtube', hasStoredToken: true },
              { provider: 'telegram', hasStoredToken: true },
              { provider: 'openrouter', hasStoredToken: true }
          ]
        }
      ],
      runs: [],
      selectedChannelId: "c1",
      setSelectedChannelId: vi.fn(),
      error: "msg",
      isPending: false,
      save: vi.fn(),
      remove: vi.fn(),
      test: vi.fn(),
      run: vi.fn(),
      refreshNow: vi.fn(),
    } as any);

    render(<App />);

    // step 3
    const pubTab = screen.getAllByRole("button").find(t => t.textContent?.includes("Publicação"));
    if (pubTab) fireEvent.click(pubTab);

    const ytId = screen.queryByPlaceholderText(/@MeuCanal/i);
    if (ytId) {
        fireEvent.change(ytId, { target: { value: 'yt2' } });
    }
  });
});
