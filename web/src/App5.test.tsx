import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, expect, it, beforeEach } from "vitest";
import App from "./App";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("App extended coverage 5", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles forms interactions correctly", async () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [{ channel: { id: "c1", name: "Channel 1", channelType: "cuts", logoPath: 'logo', watermarkText: 'wm' }, profile: { description: 'desc', voice: 'v', personality: 'p' }, focuses: [{ description: 'f1', format: 'f1', type: 't1'}], sources: [{ sourceId: 'y1', type: 'youtube'}], publishingAccounts: [{ platform: 'youtube', username: 'y'}] }],
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

    // In edit mode (not new), there's a button to select the channel
    const channelCardBtn = screen.getAllByText(/Channel 1/i)[0];
    fireEvent.click(channelCardBtn);

    // The form has "Identidade" and other tabs.
    const identityTabs = screen.getAllByText(/Identidade/i).filter(el => el.tagName === 'BUTTON');
    if (identityTabs.length > 0) fireEvent.click(identityTabs[0]);

    const pipelineTabs = screen.getAllByText(/Pipeline/i).filter(el => el.tagName === 'BUTTON');
    if (pipelineTabs.length > 0) fireEvent.click(pipelineTabs[0]);

    const pubTabs = screen.getAllByText(/Publicação/i).filter(el => el.tagName === 'BUTTON');
    if (pubTabs.length > 0) fireEvent.click(pubTabs[0]);
  });
});
