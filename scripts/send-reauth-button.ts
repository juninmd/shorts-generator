import { loadControlPlaneConfig } from "../src/core/control-plane-config.js";
import { getControlPlanePool } from "../src/core/control-plane-db.js";
import { ChannelBundleRepository } from "../src/core/channel-bundle-repository.js";
import { createSecretStore } from "../src/core/secret-store.js";
import { generateReauthUrl, sendReauthAlert } from "../src/core/youtube-reauth.js";
import type { PipelineConfig } from "../src/types.js";

async function main() {
  const channelId = process.argv[2];
  if (!channelId) throw new Error("usage: send-reauth-button.ts <channelId>");

  const serverPublicUrl = process.env.SERVER_PUBLIC_URL;
  if (!serverPublicUrl) throw new Error("SERVER_PUBLIC_URL required");

  const cp = loadControlPlaneConfig();
  const repo = new ChannelBundleRepository(getControlPlanePool(cp) as any);
  const store = createSecretStore(cp);
  const bundle = await repo.getBundle(channelId);
  if (!bundle) throw new Error(`channel ${channelId} not found`);

  const yt = bundle.publishingAccounts.find((a) => a.provider === "youtube");
  const tg = bundle.publishingAccounts.find((a) => a.provider === "telegram");
  if (!yt) throw new Error("no youtube account");

  const botToken = tg ? store.decryptToken(channelId, tg.id, tg.encryptedToken) : process.env.TELEGRAM_BOT_TOKEN;
  const chatId = tg?.accountIdentifier ?? process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("no telegram credentials");

  const authUrl = generateReauthUrl(yt.clientId, yt.clientSecret, serverPublicUrl, channelId);
  const config = { telegramBotToken: botToken, telegramChatId: chatId } as PipelineConfig;

  await sendReauthAlert(channelId, bundle.channel.name, authUrl, config);
  console.log(`reauth button sent to chat ${chatId} for channel ${channelId} (${bundle.channel.name})`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
