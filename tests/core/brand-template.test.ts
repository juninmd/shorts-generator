import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BRAND, loadBrandTemplate } from "../../src/core/brand-template.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { default: { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() } };
});

const files: Record<string, string> = {};
const ENV = ["BRAND_TEMPLATES_DIR", "CAPTION_FONT", "CAPTION_EMOJI", "HOOK_OVERLAY", "LOWER_THIRD", "CTA_TEXT"];

describe("loadBrandTemplate", () => {
  beforeEach(() => {
    for (const key of Object.keys(files)) delete files[key];
    ENV.forEach((name) => delete process.env[name]);
    vi.mocked(fs.existsSync).mockImplementation((file) => String(file) in files);
    vi.mocked(fs.readFileSync).mockImplementation(((file: any) => {
      if (!(String(file) in files)) throw new Error("ENOENT");
      return files[String(file)];
    }) as any);
  });
  afterEach(() => ENV.forEach((name) => delete process.env[name]));

  it("returns the defaults (a bundled heavy sans) when there are no template files", () => {
    expect(loadBrandTemplate()).toEqual(DEFAULT_BRAND);
    expect(DEFAULT_BRAND.font).toBe("Poppins ExtraBold");
  });

  it("lets CAPTION_FONT override the font", () => {
    files[path.join("brand-templates", "default.json")] = JSON.stringify({ font: "Cinzel" });
    process.env.CAPTION_FONT = "Montserrat Black";
    expect(loadBrandTemplate().font).toBe("Montserrat Black");
  });

  it("layers default.json then the channel's file (id or name slug)", () => {
    files[path.join("brand-templates", "default.json")] = JSON.stringify({ highlightColor: "#00FF00", font: "Inter" });
    files[path.join("brand-templates", "santidade-catolica.json")] = JSON.stringify({ font: "Cinzel", cta: "Siga!" });
    const brand = loadBrandTemplate(["id-1", "Santidade Católica"]);
    expect(brand).toMatchObject({ highlightColor: "#00FF00", font: "Cinzel", cta: "Siga!" });
  });

  it("ignores unreadable, non-object or invalid templates", () => {
    files[path.join("brand-templates", "default.json")] = "not json";
    files[path.join("brand-templates", "a.json")] = "[1,2]";
    expect(loadBrandTemplate(["a"])).toEqual(DEFAULT_BRAND);
  });

  it("honors BRAND_TEMPLATES_DIR and skips empty channel keys", () => {
    process.env.BRAND_TEMPLATES_DIR = "/brands";
    files[path.join("/brands", "default.json")] = JSON.stringify({ fontScale: 1.2 });
    expect(loadBrandTemplate([undefined, "", "!!!"]).fontScale).toBe(1.2);
  });

  it("lets env switches override files", () => {
    files[path.join("brand-templates", "default.json")] = JSON.stringify({ hook: false, lowerThird: false, emoji: false });
    process.env.CAPTION_EMOJI = "true";
    process.env.HOOK_OVERLAY = "true";
    process.env.LOWER_THIRD = "true";
    process.env.CTA_TEXT = "Siga";
    expect(loadBrandTemplate()).toMatchObject({ emoji: true, hook: true, lowerThird: true, cta: "Siga" });
    process.env.CAPTION_EMOJI = "false";
    process.env.HOOK_OVERLAY = "false";
    process.env.LOWER_THIRD = "false";
    expect(loadBrandTemplate()).toMatchObject({ emoji: false, hook: false, lowerThird: false });
  });
});
