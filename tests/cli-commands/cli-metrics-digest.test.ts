import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runMetricsDigestCommand } from "../../src/cli-commands/cli-metrics-digest.js";
import { loadConfig } from "../../src/core/config.js";
import { tryLoadControlPlaneConfig } from "../../src/core/control-plane-config.js";
import { getControlPlanePool } from "../../src/core/control-plane-db.js";
import { collectChannelSnapshots } from "../../src/core/feedback/snapshot-collector.js";
import { sendDailyDashboardDigest } from "../../src/core/feedback/dashboard-notify.js";
import { logger } from "../../src/core/logger.js";
import { ChannelBundleRepository } from "../../src/core/channel-bundle-repository.js";

vi.mock("../../src/core/config.js");
vi.mock("../../src/core/control-plane-config.js");
vi.mock("../../src/core/control-plane-db.js");
vi.mock("../../src/core/feedback/snapshot-collector.js");
vi.mock("../../src/core/feedback/dashboard-notify.js");
vi.mock("../../src/core/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

const listBundlesMock = vi.hoisted(() => vi.fn().mockResolvedValue([
  { channel: { id: "ch1", status: "active" } },
  { channel: { id: "ch2", status: "inactive" } }
]));

vi.mock("../../src/core/channel-bundle-repository.js", () => ({
  ChannelBundleRepository: class {
    listBundles = listBundlesMock;
  }
}));

describe("cli-metrics-digest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tryLoadControlPlaneConfig).mockReturnValue({} as any);
    vi.mocked(getControlPlanePool).mockReturnValue({} as any);
    vi.mocked(loadConfig).mockReturnValue({} as any);
    vi.mocked(collectChannelSnapshots).mockResolvedValue({} as any);
    vi.mocked(sendDailyDashboardDigest).mockResolvedValue({} as any);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("should warn and return if control plane config is missing", async () => {
    vi.mocked(tryLoadControlPlaneConfig).mockReturnValue(undefined);
    await runMetricsDigestCommand();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("control-plane não configurado"));
    expect(getControlPlanePool).not.toHaveBeenCalled();
  });

  it("should collect snapshots and send digest for active channels", async () => {
    await runMetricsDigestCommand();
    expect(listBundlesMock).toHaveBeenCalled();
    expect(collectChannelSnapshots).toHaveBeenCalledTimes(1);
    expect(collectChannelSnapshots).toHaveBeenCalledWith(expect.anything(), "ch1", expect.anything());
    expect(sendDailyDashboardDigest).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ channels: 1 }), expect.stringContaining("digest diário processado"));
  });
});
