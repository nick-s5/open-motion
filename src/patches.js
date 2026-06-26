import { cloneDocument, findLayer, getActiveScene, layerDefaults, setOrInsertKeyframe } from "./model.js";

export const PATCH_TYPES = new Set([
  "createLayer",
  "deleteLayer",
  "setLayerProperty",
  "insertKeyframe",
  "setInterpolation",
  "applyPreset",
  "reorderLayer",
  "deleteKeyframesAtTime"
]);

const LAYER_TYPES = new Set(["rect", "ellipse", "text", "precomp", "path"]);
const EASINGS = new Set(["linear", "easeIn", "easeOut", "easeInOut", "spring"]);
const PRESETS = new Set(["popReveal", "slideUp", "breathe"]);
const KEYFRAME_PROPERTIES = new Set(["x", "y", "scaleX", "scaleY", "rotation", "opacity", "fill", "stroke", "strokeWidth", "blur"]);
const PAINT_PROPERTIES = new Set(["fill", "stroke"]);
const SET_LAYER_PATHS = new Set([
  "name",
  "visible",
  "locked",
  "isMask",
  "blendMode",
  "parentId",
  "maskId",
  "sceneId",
  "text.value",
  "text.size",
  "text.weight",
  "text.align",
  "shape.width",
  "shape.height",
  "shape.radius",
  "shape.rx",
  "shape.ry",
  "style.fill",
  "style.stroke",
  "style.strokeWidth",
  "effects.blur",
  "effects.shadow"
]);

export function applyPatch(document, patch) {
  validatePatch(patch, document);
  const next = cloneDocument(document);
  const scene = getActiveScene(next);

  for (const op of patch.operations) {
    if (op.type === "createLayer") {
      const layer = { ...layerDefaults(op.layerType ?? "rect", scene), ...(op.layer ?? {}) };
      scene.layers.push(layer);
    }

    if (op.type === "deleteLayer") {
      const target = findLayer(next, op.layerId);
      if (!target) continue;
      target.scene.layers = target.scene.layers.filter((layer) => layer.id !== op.layerId);
      for (const layer of target.scene.layers) {
        if (layer.maskId === op.layerId) layer.maskId = null;
      }
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
      const target = findLayer(next, op.layerId);
      if (!target) continue;
      const from = target.scene.layers.findIndex((layer) => layer.id === op.layerId);
      if (from < 0) continue;
      const [layer] = target.scene.layers.splice(from, 1);
      target.scene.layers.splice(Math.max(0, Math.min(target.scene.layers.length, op.index)), 0, layer);
    }

    if (op.type === "deleteKeyframesAtTime") {
      const target = findLayer(next, op.layerId);
      if (!target?.layer.keyframes) continue;
      const properties = op.properties ?? Object.keys(target.layer.keyframes);
      for (const property of properties) {
        const frames = target.layer.keyframes[property] ?? [];
        target.layer.keyframes[property] = frames.filter((frame) => Math.abs(frame.time - op.time) > 0.0001);
        if (!target.layer.keyframes[property].length) delete target.layer.keyframes[property];
      }
    }
  }

  return next;
}

export function validatePatch(patch, document = null) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Patch must be an object.");
  if (!Array.isArray(patch.operations)) throw new Error("Patch requires an operations array.");
  if (patch.operations.length > 1000) throw new Error("Patch has too many operations.");
  for (const [index, op] of patch.operations.entries()) {
    if (!op || typeof op !== "object" || Array.isArray(op)) throw new Error(`Operation ${index + 1} must be an object.`);
    if (!PATCH_TYPES.has(op.type)) throw new Error(`Unsupported patch operation: ${op.type}`);
    validateOperation(op, document, index);
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
    if (op.type === "deleteKeyframesAtTime") return `Delete keyframes at ${op.time.toFixed(2)}s`;
    return op.type;
  });
}

function validateOperation(op, document, index) {
  const label = `Operation ${index + 1}`;

  if (op.type === "createLayer") {
    const type = op.layerType ?? op.layer?.type ?? "rect";
    requireOneOf(type, LAYER_TYPES, `${label} layerType`);
    if (op.layer != null) validateLayerDraft(op.layer, `${label} layer`);
  }

  if (op.type === "deleteLayer") {
    requireLayerId(op.layerId, `${label} layerId`);
    requireLayer(document, op.layerId, label);
  }

  if (op.type === "setLayerProperty") {
    requireLayerId(op.layerId, `${label} layerId`);
    requireOneOf(op.path, SET_LAYER_PATHS, `${label} path`);
    validatePathValue(op.path, op.value, `${label} value`);
    requireLayer(document, op.layerId, label);
  }

  if (op.type === "insertKeyframe") {
    requireLayerId(op.layerId, `${label} layerId`);
    requireOneOf(op.property, KEYFRAME_PROPERTIES, `${label} property`);
    const target = requireLayer(document, op.layerId, label);
    const maxTime = target?.scene.duration ?? Number.POSITIVE_INFINITY;
    requireFiniteNumber(op.time, `${label} time`, { min: 0, max: maxTime });
    validateKeyframeValue(op.property, op.value, `${label} value`);
    requireOneOf(op.ease ?? "linear", EASINGS, `${label} ease`);
  }

  if (op.type === "setInterpolation") {
    requireLayerId(op.layerId, `${label} layerId`);
    requireOneOf(op.property, KEYFRAME_PROPERTIES, `${label} property`);
    requireFiniteNumber(op.time, `${label} time`, { min: 0 });
    requireOneOf(op.ease, EASINGS, `${label} ease`);
    const target = requireLayer(document, op.layerId, label);
    if (target) {
      const frames = target.layer.keyframes?.[op.property] ?? [];
      if (!frames.some((frame) => Math.abs(frame.time - op.time) < 0.0001)) {
        throw new Error(`${label} target keyframe does not exist.`);
      }
    }
  }

  if (op.type === "applyPreset") {
    requireLayerId(op.layerId, `${label} layerId`);
    requireOneOf(op.preset, PRESETS, `${label} preset`);
    requireFiniteNumber(op.start ?? 0, `${label} start`, { min: 0 });
    requireFiniteNumber(op.duration ?? 0.8, `${label} duration`, { min: 0.001, max: 3600 });
    requireLayer(document, op.layerId, label);
  }

  if (op.type === "reorderLayer") {
    requireLayerId(op.layerId, `${label} layerId`);
    const target = requireLayer(document, op.layerId, label);
    const maxIndex = target ? target.scene.layers.length - 1 : Number.MAX_SAFE_INTEGER;
    requireInteger(op.index, `${label} index`, { min: 0, max: maxIndex });
  }

  if (op.type === "deleteKeyframesAtTime") {
    requireLayerId(op.layerId, `${label} layerId`);
    const target = requireLayer(document, op.layerId, label);
    const maxTime = target?.scene.duration ?? Number.POSITIVE_INFINITY;
    requireFiniteNumber(op.time, `${label} time`, { min: 0, max: maxTime });
    if (op.properties != null) {
      if (!Array.isArray(op.properties) || !op.properties.length) throw new Error(`${label} properties must be a non-empty array.`);
      for (const property of op.properties) requireOneOf(property, KEYFRAME_PROPERTIES, `${label} properties`);
    }
  }
}

function validateLayerDraft(layer, label) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) throw new Error(`${label} must be an object.`);
  if (layer.id != null) requireLayerId(layer.id, `${label}.id`);
  if (layer.type != null) requireOneOf(layer.type, LAYER_TYPES, `${label}.type`);
  if (layer.name != null) requireDisplayString(layer.name, `${label}.name`, 120);
  if (layer.visible != null && typeof layer.visible !== "boolean") throw new Error(`${label}.visible must be true or false.`);
  if (layer.locked != null && typeof layer.locked !== "boolean") throw new Error(`${label}.locked must be true or false.`);
  if (layer.parentId != null) requireOptionalId(layer.parentId, `${label}.parentId`);
  if (layer.maskId != null) requireOptionalId(layer.maskId, `${label}.maskId`);
  if (layer.sceneId != null) requireOptionalId(layer.sceneId, `${label}.sceneId`);
  if (layer.style != null) validateStyleDraft(layer.style, `${label}.style`);
  if (layer.effects != null) validateEffectsDraft(layer.effects, `${label}.effects`);
  if (layer.keyframes != null) validateKeyframesDraft(layer.keyframes, `${label}.keyframes`);
}

function validateStyleDraft(style, label) {
  if (!style || typeof style !== "object" || Array.isArray(style)) throw new Error(`${label} must be an object.`);
  if (style.fill != null) requirePaint(style.fill, `${label}.fill`);
  if (style.stroke != null) requirePaint(style.stroke, `${label}.stroke`);
  if (style.strokeWidth != null) requireFiniteNumber(style.strokeWidth, `${label}.strokeWidth`, { min: 0, max: 10000 });
}

function validateEffectsDraft(effects, label) {
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) throw new Error(`${label} must be an object.`);
  if (effects.blur != null) requireFiniteNumber(effects.blur, `${label}.blur`, { min: 0, max: 1000 });
  if (effects.shadow != null && typeof effects.shadow !== "boolean") throw new Error(`${label}.shadow must be true or false.`);
}

function validateKeyframesDraft(keyframes, label) {
  if (!keyframes || typeof keyframes !== "object" || Array.isArray(keyframes)) throw new Error(`${label} must be an object.`);
  for (const [property, frames] of Object.entries(keyframes)) {
    requireOneOf(property, KEYFRAME_PROPERTIES, `${label}.${property}`);
    if (!Array.isArray(frames)) throw new Error(`${label}.${property} must be an array.`);
    for (const [index, frame] of frames.entries()) {
      if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new Error(`${label}.${property}[${index}] must be an object.`);
      requireFiniteNumber(frame.time, `${label}.${property}[${index}].time`, { min: 0 });
      validateKeyframeValue(property, frame.value, `${label}.${property}[${index}].value`);
      requireOneOf(frame.ease ?? "linear", EASINGS, `${label}.${property}[${index}].ease`);
    }
  }
}

function validatePathValue(path, value, label) {
  if (["visible", "locked", "isMask", "effects.shadow"].includes(path)) {
    if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
    return;
  }
  if (["name", "text.value"].includes(path)) {
    requireDisplayString(value, label, path === "text.value" ? 2000 : 120);
    return;
  }
  if (["parentId", "maskId", "sceneId"].includes(path)) {
    requireOptionalId(value, label);
    return;
  }
  if (["style.fill", "style.stroke"].includes(path)) {
    requirePaint(value, label);
    return;
  }
  if (path === "text.align") {
    requireOneOf(value, new Set(["start", "middle", "end"]), label);
    return;
  }
  if (path === "blendMode") {
    requireDisplayString(value, label, 40);
    return;
  }
  requireFiniteNumber(value, label, numericRangeForPath(path));
}

function validateKeyframeValue(property, value, label) {
  if (PAINT_PROPERTIES.has(property)) {
    requirePaint(value, label);
    return;
  }
  requireFiniteNumber(value, label, numericRangeForPath(property));
}

function numericRangeForPath(path) {
  if (path === "opacity") return { min: 0, max: 1 };
  if (path === "effects.blur" || path === "blur") return { min: 0, max: 1000 };
  if (path === "style.strokeWidth" || path === "strokeWidth") return { min: 0, max: 10000 };
  if (path === "text.size" || path === "text.weight") return { min: 1, max: 1000 };
  if (path.startsWith("shape.")) return { min: 0, max: 10000 };
  return { min: -100000, max: 100000 };
}

function requireLayer(document, layerId, label) {
  if (!document) return null;
  const target = findLayer(document, layerId);
  if (!target) throw new Error(`${label} target layer does not exist.`);
  return target;
}

function requireLayerId(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) throw new Error(`${label} must be a layer id.`);
}

function requireOptionalId(value, label) {
  if (value == null || value === "") return;
  requireLayerId(value, label);
}

function requireOneOf(value, allowed, label) {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(`${label} is not supported.`);
}

function requireFiniteNumber(value, label, range = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  if (range.min != null && value < range.min) throw new Error(`${label} is out of range.`);
  if (range.max != null && value > range.max) throw new Error(`${label} is out of range.`);
}

function requireInteger(value, label, range = {}) {
  requireFiniteNumber(value, label, range);
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
}

function requirePaint(value, label) {
  if (value === "transparent") return;
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return;
  throw new Error(`${label} must be #rrggbb or transparent.`);
}

function requireDisplayString(value, label, maxLength) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  if (value.length < 1 || value.length > maxLength) throw new Error(`${label} has an invalid length.`);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} contains unsupported control characters.`);
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
