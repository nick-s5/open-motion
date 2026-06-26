import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const edgePath = process.env.EDGE_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const basePort = 4300 + (process.pid % 1000);
const appPort = Number(process.env.OPEN_MOTION_TEST_PORT ?? basePort);
const debugPort = Number(process.env.OPEN_MOTION_CDP_PORT ?? basePort + 1);
const appUrl = `http://127.0.0.1:${appPort}`;

if (!existsSync(edgePath)) {
  console.log("Browser smoke tests skipped: Microsoft Edge was not found.");
  process.exit(0);
}

let server;
let edge;
let profileDir;

try {
  server = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(appPort) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  await waitForHttp(appUrl);

  profileDir = await mkdtemp(join(tmpdir(), "open-motion-edge-"));
  edge = spawn(edgePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "about:blank"
  ], { stdio: ["ignore", "pipe", "pipe"] });

  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`);
  const target = await openTarget(`${appUrl}/`);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await waitForPage(cdp, "document.readyState === 'complete' && !!document.querySelector('.stage')");

  await evaluate(cdp, "localStorage.clear(); location.reload();");
  await waitForPage(cdp, "document.readyState === 'complete' && document.querySelectorAll('.layer-row').length >= 5");

  assert.equal(await evaluate(cdp, "document.querySelector('.stage')?.tagName"), "svg");
  assert.ok(await evaluate(cdp, "document.querySelectorAll('.layer-row').length >= 5"));

  assert.equal(await runCheck(cdp, playShortcutCheck), true, "space toggles playback");
  assert.equal(await runCheck(cdp, inspectorPropertyPatchCheck), true, "inspector property edits apply through patches");
  assert.equal(await runCheck(cdp, exportTabCheck), true, "export controls live in the export tab");
  assert.equal(await runCheck(cdp, deleteUndoShortcutCheck), true, "delete and undo shortcuts keep layers synchronized");
  assert.equal(await runCheck(cdp, keyframeShortcutCheck), true, "K inserts keyframes with selected easing");
  assert.equal(await runCheck(cdp, canvasDragCheck), true, "canvas drag changes selected layer position");
  assert.equal(await runCheck(cdp, resetControlCheck), true, "reset control restores the local demo project");
  assert.equal(await runCheck(cdp, jsonImportCheck), true, "JSON import loads and persists a valid project");
  assert.equal(await runCheck(cdp, aiPatchHistoryCheck), true, "AI apply records patch history");

  await cdp.close();
  console.log("Browser smoke tests passed.");
} finally {
  edge?.kill();
  await waitForExit(edge);
  server?.kill();
  await waitForExit(server);
  if (profileDir) {
    await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  }
}

async function openTarget(url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!response.ok) throw new Error(`Could not open browser target: ${response.status}`);
  return response.json();
}

function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  });

  const opened = new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });

  return opened.then(() => ({
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    }
  }));
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed");
  }
  return result.result.value;
}

async function runCheck(cdp, fn) {
  return evaluate(cdp, `(${fn.toString()})()`);
}

async function waitForPage(cdp, expression, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(cdp, expression)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function waitForHttp(url, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the server or browser endpoint is ready.
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function waitForExit(process, timeoutMs = 3000) {
  if (!process || process.exitCode != null || process.signalCode != null) return Promise.resolve();
  return Promise.race([
    new Promise((resolveExit) => process.once("exit", resolveExit)),
    delay(timeoutMs)
  ]);
}

function playShortcutCheck() {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
  const paused = document.querySelector('[data-action="play"]')?.textContent === "Pause";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
  const playing = document.querySelector('[data-action="play"]')?.textContent === "Play";
  return paused && playing;
}

function deleteUndoShortcutCheck() {
  const before = document.querySelectorAll(".layer-row").length;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  const deleted = document.querySelectorAll(".layer-row").length === before - 1;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
  const restored = document.querySelectorAll(".layer-row").length === before;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }));
  const redone = document.querySelectorAll(".layer-row").length === before - 1;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
  const restoredAgain = document.querySelectorAll(".layer-row").length === before;
  return deleted && restored && redone && restoredAgain;
}

function inspectorPropertyPatchCheck() {
  const nameInput = document.querySelector('[data-layer-field="name"]');
  const fillInput = document.querySelector('[data-track-field="fill"]');
  if (!nameInput || !fillInput) return false;

  nameInput.value = "semantic edit layer";
  nameInput.dispatchEvent(new Event("change", { bubbles: true }));
  fillInput.value = "#123456";
  fillInput.dispatchEvent(new Event("change", { bubbles: true }));

  const renamed = document.querySelector(".layer-row span")?.textContent === "semantic edit layer";
  const recolored = document.querySelector("[data-drag-layer]")?.getAttribute("fill") === "#123456";
  return renamed && recolored;
}

function exportTabCheck() {
  const exportTab = document.querySelector('[data-panel-tab="export"]');
  exportTab?.click();
  const hasExport = Boolean(document.querySelector('[data-action="export-json"]'));
  const inspectTab = document.querySelector('[data-panel-tab="inspect"]');
  inspectTab?.click();
  const restoredInspector = Boolean(document.querySelector('[data-layer-field="name"]'));
  return hasExport && restoredInspector;
}

function keyframeShortcutCheck() {
  const scrubber = document.querySelector('[data-action="scrub"]');
  scrubber.value = "0.5";
  scrubber.dispatchEvent(new Event("input", { bubbles: true }));

  const easing = document.querySelector("[data-ease-select]");
  easing.value = "easeInOut";
  easing.dispatchEvent(new Event("change", { bubbles: true }));

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
  const timelineKey = Array.from(document.querySelectorAll(".key-dot")).some((dot) => dot.title.includes("x 0.50s easeInOut"));
  const inspectorKey = Boolean(document.querySelector('.keyframe-toggle[data-keyframe-property="x"].is-keyed'));
  return timelineKey && inspectorKey;
}

function canvasDragCheck() {
  const layer = document.querySelector("[data-drag-layer]");
  const id = layer.dataset.dragLayer;
  const before = layer.getAttribute("transform");
  const bounds = layer.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  const y = bounds.top + bounds.height / 2;

  layer.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, clientX: x + 40, clientY: y + 24 }));
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: x + 40, clientY: y + 24 }));

  const after = document.querySelector(`[data-drag-layer="${id}"]`)?.getAttribute("transform");
  return Boolean(after && after !== before && after.includes("translate("));
}

function resetControlCheck() {
  const before = document.querySelectorAll(".layer-row").length;
  document.querySelector('[data-action="add-rect"]').click();
  const added = document.querySelectorAll(".layer-row").length === before + 1;
  document.querySelector('[data-action="reset-project"]').click();
  const reset = document.querySelectorAll(".layer-row").length === 5;
  const stored = JSON.parse(localStorage.getItem("open-motion-document"));
  return added && reset && stored.name === "Open Motion Alpha";
}

async function jsonImportCheck() {
  const importedProject = {
    version: 1,
    name: "Imported Smoke Project",
    activeSceneId: "scene_imported",
    createdAt: "2026-06-24T00:00:00.000Z",
    scenes: [
      {
        id: "scene_imported",
        name: "Imported scene",
        width: 640,
        height: 360,
        duration: 2,
        fps: 30,
        background: "#ffffff",
        layers: [
          {
            id: "layer_imported",
            type: "rect",
            name: "imported rectangle",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            shape: { width: 120, height: 80, radius: 8 },
            style: { fill: "#2f80ed", stroke: "#1d1c1a", strokeWidth: 2 },
            effects: { blur: 0, shadow: false },
            keyframes: {
              x: [{ time: 0, value: 320, ease: "linear" }],
              y: [{ time: 0, value: 180, ease: "linear" }],
              scaleX: [{ time: 0, value: 1, ease: "linear" }],
              scaleY: [{ time: 0, value: 1, ease: "linear" }],
              rotation: [{ time: 0, value: 0, ease: "linear" }],
              opacity: [{ time: 0, value: 1, ease: "linear" }]
            }
          }
        ],
        exposedProperties: []
      }
    ]
  };

  const input = document.querySelector("[data-json-import]");
  const file = new File([JSON.stringify(importedProject)], "imported.json", { type: "application/json" });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const stored = JSON.parse(localStorage.getItem("open-motion-document"));
  return document.querySelector(".layer-row span")?.textContent === "imported rectangle"
    && document.querySelector("[data-scene-select]")?.value === "scene_imported"
    && stored.name === "Imported Smoke Project";
}

async function aiPatchHistoryCheck() {
  async function waitForBrowserElement(selector) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  }

  document.querySelector('[data-action="reset-project"]').click();
  await new Promise((resolve) => setTimeout(resolve, 25));
  document.querySelector('[data-action="toggle-ai-drawer"]').click();
  await new Promise((resolve) => setTimeout(resolve, 25));
  document.querySelector("[data-ai-prompt]").value = "make this bouncier";
  document.querySelector('[data-action="run-ai"]').click();
  const applyButton = await waitForBrowserElement('[data-action="apply-ai"]');
  if (!applyButton) return false;
  applyButton.click();
  return Boolean(await waitForBrowserElement(".patch-history p"));
}
