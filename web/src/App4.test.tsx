import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, expect, it, beforeEach } from "vitest";
import App from "./App";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("App extended coverage 4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles edit channel flow", async () => {
    const mockSave = vi.fn().mockResolvedValue({});
    const mockRemove = vi.fn().mockResolvedValue({});
    const mockTest = vi.fn().mockResolvedValue({});
    const mockRun = vi.fn().mockResolvedValue({});

    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [{ channel: { id: "c1", name: "Channel 1", channelType: "cuts" }, profile: {}, focuses: [], sources: [], publishingAccounts: {} }],
      runs: [],
      selectedChannelId: "c1",
      setSelectedChannelId: vi.fn(),
      error: null,
      isPending: false,
      save: mockSave,
      remove: mockRemove,
      test: mockTest,
      run: mockRun,
      refreshNow: vi.fn(),
    } as any);

    render(<App />);

    // In edit mode (not new), there's a button to select the channel
    const channelCardBtn = screen.getAllByText(/Channel 1/i)[0];
    fireEvent.click(channelCardBtn);

    const testBtn = screen.getByText(/Testar conexão/i);
    fireEvent.click(testBtn);
    expect(mockTest).toHaveBeenCalled();

    const runBtn = screen.getByText(/Rodar pipeline/i);
    fireEvent.click(runBtn);
    expect(mockRun).toHaveBeenCalled();

    const saveBtns = screen.getAllByText(/Salvar/i).filter(el => el.textContent === ' Salvar');
    if (saveBtns.length > 0) {
       fireEvent.click(saveBtns[0]);
       expect(mockSave).toHaveBeenCalled();
    }
  });
});
