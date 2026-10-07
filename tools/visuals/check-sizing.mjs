// Exercise the real Visuals component and installed Butterchurn in an isolated
// scratch page. No Brain service, library, or persisted app data is accessed.
// Run: node tools/visuals/check-sizing.mjs [evidence-output-directory]
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(repo, "package.json"));
const puppeteer = require("puppeteer");
const output = path.resolve(process.argv[2] || path.join(tmpdir(), "synamp-milkdrop-evidence"));
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), "synamp-milkdrop-check-")));
const moduleUrl = (file) => `/@fs${path.join(repo, file)}`;
await mkdir(output, { recursive: true });
await symlink(path.join(repo, "apps/web/node_modules"), path.join(scratch, "node_modules"));
await writeFile(path.join(scratch, "index.html"), '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/check.tsx"></script></body></html>');
await writeFile(path.join(scratch, "check.tsx"), `
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Visuals from ${JSON.stringify(moduleUrl("apps/web/src/visuals/Visuals.tsx"))};
import { setActiveAudio } from ${JSON.stringify(moduleUrl("apps/web/src/visuals/audio-graph.ts"))};
import ${JSON.stringify(moduleUrl("apps/web/src/styles/tokens.css"))};
import ${JSON.stringify(moduleUrl("apps/web/src/styles/ui.css"))};
// A generated tone provides repeatable audio without touching the music library.
const samples = 44100 * 2, wav = new ArrayBuffer(44 + samples * 2), view = new DataView(wav);
const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
text(0, 'RIFF'); view.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
view.setUint32(24, 44100, true); view.setUint32(28, 88200, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
text(36, 'data'); view.setUint32(40, samples * 2, true);
for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, 8000 * Math.sin(2 * Math.PI * 220 * i / 44100), true);
const tone = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }))); tone.loop = true; tone.volume = 0.01;
document.documentElement.style.overflow = 'auto'; document.body.style.overflow = 'auto';
function Check() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const play = (event) => { if (event.target.closest('button')?.textContent === 'Show the visuals') { void tone.play(); setActiveAudio(tone); } };
    document.addEventListener('click', play, true);
    return () => { document.removeEventListener('click', play, true); tone.pause(); setActiveAudio(null); };
  }, []);
  return <><main style={{ height: 2000 }}>Isolated visualizer check</main>{open ? <Visuals open onClose={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>Reopen visuals</button>}</>;
}
createRoot(document.getElementById('root')!).render(<Check />);
`);
await writeFile(path.join(scratch, "vite.config.mjs"), `
import { defineConfig } from ${JSON.stringify(path.join(repo, "apps/web/node_modules/vite/dist/node/index.js"))};
import react from '@vitejs/plugin-react';
export default defineConfig({ root: ${JSON.stringify(scratch)}, plugins: [react()], server: { host: '127.0.0.1', port: 0, fs: { allow: ${JSON.stringify([scratch, repo])} } } });
`);

let browser;
const server = spawn(process.execPath, [path.join(repo, "apps/web/node_modules/vite/bin/vite.js"), "--config", path.join(scratch, "vite.config.mjs")], { stdio: ["ignore", "pipe", "pipe"] });
try {
  const url = await new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(() => reject(new Error(`Scratch server did not start: ${log}`)), 15000);
    const read = (chunk) => {
      log += chunk.toString().replace(/\x1b\[[0-9;]*m/g, "");
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    };
    server.stdout.on("data", read); server.stderr.on("data", read);
    server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Scratch server exited ${code}: ${log}`)); });
  });
  browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist", "--mute-audio"] });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    // Observe actual GL calls, rather than trusting the component's own sizing.
    Math.random = () => 0.75;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = getContext.apply(this, args);
      if (args[0] === "webgl2" && gl) {
        window.__visualGl = gl;
        const viewport = gl.viewport.bind(gl), bind = gl.bindFramebuffer.bind(gl);
        let framebuffer = null;
        gl.bindFramebuffer = (target, value) => { framebuffer = value; return bind(target, value); };
        gl.viewport = (...values) => { if (!framebuffer) window.__screenViewport = values; return viewport(...values); };
      }
      return gl;
    };
  });
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle0" });
  const start = async () => {
    await page.waitForSelector("dialog[open]");
    await page.click(".visuals__intro .btn--primary");
    await page.waitForFunction(() => document.querySelector(".visuals__bar") || document.querySelector(".visuals__intro .alert"));
    assert.equal(await page.$eval("dialog", (el) => !!el.querySelector(".visuals__intro .alert")), false, "WebGL startup failed");
    await page.waitForFunction(() => !!window.__screenViewport);
  };
  await start();
  const cases = [];
  const record = async (name) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const result = await page.evaluate(() => {
      const canvas = document.querySelector(".visuals__canvas"), dialog = document.querySelector("dialog"), rect = canvas.getBoundingClientRect(), gl = window.__visualGl;
      return { css: [rect.width, rect.height], canvas: [canvas.width, canvas.height], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], viewport: window.__screenViewport, dialog: [dialog.clientWidth, dialog.clientHeight, dialog.scrollWidth, dialog.scrollHeight], overflow: [getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow], dpr: devicePixelRatio, screen: [innerWidth, innerHeight], renderer: gl.getParameter(gl.RENDERER), audio: document.querySelector(".visuals__name").textContent };
    });
    assert.deepEqual(result.css, result.screen, `${name}: fullscreen CSS size`);
    assert.deepEqual(result.canvas, result.css.map((size) => Math.max(1, Math.round(size * Math.min(result.dpr, 2)))), `${name}: backing pixels`);
    assert.deepEqual(result.buffer, result.canvas, `${name}: GL drawing buffer`);
    assert.deepEqual(result.viewport, [0, 0, ...result.buffer], `${name}: final screen viewport fills buffer`);
    assert.deepEqual(result.dialog.slice(0, 2), result.dialog.slice(2), `${name}: no dialog overflow`);
    assert.deepEqual(result.overflow, ["hidden", "hidden"], `${name}: background scroll contained`);
    assert.doesNotMatch(result.audio, /Play something/, `${name}: synthetic audio reached visualizer`);
    assert.deepEqual(errors, [], `${name}: browser errors`);
    cases.push({ name, ...result });
    console.log(`PASS ${name}: ${result.canvas.join("×")} buffer and full viewport`);
  };
  await record("retina-initial");
  await page.screenshot({ path: path.join(output, "retina-fullscreen.png") });
  const beforeScroll = await page.evaluate(() => scrollY);
  await page.mouse.move(600, 300); await page.mouse.wheel({ deltaY: 700 });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await page.evaluate(() => scrollY), beforeScroll, "wheel must not scroll the background");
  for (const [name, width, height, deviceScaleFactor] of [["retina-resize", 800, 600, 2], ["dpr-only", 800, 600, 1], ["dpr-capped", 800, 600, 3], ["phone", 390, 844, 2], ["landscape", 844, 390, 2]]) {
    await page.setViewport({ width, height, deviceScaleFactor });
    await record(name);
  }
  await page.click(".visuals__bar .btn--primary");
  await page.waitForSelector("dialog", { hidden: true });
  await page.waitForFunction(() => document.body.style.overflow === "auto");
  assert.deepEqual(await page.evaluate(() => [document.documentElement.style.overflow, document.body.style.overflow]), ["auto", "auto"], "close restores prior scroll styles");
  await page.click("button"); await start(); await record("reopened");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog") && document.body.style.overflow === "auto");
  await writeFile(path.join(output, "results.json"), `${JSON.stringify({ capturedAt: new Date().toISOString(), browser: await browser.version(), cases, errors, wheelContained: true, closeRestored: true, escapeRestored: true, limitations: "Isolated real-WebGL component with a generated tone; no owner running-app, physical display-move, or music-library playback check." }, null, 2)}\n`);
  console.log(`Evidence: ${output}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await rm(scratch, { recursive: true, force: true });
}
