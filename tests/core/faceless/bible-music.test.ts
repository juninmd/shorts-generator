import { beforeEach, describe, expect, it, vi } from "vitest";

const { existsMock, readdirMock, readMock, pickMock } = vi.hoisted(() => ({ existsMock: vi.fn(), readdirMock: vi.fn(), readMock: vi.fn(), pickMock: vi.fn() }));

vi.mock("node:fs", () => {
  const api = { existsSync: existsMock, readdirSync: readdirMock, readFileSync: readMock };
  return { ...api, default: api };
});
vi.mock("../../../src/core/audio-ducking.js", () => ({ pickBackgroundMusic: pickMock }));

import { bibleMusicCredit, pickBibleMusic } from "../../../src/core/faceless/bible-music.js";

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

  it("falls back to the bundled original ambient track in assets/music/bible", () => {
    readdirMock.mockReturnValue(["README.txt", "contemplativa.mp3"]);
    expect(pickBibleMusic()?.replace(/\\/g, "/")).toBe("assets/music/bible/contemplativa.mp3");
    expect(existsMock).toHaveBeenCalledWith("assets/music/bible");
  });

  it("returns nothing when there is no folder or no track in it", () => {
    existsMock.mockReturnValueOnce(false);
    expect(pickBibleMusic()).toBeUndefined();
    readdirMock.mockReturnValue(["README.txt"]);
    expect(pickBibleMusic()).toBeUndefined();
  });
});

describe("bibleMusicCredit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReturnValue(true);
    readMock.mockReturnValue(JSON.stringify({ "reminiscing.mp3": "Reminiscing" }));
  });

  it("gives the CC BY 4.0 credit for a bundled track", () => {
    const credit = bibleMusicCredit("assets/music/bible/reminiscing.mp3");
    expect(credit).toContain('"Reminiscing" — Kevin MacLeod (incompetech.com)');
    expect(credit).toContain("creativecommons.org/licenses/by/4.0");
  });

  it("has no credit without a track, a credits file or an entry for it", () => {
    expect(bibleMusicCredit(undefined)).toBeUndefined();
    expect(bibleMusicCredit("assets/music/bible/other.mp3")).toBeUndefined();
    existsMock.mockReturnValue(false);
    expect(bibleMusicCredit("/custom/song.mp3")).toBeUndefined();
  });
});

