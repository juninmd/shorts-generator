import { randomUUID } from "node:crypto";
import type { PipelineConfig } from "../types.js";
import { ChannelAffiliateRepository } from "./channel-affiliate-repository.js";
import { ChannelBundleRepository } from "./channel-bundle-repository.js";
import { ChannelConfigResolver, buildManagedPipelineConfig } from "./channel-config-resolver.js";
import { loadConfig } from "./config.js";
import { loadControlPlaneConfig } from "./control-plane-config.js";
import { getControlPlanePool } from "./control-plane-db.js";
import { createSecretStore } from "./secret-store.js";

/** Config de pipeline de um canal gerenciado (credenciais, foco, links de afiliado) lida do control plane. */
export async function loadManagedConfig(channelId: string): Promise<PipelineConfig> {
  const controlPlane = loadControlPlaneConfig();
  const db = getControlPlanePool(controlPlane) as any;
  const resolver = new ChannelConfigResolver(
    new ChannelBundleRepository(db), createSecretStore(controlPlane), new ChannelAffiliateRepository(db),
  );
  const resolved = await resolver.resolveRunConfig(randomUUID(), channelId);
  return buildManagedPipelineConfig(loadConfig(), randomUUID(), resolved);
}
