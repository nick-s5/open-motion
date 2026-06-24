import { applyPatch, describePatch } from "./patches.js";
import { createDemoDocument, createStarterDocument, evaluateLayer, evaluateScene, getActiveScene, layerDefaults, setOrInsertKeyframe } from "./model.js";
import { exportLottieSubset, exportProjectJson, exportSvgSnapshot, getCompatibilityWarnings } from "./exporters.js";
import { runLocalAgent } from "./aiAgent.js";
import { validateProjectDocument } from "./projectValidation.js";

const state = {
  document: loadDocument(),
  selectedLayerId: null,
  time: 0,
  playing: false,
  currentEase: "linear",
  drag: null,
  previewPatch: null,
  undoStack: [],
  lastFrameAt: 0
};

const app = document.querySelector("#app");
state.selectedLayerId = getActiveScene(state.document).layers[0]?.id ?? null;

render();
window.addEventListener("keydown", handleKeydown);
window.addEventListener("pointermove", handlePointerMove);
window.addEventListener("pointerup", handlePointerUp);
requestAnimationFrame(tick);

function render() {
  const scene = getActiveScene(state.document);
  const evaluated = evaluateScene(scene, state.time);
  const selected = scene.layers.find((layer) => layer.id === state.selectedLayerId) ?? scene.layers[0];
  const warnings = getCompatibilityWarnings(state.document);

  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <strong>Open Motion</strong>
        <span>Web Alpha</span>
      </div>
      <div class="toolbar" role="toolbar">
        <button data-action="play" title="Play or pause">${state.playing ? "Pause" : "Play"}</button>
        <button data-action="add-rect" title="Add rectangle">Rect</button>
        <button data-action="add-ellipse" title="Add ellipse">Oval</button>
        <button data-action="add-text" title="Add text">Text</button>
        <button data-action="assign-mask" title="Assign nearest mask layer">Mask</button>
        <button data-action="delete-layer" title="Delete selected layer">Delete</button>
        <button data-action="undo" title="Undo">Undo</button>
        <button data-action="reset-project" title="Reset current project">Reset</button>
        <button data-action="import-json" title="Import project JSON">Import</button>
      </div>
      <div class="scene-meta">
        <select data-scene-select title="Current scene">
          ${state.document.scenes.map((candidate) => `<option value="${candidate.id}" ${candidate.id === scene.id ? "selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("")}
        </select>
        <select data-starter>
          <option value="logo">Logo reveal</option>
          <option value="social" ${state.document.name === "Social Title Card" ? "selected" : ""}>Social title</option>
          <option value="micro" ${state.document.name === "UI Microinteraction" ? "selected" : ""}>UI micro</option>
        </select>
      </div>
    </header>

    <main class="workspace">
      <aside class="panel layers-panel">
        <div class="panel-title">Layers</div>
        <div class="layer-list">
          ${scene.layers.map((layer) => layerRow(layer)).join("")}
        </div>
      </aside>

      <section class="stage-panel">
        <div class="stage-wrap">
          ${renderStage(evaluated)}
        </div>
      </section>

      <aside class="panel inspector-panel">
        ${renderInspector(selected)}
        ${renderAiDock()}
        ${renderExportPanel(warnings)}
      </aside>
    </main>

    <footer class="timeline-panel">
      <div class="timebar">
        <span>${state.time.toFixed(2)}s</span>
        <input class="scrubber" data-action="scrub" type="range" min="0" max="${scene.duration}" step="${1 / scene.fps}" value="${state.time}" />
        <span>${scene.duration.toFixed(2)}s</span>
      </div>
      <div class="timeline">
        ${scene.layers.map((layer) => timelineRow(layer, scene.duration)).join("")}
      </div>
    </footer>
    <input class="hidden-file" type="file" accept="application/json,.json" data-json-import />
  `;

  wireEvents();
}

function layerRow(layer) {
  const selected = layer.id === state.selectedLayerId ? " selected" : "";
  const label = layer.isMask ? "mask" : layer.type === "precomp" ? "scene" : layer.type;
  return `
    <div class="layer-row${selected}" data-select-layer="${layer.id}">
      <button class="visibility" data-layer-toggle="${layer.id}" title="Toggle visibility">${layer.visible === false ? "off" : "on"}</button>
      <span>${escapeHtml(layer.name)}</span>
      <small>${label}</small>
    </div>
  `;
}

function renderStage(scene) {
  const masks = scene.layers.filter((layer) => layer.raw.isMask).map((layer) => renderClipPath(layer)).join("");
  const layers = scene.layers.filter((layer) => layer.visible && !layer.raw.isMask).map((layer) => renderSvgLayer(layer)).join("");
  return `
    <svg class="stage" viewBox="0 0 ${scene.width} ${scene.height}" aria-label="Motion preview">
      <defs>
        <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#1d1c1a" flood-opacity="0.16" />
        </filter>
        ${masks}
      </defs>
      <rect width="${scene.width}" height="${scene.height}" fill="${scene.background}" />
      ${layers}
    </svg>
  `;
}

function renderSvgLayer(layer) {
  const raw = layer.raw;
  const selectedClass = layer.id === state.selectedLayerId ? " selected-shape" : "";
  const transform = `translate(${layer.x} ${layer.y}) rotate(${layer.rotation}) scale(${layer.scaleX} ${layer.scaleY})`;
  const style = `opacity:${layer.opacity};mix-blend-mode:${cssBlend(layer.blendMode)};`;
  const filter = raw.effects?.shadow ? "filter=\"url(#softShadow)\"" : "";
  const clip = raw.maskId ? `clip-path="url(#clip-${raw.maskId})"` : "";
  const common = `class="svg-layer${selectedClass}" data-select-layer="${layer.id}" data-drag-layer="${layer.id}" transform="${transform}" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" style="${style}" ${filter} ${clip}`;
  if (layer.blur > 0) {
    return `<g style="filter:blur(${layer.blur}px)">${renderSvgLayer({ ...layer, blur: 0 })}</g>`;
  }
  if (layer.type === "rect") {
    const { width, height, radius } = raw.shape;
    return `<rect ${common} x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${radius}" />`;
  }
  if (layer.type === "ellipse") {
    const { rx, ry } = raw.shape;
    return `<ellipse ${common} cx="0" cy="0" rx="${rx}" ry="${ry}" />`;
  }
  if (layer.type === "text") {
    return `<text ${common} x="0" y="0" font-family="Inter, Arial, sans-serif" font-size="${raw.text.size}" font-weight="${raw.text.weight}" text-anchor="${raw.text.align}" dominant-baseline="middle">${renderTextSpans(raw.text.value)}</text>`;
  }
  if (layer.type === "precomp") {
    const nestedScene = state.document.scenes.find((scene) => scene.id === raw.sceneId);
    if (!nestedScene) return "";
    const nested = evaluateScene(nestedScene, state.time % nestedScene.duration);
    const sx = (raw.shape?.width ?? nested.width) / nested.width;
    const sy = (raw.shape?.height ?? nested.height) / nested.height;
    const content = nested.layers.filter((nestedLayer) => nestedLayer.visible && !nestedLayer.raw.isMask).map((nestedLayer) => renderSvgLayer(nestedLayer)).join("");
    return `<g ${common}><rect x="${-raw.shape.width / 2}" y="${-raw.shape.height / 2}" width="${raw.shape.width}" height="${raw.shape.height}" rx="18" fill="${nested.background}" stroke="#d7d1c6" stroke-width="2" /><g style="pointer-events:none" transform="translate(${-raw.shape.width / 2} ${-raw.shape.height / 2}) scale(${sx} ${sy})">${content}</g></g>`;
  }
  return `<path ${common} d="${raw.path?.d ?? ""}" />`;
}

function renderClipPath(maskLayer) {
  const raw = maskLayer.raw;
  const transform = `translate(${maskLayer.x} ${maskLayer.y}) rotate(${maskLayer.rotation}) scale(${maskLayer.scaleX} ${maskLayer.scaleY})`;
  if (maskLayer.type === "rect") {
    const { width, height, radius } = raw.shape;
    return `<clipPath id="clip-${raw.id}"><rect transform="${transform}" x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${radius}" /></clipPath>`;
  }
  if (maskLayer.type === "ellipse") {
    const { rx, ry } = raw.shape;
    return `<clipPath id="clip-${raw.id}"><ellipse transform="${transform}" cx="0" cy="0" rx="${rx}" ry="${ry}" /></clipPath>`;
  }
  return `<clipPath id="clip-${raw.id}"><path transform="${transform}" d="${raw.path?.d ?? ""}" /></clipPath>`;
}

function renderTextSpans(value) {
  const lines = String(value).split("\\n");
  if (lines.length === 1) return escapeHtml(value);
  const start = -((lines.length - 1) * 0.58);
  return lines.map((line, index) => `<tspan x="0" dy="${index === 0 ? `${start}em` : "1.16em"}">${escapeHtml(line)}</tspan>`).join("");
}

function renderInspector(layer) {
  if (!layer) return `<section class="inspector"><div class="panel-title">Inspector</div><p>No layer selected.</p></section>`;
  const current = evaluateLayer(layer, state.time);
  return `
    <section class="inspector">
      <div class="panel-title">Inspector</div>
      <label>Name<input data-layer-field="name" value="${escapeHtml(layer.name)}" /></label>
      ${layer.type === "text" ? `<label>Text<input data-layer-field="text.value" value="${escapeHtml(layer.text.value)}" /></label>` : ""}
      <div class="property-grid">
        ${numberField("x", current.x)}
        ${numberField("y", current.y)}
        ${numberField("scaleX", current.scaleX, 0.01)}
        ${numberField("scaleY", current.scaleY, 0.01)}
        ${numberField("rotation", current.rotation)}
        ${numberField("opacity", current.opacity, 0.01)}
      </div>
      <div class="property-grid">
        <label>Fill<input type="color" data-style-field="fill" value="${safeColor(layer.style.fill)}" /></label>
        <label>Stroke<input type="color" data-style-field="stroke" value="${safeColor(layer.style.stroke)}" /></label>
      </div>
      <label>Mask<select data-layer-field="maskId">
        <option value="">None</option>
        ${getActiveScene(state.document).layers.filter((candidate) => candidate.isMask).map((candidate) => `<option value="${candidate.id}" ${layer.maskId === candidate.id ? "selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("")}
      </select></label>
      <label>Easing for new keyframes<select data-ease-select>
        ${["linear", "easeIn", "easeOut", "easeInOut", "spring"].map((ease) => `<option value="${ease}" ${state.currentEase === ease ? "selected" : ""}>${ease}</option>`).join("")}
      </select></label>
      <div class="button-row">
        <button data-action="key-selected">Keyframe selected props</button>
        <button data-action="delete-playhead-keys">Delete playhead keys</button>
        <button data-action="preset-pop">Pop reveal</button>
        <button data-action="layer-up">Move up</button>
        <button data-action="layer-down">Move down</button>
        ${layer.type === "precomp" ? `<button data-action="open-precomp">Open scene</button>` : ""}
      </div>
    </section>
  `;
}

function numberField(property, value, step = 1) {
  return `<label>${property}<input type="number" step="${step}" data-track-field="${property}" value="${round(value)}" /></label>`;
}

function renderAiDock() {
  const preview = state.previewPatch
    ? `<div class="patch-preview"><strong>${escapeHtml(state.previewPatch.title)}</strong><pre>${escapeHtml(state.previewPatch.message)}</pre><div class="button-row"><button data-action="apply-ai">Apply</button><button data-action="discard-ai">Discard</button></div></div>`
    : "";
  return `
    <section class="ai-dock">
      <div class="panel-title">AI Control</div>
      <div class="mode-row">
        <select data-ai-mode>
          <option value="draft">Draft</option>
          <option value="edit" selected>Edit</option>
          <option value="explain">Explain</option>
          <option value="automate">Automate</option>
        </select>
      </div>
      <textarea data-ai-prompt rows="3" placeholder="Try: make this bouncier, stagger the layers, draft a logo reveal"></textarea>
      <button data-action="run-ai">Preview patch</button>
      ${preview}
    </section>
  `;
}

function renderExportPanel(warnings) {
  return `
    <section class="export-panel">
      <div class="panel-title">Export</div>
      <div class="button-row">
        <button data-action="export-json">JSON</button>
        <button data-action="export-svg">SVG</button>
        <button data-action="export-lottie">Lottie</button>
      </div>
      <div class="warnings">
        ${warnings.length ? warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("") : "<p>Lottie subset looks clean.</p>"}
      </div>
    </section>
  `;
}

function timelineRow(layer, duration) {
  const tracks = Object.entries(layer.keyframes ?? {});
  const marks = tracks.flatMap(([property, frames]) => frames.map((frame) => {
    const left = (frame.time / duration) * 100;
    return `<button class="key-dot" title="${property} ${frame.time.toFixed(2)}s ${frame.ease ?? "linear"}" style="left:${left}%;" data-select-layer="${layer.id}" data-time="${frame.time}"></button>`;
  })).join("");
  return `<div class="timeline-row"><span>${escapeHtml(layer.name)}</span><div class="track">${marks}</div></div>`;
}

function wireEvents() {
  app.querySelectorAll("[data-select-layer]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedLayerId = element.dataset.selectLayer;
      if (element.dataset.time) state.time = Number(element.dataset.time);
      render();
    });
  });

  app.querySelectorAll("[data-drag-layer]").forEach((element) => {
    element.addEventListener("pointerdown", (event) => {
      const layer = getActiveScene(state.document).layers.find((candidate) => candidate.id === element.dataset.dragLayer);
      if (!layer || layer.locked) return;
      event.preventDefault();
      event.stopPropagation();
      state.selectedLayerId = layer.id;
      const point = svgPoint(event);
      const evaluated = evaluateLayer(layer, state.time);
      state.drag = {
        layerId: layer.id,
        offsetX: evaluated.x - point.x,
        offsetY: evaluated.y - point.y,
        changed: false
      };
      element.setPointerCapture?.(event.pointerId);
    });
  });

  app.querySelectorAll("[data-layer-toggle]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      const layer = getActiveScene(state.document).layers.find((candidate) => candidate.id === element.dataset.layerToggle);
      if (!layer) return;
      pushUndo();
      layer.visible = layer.visible === false;
      persist();
      render();
    });
  });

  app.querySelectorAll("[data-action]").forEach((element) => {
    if (element.dataset.action === "scrub") {
      element.addEventListener("input", () => {
        state.time = Number(element.value);
        state.playing = false;
        render();
      });
    } else {
      element.addEventListener("click", () => handleAction(element.dataset.action));
    }
  });

  app.querySelectorAll("[data-track-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const layer = selectedLayer();
      if (!layer) return;
      pushUndo();
      setOrInsertKeyframe(layer, input.dataset.trackField, state.time, Number(input.value), state.currentEase);
      persist();
      render();
    });
  });

  app.querySelectorAll("[data-style-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const layer = selectedLayer();
      if (!layer) return;
      pushUndo();
      layer.style[input.dataset.styleField] = input.value;
      persist();
      render();
    });
  });

  app.querySelectorAll("[data-layer-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const layer = selectedLayer();
      if (!layer) return;
      pushUndo();
      setByPath(layer, input.dataset.layerField, input.value);
      persist();
      render();
    });
  });

  const starter = app.querySelector("[data-starter]");
  starter?.addEventListener("change", () => {
    pushUndo();
    state.document = createStarterDocument(starter.value);
    state.selectedLayerId = getActiveScene(state.document).layers[0]?.id ?? null;
    state.time = 0;
    persist();
    render();
  });

  const sceneSelect = app.querySelector("[data-scene-select]");
  sceneSelect?.addEventListener("change", () => {
    state.document.activeSceneId = sceneSelect.value;
    state.selectedLayerId = getActiveScene(state.document).layers[0]?.id ?? null;
    state.time = Math.min(state.time, getActiveScene(state.document).duration);
    persist();
    render();
  });

  const easeSelect = app.querySelector("[data-ease-select]");
  easeSelect?.addEventListener("change", () => {
    state.currentEase = easeSelect.value;
  });

  const importInput = app.querySelector("[data-json-import]");
  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const next = validateProjectDocument(JSON.parse(await file.text()));
      pushUndo();
      state.document = next;
      state.time = 0;
      state.playing = false;
      state.previewPatch = null;
      reconcileSelection();
      persist();
      render();
    } catch (error) {
      window.alert(`Could not import project JSON: ${error.message}`);
    }
  });
}

function handleAction(action) {
  if (action === "play") state.playing = !state.playing;
  if (action === "undo") undo();
  if (action === "reset-project") resetProject();
  if (action === "import-json") app.querySelector("[data-json-import]")?.click();
  if (action === "add-rect") addLayer("rect");
  if (action === "add-ellipse") addLayer("ellipse");
  if (action === "add-text") addLayer("text");
  if (action === "assign-mask") assignMask();
  if (action === "delete-layer") deleteSelectedLayer();
  if (action === "key-selected") keySelectedProperties();
  if (action === "delete-playhead-keys") deletePlayheadKeyframes();
  if (action === "preset-pop") previewPatch({ title: "Pop reveal", operations: [{ type: "applyPreset", layerId: state.selectedLayerId, preset: "popReveal", start: state.time, duration: 0.85 }] });
  if (action === "layer-up") moveSelectedLayer(-1);
  if (action === "layer-down") moveSelectedLayer(1);
  if (action === "open-precomp") openSelectedPrecomp();
  if (action === "run-ai") runAi();
  if (action === "apply-ai") applyPreviewPatch();
  if (action === "discard-ai") state.previewPatch = null;
  if (action === "export-json") download("open-motion-project.json", exportProjectJson(state.document), "application/json");
  if (action === "export-svg") download("open-motion-snapshot.svg", exportSvgSnapshot(state.document, state.time), "image/svg+xml");
  if (action === "export-lottie") {
    const exported = exportLottieSubset(state.document);
    download("open-motion-lottie.json", exported.json, "application/json");
  }
  const scene = getActiveScene(state.document);
  state.time = Math.min(scene.duration, Math.max(0, state.time));
  persist();
  render();
}

function handleKeydown(event) {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  if (typing) return;

  if (event.code === "Space") {
    event.preventDefault();
    state.playing = !state.playing;
    render();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undo();
    persist();
    render();
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedLayer();
    persist();
    render();
  }

  if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    keySelectedProperties();
    persist();
    render();
  }
}

function handlePointerMove(event) {
  if (!state.drag) return;
  const layer = selectedLayer();
  if (!layer || layer.id !== state.drag.layerId) return;
  const point = svgPoint(event);
  if (!state.drag.changed) {
    pushUndo();
    state.drag.changed = true;
  }
  setOrInsertKeyframe(layer, "x", state.time, round(point.x + state.drag.offsetX), state.currentEase);
  setOrInsertKeyframe(layer, "y", state.time, round(point.y + state.drag.offsetY), state.currentEase);
  persist();
  render();
}

function handlePointerUp() {
  state.drag = null;
}

function svgPoint(event) {
  const target = event.target instanceof Element ? event.target : null;
  const svg = target?.closest("svg") ?? app.querySelector(".stage");
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function deleteSelectedLayer() {
  const scene = getActiveScene(state.document);
  const index = scene.layers.findIndex((layer) => layer.id === state.selectedLayerId);
  if (index < 0) return;
  pushUndo();
  const [deleted] = scene.layers.splice(index, 1);
  for (const layer of scene.layers) {
    if (layer.maskId === deleted.id) layer.maskId = null;
  }
  state.selectedLayerId = scene.layers[Math.min(index, scene.layers.length - 1)]?.id ?? null;
}

function moveSelectedLayer(direction) {
  const scene = getActiveScene(state.document);
  const index = scene.layers.findIndex((layer) => layer.id === state.selectedLayerId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= scene.layers.length) return;
  pushUndo();
  const [layer] = scene.layers.splice(index, 1);
  scene.layers.splice(nextIndex, 0, layer);
}

function openSelectedPrecomp() {
  const layer = selectedLayer();
  if (!layer?.sceneId) return;
  const scene = state.document.scenes.find((candidate) => candidate.id === layer.sceneId);
  if (!scene) return;
  state.document.activeSceneId = scene.id;
  state.selectedLayerId = scene.layers[0]?.id ?? null;
  state.time = 0;
}

function deletePlayheadKeyframes() {
  const layer = selectedLayer();
  if (!layer?.keyframes) return;
  pushUndo();
  for (const [property, frames] of Object.entries(layer.keyframes)) {
    layer.keyframes[property] = frames.filter((frame) => Math.abs(frame.time - state.time) > 0.0001);
    if (!layer.keyframes[property].length) delete layer.keyframes[property];
  }
}

function assignMask() {
  const scene = getActiveScene(state.document);
  const layer = selectedLayer();
  if (!layer) return;
  const masks = scene.layers.filter((candidate) => candidate.isMask && candidate.id !== layer.id);
  const mask = masks.at(-1);
  if (!mask) return;
  pushUndo();
  layer.maskId = layer.maskId === mask.id ? null : mask.id;
}

function addLayer(type) {
  const scene = getActiveScene(state.document);
  pushUndo();
  const layer = layerDefaults(type, scene);
  scene.layers.push(layer);
  state.selectedLayerId = layer.id;
}

function resetProject() {
  pushUndo();
  state.document = createDemoDocument();
  state.time = 0;
  state.playing = false;
  state.previewPatch = null;
  reconcileSelection();
}

function keySelectedProperties() {
  const layer = selectedLayer();
  if (!layer) return;
  const evaluated = evaluateLayer(layer, state.time);
  pushUndo();
  ["x", "y", "scaleX", "scaleY", "rotation", "opacity"].forEach((property) => {
    setOrInsertKeyframe(layer, property, state.time, evaluated[property], state.currentEase);
  });
}

function runAi() {
  const mode = app.querySelector("[data-ai-mode]").value;
  const prompt = app.querySelector("[data-ai-prompt]").value;
  const result = runLocalAgent({ mode, prompt, document: state.document, selectedLayerId: state.selectedLayerId, time: state.time });
  if (result.kind === "patch") {
    state.previewPatch = result;
  } else {
    state.previewPatch = { title: result.title, message: result.message, patch: { operations: [] } };
  }
}

function previewPatch(patch) {
  state.previewPatch = {
    kind: "patch",
    title: patch.title,
    message: describePatch(patch).join("\n"),
    patch
  };
}

function applyPreviewPatch() {
  if (!state.previewPatch?.patch?.operations?.length) {
    state.previewPatch = null;
    return;
  }
  pushUndo();
  state.document = applyPatch(state.document, state.previewPatch.patch);
  state.previewPatch = null;
  reconcileSelection();
}

function tick(now) {
  if (state.playing) {
    const scene = getActiveScene(state.document);
    const delta = state.lastFrameAt ? (now - state.lastFrameAt) / 1000 : 0;
    state.time = (state.time + delta) % scene.duration;
    render();
  }
  state.lastFrameAt = now;
  requestAnimationFrame(tick);
}

function selectedLayer() {
  return getActiveScene(state.document).layers.find((layer) => layer.id === state.selectedLayerId);
}

function pushUndo() {
  state.undoStack.push(JSON.stringify(state.document));
  if (state.undoStack.length > 50) state.undoStack.shift();
}

function undo() {
  const previous = state.undoStack.pop();
  if (!previous) return;
  state.document = JSON.parse(previous);
  reconcileSelection();
}

function persist() {
  localStorage.setItem("open-motion-document", JSON.stringify(state.document));
}

function loadDocument() {
  const stored = localStorage.getItem("open-motion-document");
  if (!stored) return createDemoDocument();
  try {
    return validateProjectDocument(JSON.parse(stored));
  } catch {
    return createDemoDocument();
  }
}

function reconcileSelection() {
  const scene = getActiveScene(state.document);
  if (state.document.activeSceneId !== scene.id) state.document.activeSceneId = scene.id;
  if (!scene.layers.some((layer) => layer.id === state.selectedLayerId)) {
    state.selectedLayerId = scene.layers[0]?.id ?? null;
  }
  state.time = Math.min(scene.duration, Math.max(0, state.time));
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function setByPath(object, path, value) {
  const parts = path.split(".");
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function cssBlend(mode) {
  return mode === "normal" ? "normal" : mode;
}

function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function escapeHtml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&#39;",
    '"': "&quot;"
  })[char]);
}
