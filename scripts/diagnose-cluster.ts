#!/usr/bin/env tsx
/**
 * Cluster diagnostic script.
 * Checks if all YouTube download prerequisites are met.
 * Run: npx tsx scripts/diagnose-cluster.ts
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface DiagResult {
  name: string;
  pass: boolean;
  message: string;
  fix?: string;
}

const results: DiagResult[] = [];

function test(name: string, fn: () => boolean | string): void {
  try {
    const result = fn();
    if (typeof result === 'string') {
      results.push({ name, pass: false, message: result });
    } else {
      results.push({ name, pass: result, message: result ? '✓' : '✗' });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, pass: false, message });
  }
}

// System commands
test('ffmpeg installed', () => {
  try {
    const out = execSync('ffmpeg -version 2>&1').toString();
    return out.includes('ffmpeg') ? true : 'ffmpeg not found in output';
  } catch {
    return 'ffmpeg: Install via apt-get install ffmpeg';
  }
});

test('yt-dlp installed', () => {
  try {
    const out = execSync('yt-dlp --version 2>&1').toString();
    return out.trim().length > 0;
  } catch {
    return 'yt-dlp: Install via apt-get install yt-dlp';
  }
});

test('node version >= 20', () => {
  const version = process.version;
  const major = parseInt(version.split('.')[0].slice(1));
  return major >= 20 ? true : `Node ${version} (need >= 20)`;
});

test('Current working directory', () => {
  return fs.existsSync('package.json') ? true : 'package.json not found';
});

// Dependencies
test('Node dependencies installed', () => {
  return fs.existsSync('node_modules') ? true : 'Run: npm install or pnpm install';
});

test('Python3 available', () => {
  try {
    execSync('python3 --version 2>&1');
    return true;
  } catch {
    return 'python3: Install via apt-get install python3';
  }
});

// Config files
test('.env file exists', () => {
  if (!fs.existsSync('.env')) {
    return 'Copy .env.example to .env and fill in your config';
  }
  return true;
});

// Environment variables
test('YOUTUBE_PLAYER_CLIENT set', () => {
  const val = process.env.YOUTUBE_PLAYER_CLIENT;
  return val
    ? true
    : 'Set YOUTUBE_PLAYER_CLIENT=web in .env';
});

test('YouTube auth configured', () => {
  const base64 = process.env.YOUTUBE_COOKIES_BASE64;
  const file = process.env.YOUTUBE_COOKIES_FILE;
  const browser = process.env.YOUTUBE_COOKIES_BROWSER;

  if (base64 || file || browser) {
    return true;
  }

  return 'No YouTube auth. Set one of:\n      - YOUTUBE_COOKIES_BASE64\n      - YOUTUBE_COOKIES_FILE\n      - YOUTUBE_COOKIES_BROWSER';
});

// YouTube access
test('YouTube reachable (basic)', () => {
  try {
    execSync('curl -I --max-time 10 --connect-timeout 5 https://www.youtube.com 2>&1 | head -1', {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return 'Cannot reach YouTube. Check IP is not blocked.';
  }
});

test('yt-dlp can query YouTube', () => {
  try {
    // Test with public video (Big Buck Bunny)
    const out = execSync(
      `yt-dlp --no-check-certificates --js-runtimes node --list-formats --no-warnings -- "https://www.youtube.com/watch?v=aqz-KE-bpKQ" 2>&1`,
      { timeout: 45_000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString();

    if (out.includes('ID') && out.includes('EXT')) {
      return true;
    }

    if (out.includes('403') || out.includes('Forbidden')) {
      return 'YouTube is blocking this IP (403 Forbidden)';
    }

    if (out.includes('sign in') || out.includes('confirm') || out.includes('bot')) {
      return 'YouTube bot detection triggered. May need updated cookies.';
    }

    return 'yt-dlp output missing format info';
  } catch (err: unknown) {
    const msg = (err as NodeJS.ErrnoException).message || String(err);
    if (msg.includes('ENOENT')) {
      return 'yt-dlp command not found';
    }
    if (msg.includes('timeout')) {
      return 'yt-dlp query timed out (network issue?)';
    }
    return `yt-dlp error: ${msg.slice(0, 100)}`;
  }
});

// Directories
test('output directory writable', () => {
  const dir = process.env.OUTPUT_DIR || './output';
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, '.test'), '');
    fs.unlinkSync(path.join(dir, '.test'));
    return true;
  } catch (err: unknown) {
    return `Cannot write to ${dir}: ${err instanceof Error ? err.message : String(err)}`;
  }
});

test('temp directory writable', () => {
  const dir = process.env.TEMP_DIR || './temp';
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, '.test'), '');
    fs.unlinkSync(path.join(dir, '.test'));
    return true;
  } catch (err: unknown) {
    return `Cannot write to ${dir}: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// Print results
console.log('\n' + '='.repeat(60));
console.log('🔍 Cluster Diagnostic Report');
console.log('='.repeat(60) + '\n');

let passCount = 0;
let failCount = 0;

results.forEach((r) => {
  const icon = r.pass ? '✓' : '✗';
  const color = r.pass ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`${color}${icon}${reset} ${r.name}`);
  if (!r.pass && r.message) {
    console.log(`  ${r.message}`);
  }

  r.pass ? passCount++ : failCount++;
});

console.log('\n' + '='.repeat(60));
console.log(`Summary: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(60) + '\n');

// Exit code
process.exit(failCount > 0 ? 1 : 0);
