import { google } from "googleapis";
import { loadControlPlaneConfig } from "../src/core/control-plane-config.js";
import { getControlPlanePool } from "../src/core/control-plane-db.js";
import { ChannelBundleRepository } from "../src/core/channel-bundle-repository.js";
import { createSecretStore } from "../src/core/secret-store.js";

const CHANNELS = ["akitemquiz", "quiz-channel", "santidade-catolica"];

async function main() {
  const cp = loadControlPlaneConfig();
  const repo = new ChannelBundleRepository(getControlPlanePool(cp) as any);
  const store = createSecretStore(cp);

  for (const channelId of CHANNELS) {
    const bundle = await repo.getBundle(channelId);
    const yt = bundle?.publishingAccounts.find((a) => a.provider === "youtube");
    if (!yt) {
      console.log(`${channelId}: (sem conta youtube)`);
      continue;
    }
    try {
      const refreshToken = store.decryptToken(yt.channelId, yt.id, yt.encryptedToken);
      const oauth2 = new google.auth.OAuth2(yt.clientId, yt.clientSecret);
      oauth2.setCredentials({ refresh_token: refreshToken });
      const yt3 = google.youtube({ version: "v3", auth: oauth2 });
      const res = await yt3.channels.list({ mine: true, part: ["snippet"] } as any);
      const ch = res.data.items?.[0];
      console.log(`${channelId} -> YouTube: "${ch?.snippet?.title}" (id=${ch?.id})  clientId=${yt.clientId.slice(0, 20)}`);
    } catch (e: any) {
      console.log(`${channelId} -> ERРО: ${e?.message || e}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
