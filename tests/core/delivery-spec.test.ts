import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DELIVERY_SPECS,
  activeDeliverySpec,
  resolveDeliverySpec,
} from "../../src/core/delivery-spec.js";

describe("delivery specs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ships the platform targets the delivery tools read", () => {
    expect(DELIVERY_SPECS.shorts).toMatchObject({
      width: 1080, height: 1920, fps: 30, maxDuration: 180, lufs: -14, truePeak: -1, sampleRate: 48000,
      durationTolerance: 0.35,
    });
    expect(DELIVERY_SPECS.reels!.maxDuration).toBe(90);
    expect(DELIVERY_SPECS.tiktok!.maxDuration).toBe(600);
    expect(DELIVERY_SPECS.custom!.maxDuration).toBe(12 * 3600);
    expect(DELIVERY_SPECS.custom!.durationTolerance).toBe(2);
  });

  it("resolves the spellings people write for a destination", () => {
    expect(resolveDeliverySpec("youtube-shorts")?.name).toBe("shorts");
    expect(resolveDeliverySpec(" YT-Shorts ")?.name).toBe("shorts");
    expect(resolveDeliverySpec("IG")?.name).toBe("reels");
    expect(resolveDeliverySpec("instagram")?.name).toBe("reels");
    expect(resolveDeliverySpec("youtube")?.name).toBe("shorts");
    expect(resolveDeliverySpec("tiktok")?.name).toBe("tiktok");
  });

  it("returns undefined for an unknown or empty destination", () => {
    expect(resolveDeliverySpec("myspace")).toBeUndefined();
    expect(resolveDeliverySpec("   ")).toBeUndefined();
    expect(resolveDeliverySpec(undefined)).toBeUndefined();
    expect(resolveDeliverySpec(null)).toBeUndefined();
  });

  it("defaults to YouTube Shorts and honours DELIVERY_PLATFORM", () => {
    expect(activeDeliverySpec().name).toBe("shorts");
    vi.stubEnv("DELIVERY_PLATFORM", "reels");
    expect(activeDeliverySpec().name).toBe("reels");
    vi.stubEnv("DELIVERY_PLATFORM", "not-a-platform");
    expect(activeDeliverySpec().name).toBe("shorts");
  });
});
