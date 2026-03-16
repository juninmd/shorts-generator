#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { nanoid } from "nanoid";

dotenvConfig();

/**
 * Script to generate 5 shorts with different names in output folder
 * Each short gets its own subdirectory with a unique ID
 */
async function generateMultipleShortsDirectories() {
  const outputDir = path.resolve(process.env.OUTPUT_DIR || "./output");
  const shortNames = [
    "viral-moment-daily",
    "trending-clip-today",
    "best-highlight-24h",
    "top-shortcut-moment",
    "curated-viral-shorts",
  ];

  console.log(`🎬 Creating 5 shorts directories in ${outputDir}\n`);

  const createdDirs: string[] = [];

  for (let i = 0; i < shortNames.length; i++) {
    const shortId = nanoid(8);
    const shortName = `${shortNames[i]}-${shortId}`;
    const shortDir = path.join(outputDir, shortName);

    try {
      fs.mkdirSync(shortDir, { recursive: true });
      createdDirs.push(shortDir);

      // Create a metadata file for each short
      const metadata = {
        id: shortId,
        name: shortNames[i],
        createdAt: new Date().toISOString(),
        status: "pending",
        videoFiles: [],
        configPath: path.join(shortDir, "config.json"),
      };

      fs.writeFileSync(
        path.join(shortDir, "config.json"),
        JSON.stringify(metadata, null, 2),
      );

      console.log(`✅ Created: ${shortName}`);
      console.log(`   Path: ${shortDir}\n`);
    } catch (error) {
      console.error(`❌ Failed to create ${shortName}:`, error);
    }
  }

  // Summary
  console.log(`\n📊 Summary`);
  console.log(`━`.repeat(50));
  console.log(`Total directories created: ${createdDirs.length}`);
  console.log(`Output location: ${outputDir}`);
  console.log(`\nTo add these to .gitignore, ensure each output/*/`);
  console.log(`subdirectory contains generated content.\n`);

  return createdDirs;
}

generateMultipleShortsDirectories().catch(console.error);
