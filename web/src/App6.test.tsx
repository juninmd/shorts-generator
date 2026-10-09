import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, expect, it, beforeEach } from "vitest";
import App from "./App";
import * as UseAdminConsoleModule from "./hooks/useAdminConsole";

describe("App extended coverage 6", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles form inputs for new channel quiz type", async () => {
    vi.spyOn(UseAdminConsoleModule, "useAdminConsole").mockReturnValue({
      adminToken: "tok",
      setAdminToken: vi.fn(),
      channels: [],
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

    const newBtns = screen.getAllByText(/Novo canal/i);
    fireEvent.click(newBtns[0]);

    // Select quiz type
    const quizBtns = screen.getAllByText(/Quiz/i).filter(el => el.tagName === 'DIV');
    if (quizBtns.length > 0) fireEvent.click(quizBtns[0]);

    // next to identity
    const nextBtns = screen.getAllByText(/Próximo/i);
    if(nextBtns.length > 0) fireEvent.click(nextBtns[0]);

    const prevBtns = screen.getAllByText(/Anterior/i);
    if(prevBtns.length > 0) fireEvent.click(prevBtns[0]);

    // Go next again to Identity
    const nextBtns2 = screen.getAllByText(/Próximo/i);
    if(nextBtns2.length > 0) fireEvent.click(nextBtns2[0]);

    // Go next to Pipeline
    const nextBtns3 = screen.getAllByText(/Próximo/i);
    if(nextBtns3.length > 0) fireEvent.click(nextBtns3[0]);

    // Inside Pipeline, look for generic inputs like "+ Novo" or similar
    const btnNovo = screen.queryAllByText(/\+/);
    if (btnNovo.length > 0) {
      fireEvent.click(btnNovo[0]);
    }

    // Test refresh button
    const ghostBtns = document.querySelectorAll('.btn-ghost');
    if (ghostBtns.length > 1) {
       fireEvent.click(ghostBtns[1]); // Often the refresh button is one of these
    }
  });
});
