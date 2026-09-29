import { vi } from "vitest";

export function setupComicMocks() {
  vi.mock("node:child_process", () => ({
    execFile: vi.fn(),
  }));

  vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    const overrides = {
      existsSync: vi.fn(() => true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => JSON.stringify([{ word: "test", start: 0, end: 1 }])),
    };
    return { ...actual, ...overrides, default: { ...(actual as any).default, ...overrides } };
  });
}
