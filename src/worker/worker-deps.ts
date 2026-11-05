import { hostname } from "node:os";
import { ChannelBundleRepository } from "../core/channel-bundle-repository.js";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "../core/channel-config-resolver.js";
import { loadConfig } from "../core/config.js";
import type { ControlPlaneConfig } from "../core/control-plane-config.js";
import type { SqlClient } from "../core/control-plane-db.js";
import { publishDepsFor } from "../core/publication/clip-publication-flow.js";
import type { PublishDeps } from "../core/publication/publish-service.js";
import { PublicationRepository } from "../core/publication/publication-repository.js";
import type { RegenerateDeps } from "../core/publication/regenerate.js";
import { DurableRunRepository } from "../core/runs/durable-run-repository.js";
import type { RunExecutorDeps } from "../core/runs/run-executor.js";
import { createSecretStore } from "../core/secret-store.js";
import type { PipelineConfig } from "../types.js";

export interface WorkerContext {
  readonly db: SqlClient;
  readonly runs: DurableRunRepository;
  readonly publications: PublicationRepository;
  readonly bundles: ChannelBundleRepository;
  readonly runDeps: RunExecutorDeps;
  readonly publishDeps: PublishDeps;
  readonly regenerateDeps: RegenerateDeps;
  readonly resolveChannelConfig: (channelId: string, runId?: string) => Promise<PipelineConfig>;
}

/** Everything is resolved per execution so rotated tokens are picked up without re-enqueueing. */
export function buildWorkerContext(db: SqlClient, cp: ControlPlaneConfig, owner = `${hostname()}-${process.pid}`): WorkerContext {
  const bundles = new ChannelBundleRepository(db);
  const resolver = new ChannelConfigResolver(bundles, createSecretStore(cp));
  const runs = new DurableRunRepository(db);
  const publications = new PublicationRepository(db);
  const resolveChannelConfig = async (channelId: string, runId = `worker-${Date.now()}`) =>
    buildManagedPipelineConfig(loadConfig(), runId, await resolver.resolveRunConfig(runId, channelId));

  const runDeps: RunExecutorDeps = {
    runs,
    owner,
    resolveConfig: async (runId, channelId, options) => {
      const resolved = await resolver.resolveRunConfig(runId, channelId);
      const overrides = (options.overrides ?? {}) as Partial<PipelineConfig>;
      return {
        config: buildManagedPipelineConfig(loadConfig(), runId, resolved, overrides),
        channelType: resolved.channel.channelType,
        channelName: resolved.channel.name,
      };
    },
  };

  const basePublish = publishDepsFor(db, loadConfig());
  const publishDeps: PublishDeps = {
    ...basePublish,
    repo: publications,
    resolveConfig: async (channelId) => resolveChannelConfig(channelId),
  };
  const regenerateDeps: RegenerateDeps = { repo: publications, resolveConfig: async (channelId) => resolveChannelConfig(channelId) };
  return { db, runs, publications, bundles, runDeps, publishDeps, regenerateDeps, resolveChannelConfig };
}
