import { beforeEach, describe, expect, it, vi } from "vitest";

const { existsMock, readdirMock, pickMock } = vi.hoisted(() => ({ existsMock: vi.fn(), readdirMock: vi.fn(), pickMock: vi.fn() }));

vi.mock("node:fs", () => {
  const api = { existsSync: existsMock, readdirSync: readdirMock };
  return { ...api, default: api };
});
vi.mock("../../../src/core/audio-ducking.js", () => ({ pickBackgroundMusic: pickMock }));

import { pickBibleMusic } from "../../../src/core/faceless/bible-music.js";

describe("pickBibleMusic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pickMock.mockReturnValue(null);
    existsMock.mockReturnValue(true);
  });

  it("prefers the configured BGM_FILE / BGM_DIR track", () => {
    pickMock.mockReturnValue("/music/custom.mp3");
    expect(pickBibleMusic()).toBe("/music/custom.mp3");
    expect(readdirMock).not.toHaveBeenCalled();
  });

  it("falls back to a bundled background track, never beep/silence", () => {
    readdirMock.mockReturnValue(["beep.mp3", "silence.mp3", "background2.mp3"]);
    expect(pickBibleMusic("assets/music").replace(/\\/g, "/")).toBe("assets/music/background2.mp3");
  });

  it("returns nothing when there is no folder or no background track", () => {
    existsMock.mockReturnValueOnce(false);
    expect(pickBibleMusic()).toBeUndefined();
    readdirMock.mockReturnValue(["beep.mp3"]);
    expect(pickBibleMusic()).toBeUndefined();
  });
});
