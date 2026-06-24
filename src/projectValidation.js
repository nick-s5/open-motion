const DEFAULT_FPS = 60;
const MAX_SCENES = 100;
const MAX_LAYERS_PER_SCENE = 500;
const MAX_KEYFRAMES_PER_TRACK = 1000;
const MAX_TEXT_LENGTH = 2000;
const MAX_NAME_LENGTH = 120;
const MAX_ID_LENGTH = 80;
const MAX_PATH_LENGTH = 5000;
const MAX_EXPOSED_PROPERTIES = 100;

const ALLOWED_LAYER_TYPES = new Set(["rect", "ellipse", "text", "precomp", "path"]);
const ALLOWED_EASINGS = new Set(["linear", "easeIn", "easeOut", "easeInOut", "spring"]);
const ALLOWED_BLEND_MODES = new Set([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity"
]);
const ALLOWED_TEXT_ALIGN = new Set(["start", "middle", "end"]);
const NUMERIC_TRACKS = new Set(["x", "y", "scaleX", "scaleY", "rotation", "opacity", "strokeWidth", "blur"]);
const PAINT_TRACKS = new Set(["fill", "stroke"]);
const EXPOSED_TYPES = new Set(["text", "number", "color", "boolean"]);

export function validateProjectDocument(input) {
  const source = requireObject(input, "Project");
  const scenesInput = requireArray(source.scenes, "Project scenes");
  if (!scenesInput.length) fail("Project must contain scenes.");
  if (scenesInput.length > MAX_SCENES) fail("Project has too many scenes.");

  const scenes = scenesInput.map((scene, index) => validateScene(scene, index));
  const sceneIds = new Set();
  for (const scene of scenes) {
    if (sceneIds.has(scene.id)) fail(`Duplicate scene id: ${scene.id}.`);
    sceneIds.add(scene.id);
  }

  const activeSceneId = requireId(source.activeSceneId, "Project activeSceneId");
  if (!sceneIds.has(activeSceneId)) fail("The active scene does not exist.");

  for (const scene of scenes) validateLayerReferences(scene, sceneIds);
  validatePrecompGraph(scenes);

  return {
    version: source.version == null ? 1 : requireFiniteNumber(source.version, "Project version", { min: 1, max: 999 }),
    name: source.name == null ? "Imported Project" : requireDisplayString(source.name, "Project name", MAX_NAME_LENGTH),
    activeSceneId,
    createdAt: source.createdAt == null ? new Date().toISOString() : requireDisplayString(source.createdAt, "Project createdAt", 80),
    scenes
  };
}

function validateScene(input, index) {
  const scene = requireObject(input, `Scene ${index + 1}`);
  const width = requireFiniteNumber(scene.width, `Scene ${index + 1} width`, { min: 1, max: 10000 });
  const height = requireFiniteNumber(scene.height, `Scene ${index + 1} height`, { min: 1, max: 10000 });
  const layersInput = requireArray(scene.layers, `Scene ${index + 1} layers`);
  if (layersInput.length > MAX_LAYERS_PER_SCENE) fail(`Scene ${index + 1} has too many layers.`);

  const normalized = {
    id: requireId(scene.id, `Scene ${index + 1} id`),
    name: requireDisplayString(scene.name, `Scene ${index + 1} name`, MAX_NAME_LENGTH),
    width,
    height,
    duration: requireFiniteNumber(scene.duration, `Scene ${index + 1} duration`, { min: 0.001, max: 3600 }),
    fps: scene.fps == null ? DEFAULT_FPS : requireFiniteNumber(scene.fps, `Scene ${index + 1} fps`, { min: 1, max: 240 }),
    background: requirePaint(scene.background, `Scene ${index + 1} background`),
    layers: [],
    exposedProperties: validateExposedProperties(scene.exposedProperties, `Scene ${index + 1} exposedProperties`)
  };

  const layerIds = new Set();
  normalized.layers = layersInput.map((layer, layerIndex) => {
    const normalizedLayer = validateLayer(layer, normalized, layerIndex);
    if (layerIds.has(normalizedLayer.id)) fail(`Duplicate layer id: ${normalizedLayer.id}.`);
    layerIds.add(normalizedLayer.id);
    return normalizedLayer;
  });

  return normalized;
}

function validateLayer(input, scene, index) {
  const label = `Layer ${index + 1} in ${scene.name}`;
  const layer = requireObject(input, label);
  const type = requireToken(layer.type, `${label} type`);
  if (!ALLOWED_LAYER_TYPES.has(type)) fail(`${label} has an unsupported type.`);

  const normalized = {
    id: requireId(layer.id, `${label} id`),
    type,
    name: requireDisplayString(layer.name, `${label} name`, MAX_NAME_LENGTH),
    visible: optionalBoolean(layer.visible, true, `${label} visible`),
    locked: optionalBoolean(layer.locked, false, `${label} locked`),
    blendMode: layer.blendMode == null ? "normal" : requireOneOf(layer.blendMode, ALLOWED_BLEND_MODES, `${label} blendMode`),
    parentId: optionalId(layer.parentId, `${label} parentId`),
    maskId: optionalId(layer.maskId, `${label} maskId`)
  };

  if (layer.isMask != null) normalized.isMask = optionalBoolean(layer.isMask, false, `${label} isMask`);

  if (type === "rect") normalized.shape = validateRectShape(layer.shape, label);
  if (type === "ellipse") normalized.shape = validateEllipseShape(layer.shape, label);
  if (type === "text") normalized.text = validateText(layer.text, label);
  if (type === "precomp") {
    normalized.sceneId = optionalId(layer.sceneId, `${label} sceneId`);
    normalized.shape = validatePrecompShape(layer.shape, label);
  }
  if (type === "path") normalized.path = validatePath(layer.path, label);

  normalized.style = validateStyle(layer.style, type, label);
  normalized.effects = validateEffects(layer.effects, label);
  normalized.keyframes = validateKeyframes(layer.keyframes, scene, normalized, label);

  return normalized;
}

function validateRectShape(input, label) {
  const shape = requireObject(input, `${label} shape`);
  return {
    width: requireFiniteNumber(shape.width, `${label} shape.width`, { min: 0.001, max: 10000 }),
    height: requireFiniteNumber(shape.height, `${label} shape.height`, { min: 0.001, max: 10000 }),
    radius: shape.radius == null ? 0 : requireFiniteNumber(shape.radius, `${label} shape.radius`, { min: 0, max: 10000 })
  };
}

function validateEllipseShape(input, label) {
  const shape = requireObject(input, `${label} shape`);
  return {
    rx: requireFiniteNumber(shape.rx, `${label} shape.rx`, { min: 0.001, max: 10000 }),
    ry: requireFiniteNumber(shape.ry, `${label} shape.ry`, { min: 0.001, max: 10000 })
  };
}

function validatePrecompShape(input, label) {
  const shape = input == null ? {} : requireObject(input, `${label} shape`);
  return {
    width: shape.width == null ? 320 : requireFiniteNumber(shape.width, `${label} shape.width`, { min: 0.001, max: 10000 }),
    height: shape.height == null ? 180 : requireFiniteNumber(shape.height, `${label} shape.height`, { min: 0.001, max: 10000 })
  };
}

function validatePath(input, label) {
  const path = requireObject(input, `${label} path`);
  const d = requireDisplayString(path.d, `${label} path.d`, MAX_PATH_LENGTH);
  if (!/^[MmZzLlHhVvCcSsQqTtAa0-9,.\-+\s]+$/.test(d)) fail(`${label} path.d contains unsafe path data.`);
  return { d };
}

function validateText(input, label) {
  const text = requireObject(input, `${label} text`);
  return {
    value: requireDisplayString(text.value, `${label} text.value`, MAX_TEXT_LENGTH, { multiline: true }),
    size: text.size == null ? 58 : requireFiniteNumber(text.size, `${label} text.size`, { min: 1, max: 1000 }),
    weight: text.weight == null ? 760 : requireFiniteNumber(text.weight, `${label} text.weight`, { min: 1, max: 1000 }),
    align: text.align == null ? "middle" : requireOneOf(text.align, ALLOWED_TEXT_ALIGN, `${label} text.align`)
  };
}

function validateStyle(input, type, label) {
  const defaults = defaultStyle(type);
  const style = input == null ? {} : requireObject(input, `${label} style`);
  return {
    fill: style.fill == null ? defaults.fill : requirePaint(style.fill, `${label} style.fill`),
    stroke: style.stroke == null ? defaults.stroke : requirePaint(style.stroke, `${label} style.stroke`),
    strokeWidth: style.strokeWidth == null
      ? defaults.strokeWidth
      : requireFiniteNumber(style.strokeWidth, `${label} style.strokeWidth`, { min: 0, max: 10000 })
  };
}

function validateEffects(input, label) {
  const effects = input == null ? {} : requireObject(input, `${label} effects`);
  return {
    blur: effects.blur == null ? 0 : requireFiniteNumber(effects.blur, `${label} effects.blur`, { min: 0, max: 1000 }),
    shadow: optionalBoolean(effects.shadow, false, `${label} effects.shadow`)
  };
}

function validateKeyframes(input, scene, layer, label) {
  const keyframes = input == null ? {} : requireObject(input, `${label} keyframes`);
  const normalized = {};
  const allowedTracks = new Set([...NUMERIC_TRACKS, ...PAINT_TRACKS]);

  for (const [property, frames] of Object.entries(keyframes)) {
    if (!allowedTracks.has(property)) fail(`${label} keyframes.${property} is not supported.`);
    normalized[property] = validateTrack(frames, property, scene.duration, `${label} keyframes.${property}`);
  }

  const defaults = defaultKeyframes(scene, layer);
  for (const [property, frames] of Object.entries(defaults)) {
    if (!normalized[property]) normalized[property] = frames;
  }

  return normalized;
}

function validateTrack(input, property, duration, label) {
  const frames = requireArray(input, label);
  if (frames.length > MAX_KEYFRAMES_PER_TRACK) fail(`${label} has too many keyframes.`);

  const times = new Set();
  const normalized = frames.map((inputFrame, index) => {
    const frame = requireObject(inputFrame, `${label}[${index}]`);
    const time = requireFiniteNumber(frame.time, `${label}[${index}].time`, { min: 0, max: duration });
    const key = String(time);
    if (times.has(key)) fail(`${label} has duplicate keyframe times.`);
    times.add(key);

    return {
      time,
      value: validateKeyframeValue(frame.value, property, `${label}[${index}].value`),
      ease: frame.ease == null ? "linear" : requireOneOf(frame.ease, ALLOWED_EASINGS, `${label}[${index}].ease`)
    };
  });

  return normalized.sort((a, b) => a.time - b.time);
}

function validateKeyframeValue(value, property, label) {
  if (PAINT_TRACKS.has(property)) return requirePaint(value, label);

  const ranges = {
    opacity: { min: 0, max: 1 },
    blur: { min: 0, max: 1000 },
    strokeWidth: { min: 0, max: 10000 }
  };
  return requireFiniteNumber(value, label, ranges[property] ?? { min: -100000, max: 100000 });
}

function validateLayerReferences(scene, sceneIds) {
  const layerById = new Map(scene.layers.map((layer) => [layer.id, layer]));

  for (const layer of scene.layers) {
    if (layer.parentId != null) {
      const parent = layerById.get(layer.parentId);
      if (!parent) fail(`${layer.name} parentId does not exist.`);
      if (parent.id === layer.id) fail(`${layer.name} cannot parent itself.`);
    }

    if (layer.maskId != null) {
      const mask = layerById.get(layer.maskId);
      if (!mask) fail(`${layer.name} maskId does not exist.`);
      if (!mask.isMask) fail(`${layer.name} maskId must reference a mask layer.`);
      if (mask.id === layer.id) fail(`${layer.name} cannot mask itself.`);
    }

    if (layer.type === "precomp") {
      if (layer.sceneId == null) fail(`${layer.name} must reference a scene.`);
      if (!sceneIds.has(layer.sceneId)) fail(`${layer.name} sceneId does not exist.`);
      if (layer.sceneId === scene.id) fail(`${layer.name} cannot reference its own scene.`);
    }
  }
}

function validatePrecompGraph(scenes) {
  const graph = new Map(scenes.map((scene) => [
    scene.id,
    scene.layers.filter((layer) => layer.type === "precomp").map((layer) => layer.sceneId)
  ]));
  const visiting = new Set();
  const visited = new Set();

  function visit(sceneId) {
    if (visiting.has(sceneId)) fail("Precomp scene references cannot form a cycle.");
    if (visited.has(sceneId)) return;
    visiting.add(sceneId);
    for (const nextId of graph.get(sceneId) ?? []) visit(nextId);
    visiting.delete(sceneId);
    visited.add(sceneId);
  }

  for (const scene of scenes) visit(scene.id);
}

function validateExposedProperties(input, label) {
  if (input == null) return [];
  const properties = requireArray(input, label);
  if (properties.length > MAX_EXPOSED_PROPERTIES) fail(`${label} has too many entries.`);

  return properties.map((entry, index) => {
    const property = requireObject(entry, `${label}[${index}]`);
    return {
      id: requireId(property.id, `${label}[${index}].id`),
      name: requireDisplayString(property.name, `${label}[${index}].name`, MAX_NAME_LENGTH),
      path: requirePathToken(property.path, `${label}[${index}].path`),
      type: requireOneOf(property.type, EXPOSED_TYPES, `${label}[${index}].type`)
    };
  });
}

function defaultStyle(type) {
  if (type === "text") return { fill: "#1d1c1a", stroke: "transparent", strokeWidth: 0 };
  if (type === "precomp") return { fill: "transparent", stroke: "transparent", strokeWidth: 0 };
  return { fill: "#2f80ed", stroke: "#1d1c1a", strokeWidth: 3 };
}

function defaultKeyframes(scene, layer) {
  return {
    x: [{ time: 0, value: scene.width / 2, ease: "linear" }],
    y: [{ time: 0, value: scene.height / 2, ease: "linear" }],
    scaleX: [{ time: 0, value: 1, ease: "linear" }],
    scaleY: [{ time: 0, value: 1, ease: "linear" }],
    rotation: [{ time: 0, value: 0, ease: "linear" }],
    opacity: [{ time: 0, value: layer.visible === false ? 0 : 1, ease: "linear" }]
  };
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${label} must be a plain object.`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  return value;
}

function requireFiniteNumber(value, label, range = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be a finite number.`);
  if (range.min != null && value < range.min) fail(`${label} is out of range.`);
  if (range.max != null && value > range.max) fail(`${label} is out of range.`);
  return value;
}

function optionalBoolean(value, fallback, label) {
  if (value == null) return fallback;
  if (typeof value !== "boolean") fail(`${label} must be true or false.`);
  return value;
}

function requireId(value, label) {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  if (value.length < 1 || value.length > MAX_ID_LENGTH) fail(`${label} has an invalid length.`);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) fail(`${label} contains unsafe characters.`);
  return value;
}

function optionalId(value, label) {
  if (value == null || value === "") return null;
  return requireId(value, label);
}

function requireToken(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) fail(`${label} is invalid.`);
  return value;
}

function requireOneOf(value, allowed, label) {
  if (typeof value !== "string" || !allowed.has(value)) fail(`${label} is not supported.`);
  return value;
}

function requirePaint(value, label) {
  if (value === "transparent") return value;
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  fail(`${label} must be #rrggbb or transparent.`);
}

function requireDisplayString(value, label, maxLength, options = {}) {
  if (typeof value !== "string") fail(`${label} must be a string.`);
  if (value.length < 1 || value.length > maxLength) fail(`${label} has an invalid length.`);
  const pattern = options.multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (pattern.test(value)) fail(`${label} contains unsupported control characters.`);
  return value;
}

function requirePathToken(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240) fail(`${label} has an invalid length.`);
  if (!/^[A-Za-z0-9_. -]+$/.test(value)) fail(`${label} contains unsafe characters.`);
  return value;
}

function fail(message) {
  throw new Error(message);
}
