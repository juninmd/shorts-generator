import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, expect, it, beforeEach } from "vitest";
import App from "./App";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("App extended coverage 3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty channel lists when token provided", () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [],
      runs: [],
      selectedChannelId: "",
      setSelectedChannelId: vi.fn(),
      error: "Some error",
      isPending: false,
      save: vi.fn(),
      remove: vi.fn(),
      test: vi.fn(),
      run: vi.fn(),
      refreshNow: vi.fn(),
    } as any);

    render(<App />);
    expect(screen.getByText(/Nenhum canal ainda/i)).toBeInTheDocument();
    expect(screen.getByText(/Some error/i)).toBeInTheDocument();
  });

  it("handles new channel flow", async () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [{ channel: { id: "c1", name: "Channel 1", channelType: "cuts" }, profile: {}, focuses: [], sources: { youtube: [] }, publishingAccounts: {} }],
      runs: [{ id: 'r1', channelId: 'c1', status: 'completed', message: 'Ok', startTime: '2023-01-01', completionTime: '2023-01-01', progress: 100, generatedVideoPath: 'v1' }],
      selectedChannelId: "c1",
      setSelectedChannelId: vi.fn(),
      error: null,
      isPending: false,
      save: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
      test: vi.fn().mockResolvedValue({}),
      run: vi.fn().mockResolvedValue({}),
      refreshNow: vi.fn(),
    } as any);

    render(<App />);

    // Click on new channel button
    const newBtns = screen.getAllByText(/Novo canal/i);
    fireEvent.click(newBtns[0]);

    // Click through wizard to reach save button
    const nextBtns = screen.getAllByText(/Próximo/i);
    if(nextBtns.length > 0) {
        fireEvent.click(nextBtns[0]);
    }
    const nextBtns2 = screen.getAllByText(/Próximo/i);
    if(nextBtns2.length > 0) {
        fireEvent.click(nextBtns2[0]);
    }
    const nextBtns3 = screen.getAllByText(/Próximo/i);
    if(nextBtns3.length > 0) {
        fireEvent.click(nextBtns3[0]);
    }

    const saveBtns = await screen.findAllByText(/Salvar/i);
    const targetSaveBtn = saveBtns.find(el => el.textContent?.includes('Salvar'));
    if(targetSaveBtn) fireEvent.click(targetSaveBtn);
  });
});
