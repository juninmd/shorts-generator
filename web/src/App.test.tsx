import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import App from "./App";

vi.mock("./hooks/useAdminConsole", () => ({
  useAdminConsole: () => ({
    adminToken: "",
    setAdminToken: vi.fn(),
    channels: [],
    runs: [],
    selectedChannelId: "",
    setSelectedChannelId: vi.fn(),
    error: "Falha ao carregar",
    isPending: false,
    save: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
    run: vi.fn(),
    refreshNow: vi.fn(),
  }),
}));

describe("App", () => {
  it("renders the admin console empty-token state", () => {
    render(<App />);

    expect(screen.getByText("Painel de controle")).toBeInTheDocument();
    expect(screen.getByText("Configure o token para ver os canais")).toBeInTheDocument();
    expect(screen.getByText("Tipo de fluxo")).toBeInTheDocument();
    expect(screen.getByText("Cortes")).toBeInTheDocument();
    expect(screen.getByText("Quiz")).toBeInTheDocument();
  });
});
