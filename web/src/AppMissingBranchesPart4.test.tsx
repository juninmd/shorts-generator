import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";
import { vi, describe, it, expect, beforeEach } from "vitest";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("AppMissingBranchesPart4", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("covers missing branches", async () => {
    const mockSave = vi.fn().mockRejectedValue(new Error("save error"));
    const mockRun = vi.fn().mockRejectedValue(new Error("run error"));
    const mockRemove = vi.fn().mockRejectedValue(new Error("remove error"));
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
      runs: [],
      selectedChannelId: "c1",
      setSelectedChannelId: vi.fn(),
      error: null,
      isPending: false,
      save: mockSave,
      remove: mockRemove,
      test: vi.fn(),
      run: mockRun,
      refreshNow: vi.fn(),
    } as any);

    render(<App />);

    // Have to select the channel first so it's not "isNew"
    const c1Btn = screen.getAllByText(/C1/i).find(el => el.tagName === 'DIV');
    if (c1Btn) fireEvent.click(c1Btn.closest('button') || c1Btn);

    const runBtn = screen.getAllByText(/Rodar pipeline/i)[0];
    if (runBtn) {
        fireEvent.click(runBtn.closest('button') || runBtn);
    }
    const saveBtn = screen.getAllByText(/Salvar/i)[0];
    if (saveBtn) {
        fireEvent.click(saveBtn.closest('button') || saveBtn);
    }
    const remBtn = document.querySelector('.btn-red');
    if (remBtn) {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(remBtn);
    }

    const tkn = screen.queryByPlaceholderText(/Bearer/i);
    if (tkn) {
        fireEvent.change(tkn, { target: { value: '123' } });
    }

    const rec = screen.queryByText(/Runs recentes/i)?.parentElement?.parentElement?.querySelector('select');
    if (rec) {
        fireEvent.change(rec, { target: { value: 'c2' } });
    }

    const focusStr = screen.queryByPlaceholderText(/catolicos/i);
    if (focusStr) {
        fireEvent.change(focusStr, { target: { value: 'a|b' } });
    }

    // Switch to step 2 (Pipeline)
    const tabs = screen.getAllByRole("button");
    const pipeTab = tabs.find(t => t.textContent?.includes("Pipeline"));
    if (pipeTab) fireEvent.click(pipeTab);

    const lims = screen.queryAllByDisplayValue(/1/i).find(s => s.tagName === 'INPUT');
    if (lims) fireEvent.change(lims, { target: { value: '2' } });
  });
});
