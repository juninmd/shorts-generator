// setup mocks for testing short-renderer directly
import { vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
  },
}));
