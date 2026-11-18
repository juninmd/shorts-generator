import fs from "node:fs";
import path from "node:path";
import { Bot, InlineKeyboard } from "grammy";
import type { PipelineConfig } from "../../types.js";
import { logger } from "../logger.js";
import { loadManagedConfig } from "../managed-config.js";
import type { BibleShortMeta } from "./bible-meta.js";
import { publishBiblePreview } from "./bible-preview.js";

const RETRY_MS = 10_000;
const CALLBACK = /^bible:(pub|rej):([\w-]+)$/;

export const previewId = (videoPath: string): string => path.basename(videoPath, ".mp4");
export const metaPathFor = (outputDir: string, id: string): string =>
  path.join(outputDir, "comics", id, `${id}.publish.json`);

/** Botões do card de aprovação; o id (≤ 40 chars) cabe nos 64 bytes do callback_data. */
export const buildApprovalKeyboard = (id: string): InlineKeyboard =>
  new InlineKeyboard().text("✅ Publicar no YouTube", `bible:pub:${id}`).text("🗑 Descartar", `bible:rej:${id}`);

/** Publica o preview aprovado com as credenciais do canal gravado no sidecar. */
export async function publishApproved(metaFile: string): Promise<string> {
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as BibleShortMeta;
  return publishBiblePreview(metaFile, await loadManagedConfig(meta.channelId));
}

export interface ApprovalDeps {
  chatId: string;
  outputDir: string;
  publish: (metaFile: string) => Promise<string>;
}

/** Trata os cliques: só o chat autorizado, uma única decisão por prévia (marcador `.done`). */
export function registerApprovalHandlers(bot: Bot, deps: ApprovalDeps): void {
  bot.callbackQuery(CALLBACK, async (ctx) => {
    const [, action, id] = ctx.match as RegExpMatchArray;
    if (String(ctx.chat?.id) !== deps.chatId) return void (await ctx.answerCallbackQuery({ text: "Não autorizado" }));
    const metaFile = metaPathFor(deps.outputDir, id!);
    if (!fs.existsSync(metaFile)) return void (await ctx.answerCallbackQuery({ text: "Prévia não encontrada" }));
    const marker = metaFile.replace(/\.publish\.json$/, ".done");
    if (fs.existsSync(marker)) return void (await ctx.answerCallbackQuery({ text: "Já tratado" }));
    fs.writeFileSync(marker, action!);
    await ctx.answerCallbackQuery({ text: action === "pub" ? "Publicando…" : "Descartado" });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    if (action === "rej") return void (await ctx.reply("🗑 Prévia descartada."));
    try {
      await ctx.reply("⏳ Publicando no YouTube…");
      await ctx.reply(`✅ Publicado: ${await deps.publish(metaFile)}`);
    } catch (error) {
      fs.rmSync(marker, { force: true });
      logger.error({ error, id }, "Bible preview publish failed");
      await ctx.reply(`❌ Falha ao publicar: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

/** Sobe o bot de aprovação (long polling) quando há token/chat; reinicia se o polling cair (ex.: 409 em rollout). */
export function startBibleApproval(
  config: Pick<PipelineConfig, "telegramBotToken" | "telegramChatId" | "outputDir">,
  publish: ApprovalDeps["publish"] = publishApproved,
): Bot | null {
  if (!config.telegramBotToken || !config.telegramChatId) return null;
  const bot = new Bot(config.telegramBotToken);
  registerApprovalHandlers(bot, { chatId: String(config.telegramChatId), outputDir: config.outputDir, publish });
  bot.catch((error) => logger.error({ error: error.message }, "Telegram approval handler error"));
  const run = (): void => {
    bot.start({ allowed_updates: ["callback_query"] }).catch((error) => {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, "Telegram polling stopped, retrying");
      setTimeout(run, RETRY_MS).unref();
    });
  };
  run();
  return bot;
}
