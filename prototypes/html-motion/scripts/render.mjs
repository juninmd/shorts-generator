// Captures the HyperFrames-style page frame by frame (seek(t) -> screenshot) and muxes out/voice.wav.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = join(ROOT, 'out');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
// Only these prefixes are served; everything else is a 404 (no directory walking outside them).
const MOUNTS = [
  ['/vendor/gsap.min.js', join(ROOT, 'node_modules/gsap/dist/gsap.min.js')],
  ['/vendor/', join(ROOT, 'node_modules/three/build/')],
  ['/fonts/', resolve(ROOT, '../../assets/fonts/')],
  ['/', join(ROOT, 'src/')],
];
const args = process.argv.slice(2);
const stills = args.includes('--still') ? args[args.indexOf('--still') + 1].split(',').map(Number) : null;
const outFile = join(OUT, 'video.mp4');

function resolvePath(urlPath) {
  for (const [prefix, dir] of MOUNTS) {
    if (urlPath === prefix && !prefix.endsWith('/')) return dir;
    if (prefix.endsWith('/') && urlPath.startsWith(prefix)) {
      const file = normalize(join(dir, urlPath.slice(prefix.length) || 'index.html'));
      return file.startsWith(dir.endsWith(sep) ? dir : dir + sep) ? file : null;
    }
  }
  return null;
}

function serve() {
  const server = createServer(async (req, res) => {
    let file = null;
    try { file = resolvePath(decodeURIComponent(new URL(req.url, 'http://x').pathname)); } catch { /* malformed URL */ }
    if (!file || !MIME[extname(file)]) return res.writeHead(404).end();
    try { res.writeHead(200, { 'content-type': MIME[extname(file)] }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

function ffmpeg(fps, part) {
  const proc = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0',
    '-i', join(OUT, 'voice.wav'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-g', String(fps * 2),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', '-f', 'mp4', part],
  { stdio: ['pipe', 'ignore', 'inherit'] });
  proc.stdin.on('error', () => {});
  return proc;
}

const plan = JSON.parse(await readFile(join(OUT, 'plan.json'), 'utf8'));
const server = await serve();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--font-render-hinting=none'],
});
try {
  const page = await browser.newPage({ viewport: { width: plan.width, height: plan.height }, deviceScaleFactor: 1 });
  let pageError = null;
  page.on('pageerror', e => { pageError ??= e; });
  await page.addInitScript(p => { window.__PLAN = p; }, plan);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 60_000 });
  const shot = async t => {
    await page.evaluate(x => window.__hf.seek(x), t);
    if (pageError) throw pageError;
    return page.screenshot({ type: 'jpeg', quality: 95 });
  };
  if (stills) {
    for (const t of stills) await writeFile(join(OUT, `still-${t}.jpg`), await shot(t));
  } else {
    const total = Math.round(plan.duration * plan.fps);
    const part = `${outFile}.part`;
    const ff = ffmpeg(plan.fps, part);
    for (let i = 0; i < total; i++) {
      if (!ff.stdin.write(await shot(i / plan.fps))) await once(ff.stdin, 'drain');
      if (i % 150 === 0) console.error(`frame ${i}/${total}`);
    }
    ff.stdin.end();
    const [code] = await once(ff, 'close');
    if (code) { await rm(part, { force: true }); throw new Error(`ffmpeg exit ${code}`); }
    await rename(part, outFile);
    console.error(`done: ${outFile} (${total} frames, ${plan.duration.toFixed(2)}s)`);
  }
} finally {
  await browser.close();
  server.close();
}
