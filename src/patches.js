import { cloneDocument, findLayer, getActiveScene, layerDefaults, setOrInsertKeyframe } from "./model.js";

export const PATCH_TYPES = new Set([
  "createLayer",
  "deleteLayer",
  "setLayerProperty",
  "insertKeyframe",
  "setInterpolation",
  "applyPreset",
  "reorderLayer"
]);

export function applyPatch(document, patch) {
  validatePatch(patch);
  const next = cloneDocument(document);
  const scene = getActiveScene(next);

  for (const op of patch.operations) {
    if (op.type === "createLayer") {
      const layer = { ...layerDefaults(op.layerType ?? "rect", scene), ...(op.layer ?? {}) };
      scene.layers.push(layer);
    }

    if (op.type === "deleteLayer") {
      scene.layers = scene.layers.filter((layer) => layer.id !== op.layerId);
    }

    if (op.type === "setLayerProperty") {
      const target = findLayer(next, op.layerId);
      if (!target) continue;
      setNested(target.layer, op.path, op.value);
    }

    if (op.type === "insertKeyframe") {
      const target = findLayer(next, op.layerId);
      if (!target) continue;
      setOrInsertKeyframe(target.layer, op.property, op.time, op.value, op.ease ?? "linear");
    }

    if (op.type === "setInterpolation") {
      const target = findLayer(next, op.layerId);
      const frames = target?.layer.keyframes?.[op.property] ?? [];
      const frame = frames.find((candidate) => Math.abs(candidate.time - op.time) < 0.0001);
      if (frame) frame.ease = op.ease;
    }

    if (op.type === "applyPreset") {
      applyPreset(next, op);
    }

    if (op.type === "reorderLayer") {
      const from = scene.layers.findIndex((layer) => layer.id === op.layerId);
      if (from < 0) continue;
      const [layer] = scene.layers.splice(from, 1);
      scene.layers.splice(Math.max(0, Math.min(scene.layers.length, op.index)), 0, layer);
    }
  }

  return next;
}

export function validatePatch(patch) {
  if (!patch || typeof patch !== "object") throw new Error("Patch must be an object.");
  if (!Array.isArray(patch.operations)) throw new Error("Patch requires an operations array.");
  for (const op of patch.operations) {
    if (!PATCH_TYPES.has(op.type)) throw new Error(`Unsupported patch operation: ${op.type}`);
  }
}

export function describePatch(patch) {
  return patch.operations.map((op) => {
    if (op.type === "createLayer") return `Create ${op.layerType ?? "shape"} layer`;
    if (op.type === "deleteLayer") return `Delete layer ${op.layerId}`;
    if (op.type === "setLayerProperty") return `Set ${op.path} on ${op.layerId}`;
    if (op.type === "insertKeyframe") return `Keyframe ${op.property} at ${op.time.toFixed(2)}s`;
    if (op.type === "setInterpolation") return `Set ${op.property} easing to ${op.ease}`;
    if (op.type === "applyPreset") return `Apply ${op.preset} preset`;
    if (op.type === "reorderLayer") return `Move layer ${op.layerId}`;
    return op.type;
  });
}

function applyPreset(document, op) {
  const target = findLayer(document, op.layerId);
  if (!target) return;
  const { layer } = target;
  const start = op.start ?? 0;
  const duration = op.duration ?? 0.8;

  if (op.preset === "popReveal") {
    setOrInsertKeyframe(layer, "opacity", start, 0, "easeOut");
    setOrInsertKeyframe(layer, "opacity", start + duration * 0.25, 1, "easeOut");
    setOrInsertKeyframe(layer, "scaleX", start, 0.55, "spring");
    setOrInsertKeyframe(layer, "scaleY", start, 0.55, "spring");
    setOrInsertKeyframe(layer, "scaleX", start + duration, 1, "spring");
    setOrInsertKeyframe(layer, "scaleY", start + duration, 1, "spring");
  }

  if (op.preset === "slideUp") {
    const y = layer.keyframes?.y?.[0]?.value ?? 0;
    setOrInsertKeyframe(layer, "opacity", start, 0, "easeOut");
    setOrInsertKeyframe(layer, "opacity", start + duration, 1, "easeOut");
    setOrInsertKeyframe(layer, "y", start, y + 80, "easeOut");
    setOrInsertKeyframe(layer, "y", start + duration, y, "easeOut");
  }

  if (op.preset === "breathe") {
    setOrInsertKeyframe(layer, "scaleX", start, 1, "easeInOut");
    setOrInsertKeyframe(layer, "scaleY", start, 1, "easeInOut");
    setOrInsertKeyframe(layer, "scaleX", start + duration / 2, 1.04, "easeInOut");
    setOrInsertKeyframe(layer, "scaleY", start + duration / 2, 1.04, "easeInOut");
    setOrInsertKeyframe(layer, "scaleX", start + duration, 1, "easeInOut");
    setOrInsertKeyframe(layer, "scaleY", start + duration, 1, "easeInOut");
  }
}

function setNested(object, path, value) {
  const parts = path.split(".");
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}
