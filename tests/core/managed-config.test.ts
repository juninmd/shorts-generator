import { describe, expect, it, vi } from "vitest";

const { resolveMock, buildMock } = vi.hoisted(() => ({ resolveMock: vi.fn(), buildMock: vi.fn() }));

vi.mock("../../src/core/channel-affiliate-repository.js", () => ({ ChannelAffiliateRepository: class {} }));
vi.mock("../../src/core/channel-bundle-repository.js", () => ({ ChannelBundleRepository: class {} }));
vi.mock("../../src/core/channel-config-resolver.js", () => ({
  ChannelConfigResolver: class { resolveRunConfig = resolveMock; },
  buildManagedPipelineConfig: buildMock,
}));
vi.mock("../../src/core/config.js", () => ({ loadConfig: vi.fn(() => ({ base: true })) }));
vi.mock("../../src/core/control-plane-config.js", () => ({ loadControlPlaneConfig: vi.fn(() => ({})) }));
vi.mock("../../src/core/control-plane-db.js", () => ({ getControlPlanePool: vi.fn(() => ({})) }));
vi.mock("../../src/core/secret-store.js", () => ({ createSecretStore: vi.fn(() => ({})) }));

import { loadManagedConfig } from "../../src/core/managed-config.js";

describe("loadManagedConfig", () => {
  it("resolves the channel and builds its pipeline config on top of the base one", async () => {
    resolveMock.mockResolvedValue({ resolved: true });
    buildMock.mockReturnValue({ managed: true });
    expect(await loadManagedConfig("santidade-catolica")).toEqual({ managed: true });
    expect(resolveMock).toHaveBeenCalledWith(expect.any(String), "santidade-catolica");
    expect(buildMock).toHaveBeenCalledWith({ base: true }, expect.any(String), { resolved: true });
  });
});
