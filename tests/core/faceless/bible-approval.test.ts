import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { existsMock, writeMock, rmMock, readMock, startMock, bots, publishPreviewMock, managedMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  writeMock: vi.fn(),
  rmMock: vi.fn(),
  readMock: vi.fn(),
  startMock: vi.fn(),
  bots: [] as any[],
  publishPreviewMock: vi.fn(),
  managedMock: vi.fn(),
}));

vi.mock("node:fs", () => {
  const api = { existsSync: existsMock, writeFileSync: writeMock, rmSync: rmMock, readFileSync: readMock };
  return { ...api, default: api };
});
vi.mock("grammy", () => ({
  Bot: class {
    handler: any;
    errorHandler: any;
    constructor(public token: string) { bots.push(this); }
    callbackQuery(_re: RegExp, fn: any) { this.handler = fn; }
    catch(fn: any) { this.errorHandler = fn; }
    start = startMock;
  },
  InlineKeyboard: class {
    rows: string[][] = [];
    text(label: string, data: string) { this.rows.push([label, data]); return this; }
  },
}));
vi.mock("../../../src/core/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../../src/core/managed-config.js", () => ({ loadManagedConfig: managedMock }));
vi.mock("../../../src/core/faceless/bible-preview.js", () => ({ publishBiblePreview: publishPreviewMock }));

import {
  buildApprovalKeyboard, metaPathFor, previewId, publishApproved, registerApprovalHandlers, startBibleApproval,
} from "../../../src/core/faceless/bible-approval.js";
import { Bot } from "grammy";

const ctxFor = (action: string, chatId: number | null = 42) => ({
  match: [`bible:${action}:bible-abc`, action, "bible-abc"],
  chat: chatId === null ? undefined : { id: chatId },
  answerCallbackQuery: vi.fn(),
  editMessageReplyMarkup: vi.fn(),
  reply: vi.fn(),
});

describe("bible approval helpers", () => {
  it("derives the preview id, sidecar path and the two buttons", () => {
    expect(previewId("/out/comics/bible-abc/bible-abc.mp4")).toBe("bible-abc");
    expect(metaPathFor("/out", "bible-abc").replace(/\\/g, "/")).toBe("/out/comics/bible-abc/bible-abc.publish.json");
    const kb = buildApprovalKeyboard("bible-abc") as any;
    expect(kb.rows).toEqual([["✅ Publicar no YouTube", "bible:pub:bible-abc"], ["🗑 Descartar", "bible:rej:bible-abc"]]);
  });

  it("publishes with the channel's own config read from the sidecar", async () => {
    readMock.mockReturnValue(JSON.stringify({ channelId: "santidade-catolica" }));
    managedMock.mockResolvedValue({ managed: true });
    publishPreviewMock.mockResolvedValue("https://youtube.com/shorts/x");
    expect(await publishApproved("/m.json")).toBe("https://youtube.com/shorts/x");
    expect(managedMock).toHaveBeenCalledWith("santidade-catolica");
    expect(publishPreviewMock).toHaveBeenCalledWith("/m.json", { managed: true });
  });
});

describe("approval callbacks", () => {
  const publish = vi.fn();
  const handlerFor = () => {
    const bot = new (Bot as any)("t");
    registerApprovalHandlers(bot, { chatId: "42", outputDir: "/out", publish });
    return bot.handler as (ctx: any) => Promise<void>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockReturnValue(true);
  });

  it("ignores other chats, unknown previews and previews already handled", async () => {
    const handler = handlerFor();
    for (const [ctx, text, exists] of [
      [ctxFor("pub", 7), "Não autorizado", []],
      [ctxFor("pub", null), "Não autorizado", []],
      [ctxFor("pub"), "Prévia não encontrada", [false]],
      [ctxFor("pub"), "Já tratado", [true, true]],
    ] as const) {
      existsMock.mockReset();
      exists.forEach((value) => existsMock.mockReturnValueOnce(value));
      await handler(ctx);
      expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text });
      expect(publish).not.toHaveBeenCalled();
    }
  });

  it("discards a preview without publishing", async () => {
    existsMock.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const ctx = ctxFor("rej");
    await handlerFor()(ctx);
    expect(writeMock).toHaveBeenCalledWith(expect.stringMatching(/bible-abc\.done$/), "rej");
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith("🗑 Prévia descartada.");
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes an approved preview and reports the link", async () => {
    existsMock.mockReturnValueOnce(true).mockReturnValueOnce(false);
    publish.mockResolvedValue("https://youtube.com/shorts/ok");
    const ctx = ctxFor("pub");
    await handlerFor()(ctx);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledWith({ text: "Publicando…" });
    expect(publish).toHaveBeenCalledWith(expect.stringMatching(/bible-abc\.publish\.json$/));
    expect(ctx.reply).toHaveBeenLastCalledWith("✅ Publicado: https://youtube.com/shorts/ok");
  });

  it("releases the marker and reports when publishing fails", async () => {
    for (const failure of [new Error("quota"), "texto"]) {
      existsMock.mockReturnValueOnce(true).mockReturnValueOnce(false);
      publish.mockRejectedValueOnce(failure);
      const ctx = ctxFor("pub");
      await handlerFor()(ctx);
      expect(rmMock).toHaveBeenCalledWith(expect.stringMatching(/bible-abc\.done$/), { force: true });
      expect(ctx.reply).toHaveBeenLastCalledWith(`❌ Falha ao publicar: ${failure instanceof Error ? failure.message : failure}`);
    }
  });
});

describe("startBibleApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bots.length = 0;
    vi.useFakeTimers();
    startMock.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it("does nothing without a Telegram token or chat", () => {
    expect(startBibleApproval({ telegramBotToken: "", telegramChatId: "1", outputDir: "/o" })).toBeNull();
    expect(startBibleApproval({ telegramBotToken: "t", telegramChatId: "", outputDir: "/o" })).toBeNull();
    expect(bots).toHaveLength(0);
  });

  it("polls only for button clicks and logs handler errors", () => {
    const bot = startBibleApproval({ telegramBotToken: "t", telegramChatId: "42", outputDir: "/o" }, vi.fn()) as any;
    expect(bot.token).toBe("t");
    expect(startMock).toHaveBeenCalledWith({ allowed_updates: ["callback_query"] });
    expect(() => bot.errorHandler({ message: "boom" })).not.toThrow();
  });

  it("restarts polling after a failure (e.g. 409 during a rollout)", async () => {
    startMock.mockRejectedValueOnce(new Error("409")).mockRejectedValueOnce("string failure");
    startBibleApproval({ telegramBotToken: "t", telegramChatId: "42", outputDir: "/o" });
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(startMock).toHaveBeenCalledTimes(3);
  });

  it("publishes with the default publisher when none is given", async () => {
    startBibleApproval({ telegramBotToken: "t", telegramChatId: "42", outputDir: "/o" });
    existsMock.mockReturnValueOnce(true).mockReturnValueOnce(false);
    readMock.mockReturnValue(JSON.stringify({ channelId: "c" }));
    managedMock.mockResolvedValue({});
    publishPreviewMock.mockResolvedValue("https://youtube.com/shorts/d");
    const ctx = ctxFor("pub");
    await bots[0].handler(ctx);
    expect(ctx.reply).toHaveBeenLastCalledWith("✅ Publicado: https://youtube.com/shorts/d");
  });
});
