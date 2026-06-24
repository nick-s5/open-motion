export const DEFAULT_FPS = 60;

export const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  spring: (t) => {
    const decay = Math.pow(2, -8 * t);
    return 1 - decay * Math.cos(t * Math.PI * 5);
  }
};

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function createDemoDocument() {
  const sceneId = uid("scene");
  const nestedSceneId = uid("scene");
  const markId = uid("layer");
  const orbitId = uid("layer");
  const maskId = uid("layer");
  const textId = uid("layer");
  const precompId = uid("layer");

  return {
    version: 1,
    name: "Open Motion Alpha",
    activeSceneId: sceneId,
    createdAt: new Date().toISOString(),
    scenes: [
      {
        id: sceneId,
        name: "Logo reveal",
        width: 1280,
        height: 720,
        duration: 4,
        fps: DEFAULT_FPS,
        background: "#f6f4ef",
        layers: [
          {
            id: orbitId,
            type: "ellipse",
            name: "orbit ring",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            shape: { rx: 170, ry: 170 },
            style: { fill: "transparent", stroke: "#275d5f", strokeWidth: 8 },
            effects: { blur: 0, shadow: false },
            keyframes: {
              x: [{ time: 0, value: 640 }, { time: 4, value: 640 }],
              y: [{ time: 0, value: 360 }, { time: 4, value: 360 }],
              scaleX: [{ time: 0, value: 0.68, ease: "easeOut" }, { time: 1.1, value: 1 }],
              scaleY: [{ time: 0, value: 0.68, ease: "easeOut" }, { time: 1.1, value: 1 }],
              rotation: [{ time: 0, value: -40 }, { time: 4, value: 38 }],
              opacity: [{ time: 0, value: 0 }, { time: 0.35, value: 1 }]
            }
          },
          {
            id: markId,
            type: "rect",
            name: "motion tile",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            shape: { width: 210, height: 210, radius: 34 },
            style: { fill: "#e54d2e", stroke: "#1d1c1a", strokeWidth: 5 },
            effects: { blur: 0, shadow: true },
            keyframes: {
              x: [{ time: 0, value: 440, ease: "spring" }, { time: 1.1, value: 640 }],
              y: [{ time: 0, value: 360 }, { time: 1.1, value: 360 }],
              scaleX: [{ time: 0, value: 0.42, ease: "spring" }, { time: 1.1, value: 1 }],
              scaleY: [{ time: 0, value: 0.42, ease: "spring" }, { time: 1.1, value: 1 }],
              rotation: [{ time: 0, value: -18 }, { time: 1.1, value: 0 }, { time: 4, value: 6 }],
              opacity: [{ time: 0, value: 0 }, { time: 0.22, value: 1 }]
            }
          },
          {
            id: maskId,
            type: "rect",
            name: "wordmark matte",
            visible: true,
            locked: false,
            isMask: true,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            shape: { width: 680, height: 98, radius: 8 },
            style: { fill: "#111111", stroke: "transparent", strokeWidth: 0 },
            effects: { blur: 0, shadow: false },
            keyframes: {
              x: [{ time: 0, value: 250, ease: "easeOut" }, { time: 1.35, value: 640 }],
              y: [{ time: 0, value: 595 }, { time: 4, value: 595 }],
              scaleX: [{ time: 0, value: 0.2, ease: "easeOut" }, { time: 1.35, value: 1 }],
              scaleY: [{ time: 0, value: 1 }],
              rotation: [{ time: 0, value: 0 }],
              opacity: [{ time: 0, value: 1 }]
            }
          },
          {
            id: textId,
            type: "text",
            name: "wordmark",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId,
            text: { value: "OPEN MOTION", size: 72, weight: 800, align: "middle" },
            style: { fill: "#1d1c1a", stroke: "transparent", strokeWidth: 0 },
            effects: { blur: 0, shadow: false },
            keyframes: {
              x: [{ time: 0, value: 640 }, { time: 4, value: 640 }],
              y: [{ time: 0, value: 618, ease: "easeOut" }, { time: 1.2, value: 595 }],
              scaleX: [{ time: 0, value: 1 }, { time: 4, value: 1 }],
              scaleY: [{ time: 0, value: 1 }, { time: 4, value: 1 }],
              rotation: [{ time: 0, value: 0 }, { time: 4, value: 0 }],
              opacity: [{ time: 0, value: 0 }, { time: 0.72, value: 0 }, { time: 1.3, value: 1 }]
            }
          },
          {
            id: precompId,
            type: "precomp",
            name: "nested UI badge",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            sceneId: nestedSceneId,
            shape: { width: 270, height: 154 },
            style: { fill: "transparent", stroke: "transparent", strokeWidth: 0 },
            effects: { blur: 0, shadow: true },
            keyframes: {
              x: [{ time: 0, value: 1030 }, { time: 4, value: 1030 }],
              y: [{ time: 0, value: 168, ease: "easeOut" }, { time: 1.6, value: 148 }],
              scaleX: [{ time: 0, value: 0.82 }, { time: 1.6, value: 1 }],
              scaleY: [{ time: 0, value: 0.82 }, { time: 1.6, value: 1 }],
              rotation: [{ time: 0, value: 2 }, { time: 4, value: -2 }],
              opacity: [{ time: 0, value: 0 }, { time: 1.1, value: 0 }, { time: 1.6, value: 1 }]
            }
          }
        ],
        exposedProperties: []
      },
      {
        id: nestedSceneId,
        name: "Button microinteraction",
        width: 420,
        height: 240,
        duration: 2,
        fps: DEFAULT_FPS,
        background: "#ffffff",
        layers: [
          {
            id: uid("layer"),
            type: "rect",
            name: "button card",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            shape: { width: 300, height: 116, radius: 26 },
            style: { fill: "#275d5f", stroke: "#1d1c1a", strokeWidth: 4 },
            effects: { blur: 0, shadow: true },
            keyframes: {
              x: [{ time: 0, value: 210 }],
              y: [{ time: 0, value: 122 }],
              scaleX: [{ time: 0, value: 0.9, ease: "spring" }, { time: 0.65, value: 1 }],
              scaleY: [{ time: 0, value: 0.9, ease: "spring" }, { time: 0.65, value: 1 }],
              rotation: [{ time: 0, value: 0 }],
              opacity: [{ time: 0, value: 0 }, { time: 0.25, value: 1 }]
            }
          },
          {
            id: uid("layer"),
            type: "text",
            name: "button label",
            visible: true,
            locked: false,
            blendMode: "normal",
            parentId: null,
            maskId: null,
            text: { value: "Preview", size: 42, weight: 760, align: "middle" },
            style: { fill: "#ffffff", stroke: "transparent", strokeWidth: 0 },
            effects: { blur: 0, shadow: false },
            keyframes: {
              x: [{ time: 0, value: 210 }],
              y: [{ time: 0, value: 124 }],
              scaleX: [{ time: 0, value: 1 }],
              scaleY: [{ time: 0, value: 1 }],
              rotation: [{ time: 0, value: 0 }],
              opacity: [{ time: 0, value: 0 }, { time: 0.4, value: 1 }]
            }
          }
        ],
        exposedProperties: [
          { id: uid("exposed"), name: "Label", path: "layers.button label.text.value", type: "text" }
        ]
      }
    ]
  };
}

export function createStarterDocument(kind = "logo") {
  if (kind === "social") return createSocialTitleDocument();
  if (kind === "micro") return createMicrointeractionDocument();
  return createDemoDocument();
}

function createSocialTitleDocument() {
  const sceneId = uid("scene");
  const document = createDemoDocument();
  const scene = {
    id: sceneId,
    name: "Social title card",
    width: 1080,
    height: 1920,
    duration: 5,
    fps: DEFAULT_FPS,
    background: "#f6f4ef",
    layers: [
      {
        ...layerDefaults("rect", { width: 1080, height: 1920 }),
        name: "poster block",
        shape: { width: 780, height: 900, radius: 48 },
        style: { fill: "#2f80ed", stroke: "#1d1c1a", strokeWidth: 8 },
        keyframes: {
          x: [{ time: 0, value: 540 }],
          y: [{ time: 0, value: 980 }],
          scaleX: [{ time: 0, value: 0.72, ease: "spring" }, { time: 1.1, value: 1 }],
          scaleY: [{ time: 0, value: 0.72, ease: "spring" }, { time: 1.1, value: 1 }],
          rotation: [{ time: 0, value: -8, ease: "easeOut" }, { time: 1.1, value: 0 }],
          opacity: [{ time: 0, value: 0 }, { time: 0.35, value: 1 }]
        }
      },
      {
        ...layerDefaults("text", { width: 1080, height: 1920 }),
        name: "headline",
        text: { value: "MOTION\\nSYSTEMS", size: 132, weight: 850, align: "middle" },
        style: { fill: "#1d1c1a", stroke: "transparent", strokeWidth: 0 },
        keyframes: {
          x: [{ time: 0, value: 540 }],
          y: [{ time: 0, value: 920, ease: "easeOut" }, { time: 1.2, value: 860 }],
          scaleX: [{ time: 0, value: 1 }],
          scaleY: [{ time: 0, value: 1 }],
          rotation: [{ time: 0, value: 0 }],
          opacity: [{ time: 0, value: 0 }, { time: 0.7, value: 0 }, { time: 1.2, value: 1 }]
        }
      }
    ],
    exposedProperties: []
  };
  return { ...document, name: "Social Title Card", activeSceneId: sceneId, scenes: [scene] };
}

function createMicrointeractionDocument() {
  const document = createDemoDocument();
  const scene = document.scenes.find((candidate) => candidate.name === "Button microinteraction");
  return { ...document, name: "UI Microinteraction", activeSceneId: scene.id };
}

export function cloneDocument(document) {
  return structuredClone(document);
}

export function getActiveScene(document) {
  return document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0];
}

export function findLayer(document, layerId) {
  for (const scene of document.scenes) {
    const layer = scene.layers.find((candidate) => candidate.id === layerId);
    if (layer) return { scene, layer };
  }
  return null;
}

export function sortKeyframes(keyframes) {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

export function evaluateTrack(keyframes = [], time = 0, fallback = 0) {
  if (!keyframes.length) return fallback;
  const sorted = sortKeyframes(keyframes);
  if (time <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return last.value;

  const nextIndex = sorted.findIndex((frame) => frame.time >= time);
  const previous = sorted[nextIndex - 1];
  const next = sorted[nextIndex];
  const span = next.time - previous.time || 1;
  const rawT = Math.min(1, Math.max(0, (time - previous.time) / span));
  const easing = EASINGS[previous.ease ?? "linear"] ?? EASINGS.linear;
  const t = easing(rawT);

  if (typeof previous.value === "number" && typeof next.value === "number") {
    return previous.value + (next.value - previous.value) * t;
  }

  if (isHexColor(previous.value) && isHexColor(next.value)) {
    return mixColor(previous.value, next.value, t);
  }

  return rawT < 1 ? previous.value : next.value;
}

export function evaluateLayer(layer, time) {
  const k = layer.keyframes ?? {};
  return {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
    blendMode: layer.blendMode ?? "normal",
    maskId: layer.maskId ?? null,
    x: evaluateTrack(k.x, time, 0),
    y: evaluateTrack(k.y, time, 0),
    scaleX: evaluateTrack(k.scaleX, time, 1),
    scaleY: evaluateTrack(k.scaleY, time, 1),
    rotation: evaluateTrack(k.rotation, time, 0),
    opacity: evaluateTrack(k.opacity, time, 1),
    fill: evaluateTrack(k.fill, time, layer.style?.fill ?? "#222222"),
    stroke: evaluateTrack(k.stroke, time, layer.style?.stroke ?? "transparent"),
    strokeWidth: evaluateTrack(k.strokeWidth, time, layer.style?.strokeWidth ?? 0),
    blur: evaluateTrack(k.blur, time, layer.effects?.blur ?? 0),
    raw: layer
  };
}

export function evaluateScene(scene, time) {
  const clamped = Math.min(scene.duration, Math.max(0, time));
  return {
    ...scene,
    time: clamped,
    layers: scene.layers.map((layer) => evaluateLayer(layer, clamped))
  };
}

export function setOrInsertKeyframe(layer, property, time, value, ease = "linear") {
  layer.keyframes ??= {};
  const track = sortKeyframes(layer.keyframes[property] ?? []);
  const existing = track.find((frame) => Math.abs(frame.time - time) < 0.0001);
  if (existing) {
    existing.value = value;
    existing.ease = ease;
  } else {
    track.push({ time, value, ease });
  }
  layer.keyframes[property] = sortKeyframes(track);
}

export function layerDefaults(type, scene) {
  const common = {
    id: uid("layer"),
    type,
    name: `${type} layer`,
    visible: true,
    locked: false,
    blendMode: "normal",
    parentId: null,
    maskId: null,
    style: { fill: "#2f80ed", stroke: "#1d1c1a", strokeWidth: 3 },
    effects: { blur: 0, shadow: false },
    keyframes: {
      x: [{ time: 0, value: scene.width / 2 }],
      y: [{ time: 0, value: scene.height / 2 }],
      scaleX: [{ time: 0, value: 1 }],
      scaleY: [{ time: 0, value: 1 }],
      rotation: [{ time: 0, value: 0 }],
      opacity: [{ time: 0, value: 1 }]
    }
  };

  if (type === "rect") return { ...common, name: "rectangle", shape: { width: 180, height: 120, radius: 18 } };
  if (type === "ellipse") return { ...common, name: "ellipse", shape: { rx: 92, ry: 64 } };
  if (type === "text") {
    return {
      ...common,
      name: "text",
      text: { value: "New text", size: 58, weight: 760, align: "middle" },
      style: { fill: "#1d1c1a", stroke: "transparent", strokeWidth: 0 }
    };
  }
  if (type === "precomp") {
    return {
      ...common,
      name: "scene instance",
      sceneId: null,
      shape: { width: 320, height: 180 },
      style: { fill: "transparent", stroke: "transparent", strokeWidth: 0 }
    };
  }
  return { ...common, name: "path", path: { d: "M -90 50 C -20 -80 40 -80 90 50 Z" } };
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function mixColor(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: Math.round(ca.r + (cb.r - ca.r) * t),
    g: Math.round(ca.g + (cb.g - ca.g) * t),
    b: Math.round(ca.b + (cb.b - ca.b) * t)
  });
}

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
