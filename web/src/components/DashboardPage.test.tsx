import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts for a token when none is set", () => {
    render(<DashboardPage adminToken="" onBack={vi.fn()} />);
    expect(screen.getByText(/Configure o token admin/)).toBeInTheDocument();
  });

  it("renders per-channel series once the data loads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          generatedAt: "2026-09-10T12:00:00Z",
          channels: [{ channelId: "c1", channelName: "Canal A", channelType: "cuts", status: "active", series: [{ day: "2026-09-09", totalViews: 120, avgViewPercentage: null, videoCount: 2 }], windows: [] }],
        }),
      }),
    );

    render(<DashboardPage adminToken="tok" onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Canal A")).toBeInTheDocument());
  });

  it("shows the error state when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "Unauthorized" }));

    render(<DashboardPage adminToken="bad" onBack={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Unauthorized/)).toBeInTheDocument());
  });
});
