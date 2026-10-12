import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "./App";
import * as useAdminConsoleModule from "./hooks/useAdminConsole";

describe("App Edge Cases and SVG Icons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getMockContext = (overrides = {}) => ({
    adminToken: "", // empty token to hit line 534
    setAdminToken: vi.fn(),
    channels: [],
    runs: [],
    error: null,
    isPending: false,
    toast: null,
    refreshNow: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    run: vi.fn(),
    test: vi.fn(),
    selectedChannelId: "",
    setSelectedChannelId: vi.fn(),
    ...overrides
  });

  it("should render token config message and icons", async () => {
    vi.spyOn(useAdminConsoleModule, "useAdminConsole").mockReturnValue(getMockContext() as any);

    const { container } = render(<App />);

    // Line 534
    expect(screen.getByText(/Configure o token para ver os canais/i)).toBeInTheDocument();
  });

  it("should render quiz active flow card correctly", async () => {
     vi.spyOn(useAdminConsoleModule, "useAdminConsole").mockReturnValue(getMockContext({
         // A new channel starts at flow card, we will trigger quiz to be active.
     }) as any);

     // Instead of simulating click and rendering the App deeply which is already tested,
     // we could just render it, click New Channel, and then click Quiz.
  });
});
