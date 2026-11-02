#!/usr/bin/env node
// Frame-stepped renderer: loads a composition in headless Chromium, renders every
// frame deterministically (time is driven by us, never by the wall clock), pipes
// PNG screenshots into ffmpeg, then concatenates worker segments and muxes audio.
//
//   node engine/render.mjs --comp videos/us01_black_tar --out renders/us01.mp4 \
//        [--audio videos/us01_black_tar/build/mix.wav] [--workers 3] [--crf 17]
//        [--stills 0,90,180 --stills-dir videos/us01_black_tar/build/stills]
//        [--from 0 --to 300]          (frame range, for quick previews)
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through to global */ }
  const g = execSync('npm root -g').toString().trim();
  return require(path.join(g, 'playwright'));
}
const { chromium } = loadPlaywright();

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    a[k.slice(2)] = v;
  }
  return a;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.css': 'text/css',
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const p = path.join(ROOT, rel);
      if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      try {
        const data = await fsp.readFile(p);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(data);
      } catch { res.writeHead(404); res.end('not found: ' + rel); }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-color-profile=srgb'];

async function openComp(port, comp, tag) {
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || process.env.DEBUG) console.log(`[${tag}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => console.error(`[${tag}] pageerror:`, e.message));
  await page.goto(`http://127.0.0.1:${port}/engine/player.html?comp=${encodeURIComponent(comp)}`);
  await page.waitForFunction(() => window.__ready === true || !!window.__error, null, { timeout: 180000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(`composition failed to load: ${err}`);
  const meta = await page.evaluate(() => window.__meta);
  return { browser, page, meta };
}

async function grab(page, i) {
  await page.evaluate((f) => window.__renderFrame(f), i);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 }, animations: 'disabled', caret: 'hide' });
}

function ffmpegSink(out, fps, crf) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-r', String(fps), '-g', String(fps * 2), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  return { ff, done };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.comp) { console.error('usage: render.mjs --comp videos/<id> --out renders/<id>.mp4'); process.exit(2); }
  const comp = args.comp.replace(/\/+$/, '');
  const srv = await serve();
  const port = srv.address().port;
  const t0 = Date.now();

  // probe composition
  const probe = await openComp(port, comp, 'probe');
  const { fps, frames } = probe.meta;
  console.log(`comp ${comp}: ${frames} frames @ ${fps}fps (${(frames / fps).toFixed(2)}s)`);

  if (args.stills) {
    const dir = path.resolve(ROOT, args['stills-dir'] || path.join(comp, 'build', 'stills'));
    await fsp.mkdir(dir, { recursive: true });
    const list = String(args.stills).split(',').map((s) => s.trim()).filter(Boolean).map((s) => (s.endsWith('s') ? Math.round(parseFloat(s) * fps) : parseInt(s, 10)));
    for (const f of list) {
      const buf = await grab(probe.page, Math.min(frames - 1, Math.max(0, f)));
      const p = path.join(dir, `f${String(f).padStart(5, '0')}.png`);
      await fsp.writeFile(p, buf);
      console.log('still', p);
    }
    await probe.browser.close(); srv.close();
    return;
  }
  await probe.browser.close();

  const from = args.from ? parseInt(args.from, 10) : 0;
  const to = Math.min(frames, args.to ? parseInt(args.to, 10) : frames);
  const workers = Math.max(1, Math.min(parseInt(args.workers || Math.max(1, os.cpus().length - 1), 10), to - from));
  const crf = parseInt(args.crf || '17', 10);
  const out = path.resolve(ROOT, args.out || path.join(comp, 'build', 'video.mp4'));
  const tmp = path.join(path.dirname(out), `.segs-${path.basename(out, '.mp4')}`);
  await fsp.rm(tmp, { recursive: true, force: true });
  await fsp.mkdir(tmp, { recursive: true });

  const per = Math.ceil((to - from) / workers);
  const ranges = [];
  for (let w = 0; w < workers; w++) {
    const a = from + w * per, b = Math.min(to, a + per);
    if (a < b) ranges.push([a, b, path.join(tmp, `seg${w}.mp4`)]);
  }
  let doneFrames = 0;
  const total = to - from;
  const tick = setInterval(() => {
    const el = (Date.now() - t0) / 1000;
    const rate = doneFrames / Math.max(1e-3, el);
    process.stdout.write(`\r  ${doneFrames}/${total} frames  ${rate.toFixed(1)} fps  eta ${((total - doneFrames) / Math.max(rate, 1e-3)).toFixed(0)}s   `);
  }, 2000);

  await Promise.all(ranges.map(async ([a, b, seg], w) => {
    const { browser, page } = await openComp(port, comp, `w${w}`);
    const { ff, done } = ffmpegSink(seg, fps, crf);
    for (let i = a; i < b; i++) {
      const buf = await grab(page, i);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      doneFrames++;
    }
    ff.stdin.end();
    await done;
    await browser.close();
  }));
  clearInterval(tick);
  process.stdout.write('\n');

  const listFile = path.join(tmp, 'list.txt');
  await fsp.writeFile(listFile, ranges.map(([, , s]) => `file '${s}'`).join('\n'));
  const silent = path.join(tmp, 'video.mp4');
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${listFile}" -c copy "${silent}"`);

  const audio = args.audio ? path.resolve(ROOT, args.audio) : null;
  if (audio && fs.existsSync(audio)) {
    const startSec = from / fps;
    const trim = startSec > 0 ? `-ss ${startSec.toFixed(3)} ` : '';
    execSync(`ffmpeg -y -loglevel error -i "${silent}" ${trim}-i "${audio}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart "${out}"`);
  } else {
    execSync(`ffmpeg -y -loglevel error -i "${silent}" -c copy -movflags +faststart "${out}"`);
  }
  await fsp.rm(tmp, { recursive: true, force: true });
  srv.close();
  console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
