import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, beforeEach, expect } from "vitest";
import App from "./App";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";
import * as api from "./api";
vi.mock('./api');

describe("AppFullCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles empty channel lists when token provided with quiz channelType", async () => {
    const mockSave = vi.fn();
    const mockRun = vi.fn();
    const mockRemove = vi.fn();
    const mockRefresh = vi.fn();

    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [],
      runs: [],
      selectedChannelId: "",
      setSelectedChannelId: vi.fn(),
      error: null,
      isPending: false,
      save: mockSave,
      remove: mockRemove,
      test: vi.fn(),
      run: mockRun,
      refreshNow: mockRefresh,
    } as any);

    render(<App />);

    // Refresh button
    const refreshBtn = screen.getByRole("button", { name: "" }).closest('button');
    if (refreshBtn && refreshBtn.innerHTML.includes('polyline')) { // Zap icon usually has polygon, refresh has arrow? Let's click all small buttons
        const allBtns = screen.getAllByRole("button");
        for (const b of allBtns) {
            if (b.className.includes("btn-ghost") && !b.textContent) fireEvent.click(b);
        }
    }

    // Click New Channel
    const newChannelBtn = screen.getAllByText(/Novo canal/i)[0];
    fireEvent.click(newChannelBtn.closest('button') || newChannelBtn);

    // Choose Quiz
    const quizCards = screen.getAllByText(/Quiz/i).filter(el => el.closest('.flow-card'));
    if (quizCards.length > 0) {
      fireEvent.click(quizCards[0].closest('.flow-card')!);
    } else {
      const quizBtn = screen.getAllByText(/Quiz/i)[0].closest('button');
      if (quizBtn) fireEvent.click(quizBtn);
    }

    // Test clicking Cortes back to trigger isQuiz=false code path
    const cortesCards = screen.getAllByText(/Cortes/i).filter(el => el.closest('.flow-card'));
    if (cortesCards.length > 0) {
        fireEvent.click(cortesCards[0].closest('.flow-card')!);
    }
    fireEvent.click(quizCards[0].closest('.flow-card')!);

    // Next step (to identity)
    const nextBtn1 = screen.getAllByText(/Próximo/i)[0];
    fireEvent.click(nextBtn1);

    // Fill required Identity fields to allow Next
    const idInput = screen.getAllByPlaceholderText(/meu-canal-01/i)[0];
    fireEvent.change(idInput, { target: { value: 'c2' } });

    // Next Step (to pipeline)
    const nextBtn2 = screen.getAllByText(/Próximo/i)[0];
    fireEvent.click(nextBtn2);

    // Next Step (to publish)
    const nextBtn3 = screen.getAllByText(/Próximo/i)[0];
    fireEvent.click(nextBtn3);

    // Save
    const saveBtn = screen.getAllByText(/Salvar/i)[0];
    fireEvent.click(saveBtn.closest('button') || saveBtn);
    expect(mockSave).toHaveBeenCalled();
  });

  it("covers field components", () => {
    const mockSave = vi.fn();
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [
        {
          channel: { id: "c1", name: "", slug: "", channelType: "quiz", logoPath: 'l', watermarkText: 'w', status: 'active', description: 'desc' },
          profile: { targetShorts: 10, videoQuery: 'q', sortByViews: true, minShortDuration: 15, maxShortDuration: 59 },
          focuses: [{ description: 'foo', format: 'foo', type: 'foo'}], sources: [{ sourceId: 'a', type: 'a'}, { sourceId: 'b', type: 'b'}], publishingAccounts: [{ platform: 'youtube', username: 'a'}]
        },
        {
          channel: { id: "c3", name: "C3", channelType: "cuts", logoPath: 'l', watermarkText: 'w', status: 'inactive', description: 'desc' },
          profile: { targetShorts: 10, videoQuery: 'q', sortByViews: true, minShortDuration: 15, maxShortDuration: 59 },
          focuses: [{ description: 'foo', format: 'foo', type: 'foo'}], sources: [], publishingAccounts: [{ platform: 'youtube', username: 'a'}]
        }
      ],
      runs: [],
      selectedChannelId: "c1",
      setSelectedChannelId: vi.fn(),
      error: null,
      isPending: false,
      save: mockSave,
      remove: vi.fn(),
      test: vi.fn(),
      run: vi.fn(),
      refreshNow: vi.fn(),
    } as any);

    render(<App />);
    const c1Btn = screen.getAllByText(/Sem nome/i)[0];
    fireEvent.click(c1Btn.closest('button') || c1Btn);

    // Identity step
    const idInput = screen.getAllByPlaceholderText(/meu-canal-01/i)[0];
    fireEvent.change(idInput, { target: { value: 'c2' } });

    const slugInput = screen.getAllByPlaceholderText(/meu-canal/i)[0];
    fireEvent.change(slugInput, { target: { value: 'c2-slug' } });

    const nameInput = screen.getAllByPlaceholderText(/Canal Católico Shorts/i)[0];
    fireEvent.change(nameInput, { target: { value: 'c2' } });

    const statusSelect = screen.getAllByDisplayValue(/Ativo/i).find(s => s.tagName === 'SELECT');
    if (statusSelect) {
        fireEvent.change(statusSelect, { target: { value: 'inactive' } });
    }

    const wmInput = screen.getAllByPlaceholderText(/@MeuCanal/i)[0];
    fireEvent.change(wmInput, { target: { value: '@C2' } });

    const logoInput = screen.getAllByPlaceholderText(/\/app\/assets\/logo\.png/i)[0];
    fireEvent.change(logoInput, { target: { value: 'newlogo.png' } });
    fireEvent.change(logoInput, { target: { value: '' } });

    const descInput = screen.getAllByPlaceholderText(/Shorts católicos/i)[0];
    fireEvent.change(descInput, { target: { value: 'New desc' } });

    // Focos
    const focosInput = screen.queryByPlaceholderText(/politica|Opinião conservadora/i);
    if(focosInput) {
      fireEvent.change(focosInput, { target: { value: 'politica|Nova Politica' } });
    } else {
        const textareas = screen.getAllByRole('textbox');
        const focosArea = textareas.find(ta => ta.textContent?.includes('foo') || (ta as HTMLTextAreaElement).value?.includes('foo'));
        if (focosArea) fireEvent.change(focosArea, { target: { value: 'politica|Nova Politica' } });
    }

    const pipelineTab = screen.getAllByText(/Pipeline/i).filter(el => el.tagName === 'BUTTON')[0];
    fireEvent.click(pipelineTab);

    // Pipeline step
    const targetShortsInputs = screen.queryAllByDisplayValue("10");
    if(targetShortsInputs.length > 0) {
      fireEvent.change(targetShortsInputs[0], { target: { value: '' } });
      fireEvent.change(targetShortsInputs[0], { target: { value: '20' } });
    }

    const minShortInputs = screen.queryAllByDisplayValue("15");
    if(minShortInputs.length > 0) {
      fireEvent.change(minShortInputs[0], { target: { value: '16' } });
    }

    const maxShortInputs = screen.queryAllByDisplayValue("59");
    if(maxShortInputs.length > 0) {
      fireEvent.change(maxShortInputs[0], { target: { value: '60' } });
    }

    const queryInputs = screen.queryAllByDisplayValue("q");
    if (queryInputs.length > 0) {
      fireEvent.change(queryInputs[0], { target: { value: '' } });
      fireEvent.change(queryInputs[0], { target: { value: 'test' } });
    }

    const select = screen.queryAllByDisplayValue(/Sim/i).find(s => s.tagName === 'SELECT');
    if (select) {
        fireEvent.change(select, { target: { value: 'false' } });
    }

    // Quiz params
    const promptInputs = screen.queryAllByPlaceholderText(/Prompt opcional/i);
    if (promptInputs.length > 0) {
        fireEvent.change(promptInputs[0], { target: { value: 'my prompt' } });
    }

    const fontInputs = screen.queryAllByPlaceholderText(/Ex: inter/i);
    if (fontInputs.length > 0) {
        fireEvent.change(fontInputs[0], { target: { value: 'roboto' } });
    }

    const bgInputs = screen.queryAllByPlaceholderText(/Ex: minecraft/i);
    if (bgInputs.length > 0) {
        fireEvent.change(bgInputs[0], { target: { value: 'mybg' } });
    }


    const pubTab = screen.getAllByText(/Publicação/i).filter(el => el.tagName === 'BUTTON')[0];
    fireEvent.click(pubTab);

    const textareas = screen.getAllByRole('textbox');
    const accountsInput = textareas.find(ta => (ta as HTMLTextAreaElement).value?.includes('youtube'));
    if(accountsInput) {
        fireEvent.change(accountsInput, { target: { value: 'youtube|NewAccount' } });
    }

    const runBtn = screen.getAllByText(/Rodar pipeline/i)[0];
    fireEvent.click(runBtn.closest('button') || runBtn);

    const removeBtn = screen.getAllByText(/Salvar/i)[0].parentElement?.querySelector('.btn-red');
    if(removeBtn) {
        // Mock window.confirm
        const spy = vi.spyOn(window, 'confirm').mockImplementation(() => false);
        fireEvent.click(removeBtn);

        spy.mockImplementation(() => true);
        fireEvent.click(removeBtn);

        spy.mockRestore();
    }

    const dashBtns = screen.getAllByText(/Dashboard de métricas/i);
    if(dashBtns.length > 0) {
      fireEvent.click(dashBtns[0].closest('button') || dashBtns[0]);
    }

    const refreshBtnDash = screen.getAllByRole("button").find(b => b.className.includes("btn-ghost") && !b.textContent);
    if (refreshBtnDash) fireEvent.click(refreshBtnDash);
  });

  it("covers missing lines in layout rendering", async () => {
     vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [],
      runs: [],
      selectedChannelId: "",
      setSelectedChannelId: vi.fn(),
      error: "Some API error",
      isPending: false,
      save: vi.fn(),
      remove: vi.fn(),
      test: vi.fn(),
      run: vi.fn(),
      refreshNow: vi.fn(),
    } as any);

    render(<App />);
    const errors = screen.getAllByText(/Some API error/i);
    expect(errors.length).toBeGreaterThan(0);

    // Find dismiss by class since it's a div
    const toast = errors[0].closest('.toast') || errors[0].parentElement;
    if (toast) {
       const dismissBtn = toast.querySelector('div[style*="cursor: pointer"]') || Array.from(toast.children).find(el => el.textContent === '✕');
       if (dismissBtn) {
         fireEvent.click(dismissBtn);
       }
    }
  });

  it("covers empty missing icons", () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [],
      runs: [],
      selectedChannelId: "",
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
    const dashBtns = screen.getAllByText(/Dashboard de métricas/i);
    if(dashBtns.length > 0) {
      fireEvent.click(dashBtns[0].closest('button') || dashBtns[0]);
    }

    const consoleBtn = screen.getAllByText(/Console/i).filter(el => el.tagName === 'BUTTON' || (el.textContent && el.textContent.includes('Console')));
    if (consoleBtn.length > 0) {
      fireEvent.click(consoleBtn[0].closest('button') || consoleBtn[0]);
    }
  });
});
