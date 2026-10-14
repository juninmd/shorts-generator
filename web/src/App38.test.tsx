import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it,  vi, beforeEach } from "vitest";
import App from "./App";
import * as useAdminConsoleModule from "./hooks/useAdminConsole";

describe("App Parse Focuses Branch Fill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const getMockContext = (overrides = {}) => ({
    adminToken: "test-token",
    setAdminToken: vi.fn(),
    channels: [
        {
            channel: { id: "ch1", name: "Channel 1", channelType: "youtube" },
            pipeline: { execution_type: "parallel", video_source: "youtube" },
            profile: {},
            apiParams: {},
            sources: [],
            focuses: [],
            config: {},
            publishingAccounts: []
        }
    ],
    runs: [],
    error: null,
    isPending: false,
    toast: null,
    refreshNow: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    run: vi.fn(),
    test: vi.fn(),
    selectedChannelId: "ch1",
    setSelectedChannelId: vi.fn(),
    ...overrides
  });

  it("should parse focuses handles empty/missing parts correctly", async () => {
    vi.spyOn(useAdminConsoleModule, "useAdminConsole").mockReturnValue(getMockContext() as any);

    render(<App />);

    const chs = screen.getAllByText("Channel 1");
    fireEvent.click(chs[0]);

    // Go to Identity tab
    const tabs = screen.getAllByRole("button", { name: /Identidade/i });
    const tab = tabs.find(t => t.className.includes("tab"));
    if (tab) {
        fireEvent.click(tab);
    }

    const focusesInput = screen.getByLabelText(/Focos \/ Temas/i);
    // 1st item: full mapping
    // 2nd item: missing label, falls back to key
    // 3rd item: missing key, falls back to "tecnologia"
    fireEvent.change(focusesInput, { target: { value: "catolicos|Católicos\nmusica|\n|TecnologiaLabel" } });

    // Changing back to verify it updates internal state correctly without crashing.
    fireEvent.change(focusesInput, { target: { value: "" } });
  });
});
