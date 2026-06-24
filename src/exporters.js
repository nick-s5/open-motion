import { evaluateScene, evaluateTrack, getActiveScene } from "./model.js";

export function exportProjectJson(document) {
  return JSON.stringify(document, null, 2);
}

export function exportSvgSnapshot(document, time) {
  const scene = evaluateScene(getActiveScene(document), time);
  const masks = scene.layers.filter((layer) => layer.raw.isMask).map((layer) => renderClipPath(layer)).join("\n    ");
  const body = scene.layers.filter((layer) => layer.visible && !layer.raw.isMask).map((layer) => renderLayerSvg(layer, document, time)).join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">
  <defs>
    ${masks}
  </defs>
  <rect width="100%" height="100%" fill="${scene.background}" />
  ${body}
</svg>`;
}

export function exportLottieSubset(document) {
  const scene = getActiveScene(document);
  const warnings = getCompatibilityWarnings(document);
  const exportableLayers = scene.layers.filter((layer) => !layer.isMask && layer.type !== "precomp");
  const layers = exportableLayers.map((layer, index) => ({
    ddd: 0,
    ind: index + 1,
    ty: lottieLayerType(layer),
    nm: layer.name,
    sr: 1,
    ks: {
      o: lottieAnimatedNumber(layer.keyframes?.opacity, scene.fps, 100, 1),
      p: lottieAnimatedPoint(layer.keyframes?.x, layer.keyframes?.y, scene.fps),
      s: lottieAnimatedScale(layer.keyframes?.scaleX, layer.keyframes?.scaleY, scene.fps),
      r: lottieAnimatedNumber(layer.keyframes?.rotation, scene.fps, 1, 0)
    },
    shapes: layer.type === "text" ? undefined : [lottieShape(layer)],
    t: layer.type === "text" ? lottieText(layer) : undefined,
    ip: 0,
    op: scene.duration * scene.fps,
    st: 0,
    bm: 0
  }));

  return {
    warnings,
    json: JSON.stringify({
      v: "5.12.0",
      fr: scene.fps,
      ip: 0,
      op: scene.duration * scene.fps,
      w: scene.width,
      h: scene.height,
      nm: document.name,
      ddd: 0,
      assets: [],
      layers
    }, null, 2)
  };
}

export function getCompatibilityWarnings(document) {
  const warnings = [];
  for (const scene of document.scenes) {
    for (const layer of scene.layers) {
      if (layer.blendMode && layer.blendMode !== "normal") warnings.push(`${layer.name}: blend mode may not survive Lottie export.`);
      if (layer.maskId) warnings.push(`${layer.name}: masks are not exported in the alpha Lottie subset.`);
      if (layer.isMask) warnings.push(`${layer.name}: mask utility layers are SVG/project-only in the alpha.`);
      if (layer.type === "precomp") warnings.push(`${layer.name}: nested scenes are flattened only in SVG snapshots and are not in the alpha Lottie subset.`);
      if (layer.effects?.blur) warnings.push(`${layer.name}: blur is video/SVG-only in the alpha.`);
      if (layer.effects?.shadow) warnings.push(`${layer.name}: shadow is video/SVG-only in the alpha.`);
      if (layer.type === "path") warnings.push(`${layer.name}: path export is approximate in the alpha Lottie subset.`);
    }
  }
  return warnings;
}

function renderLayerSvg(layer, document, time) {
  const transform = `translate(${layer.x} ${layer.y}) rotate(${layer.rotation}) scale(${layer.scaleX} ${layer.scaleY})`;
  const clip = layer.raw.maskId ? ` clip-path="url(#clip-${layer.raw.maskId})"` : "";
  const common = `opacity="${layer.opacity}" transform="${transform}" fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}"${clip}`;
  const filter = layer.blur > 0 ? ` filter="blur(${layer.blur}px)"` : "";
  const raw = layer.raw;
  if (layer.type === "rect") {
    const { width, height, radius } = raw.shape;
    return `<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="${radius}" ${common}${filter} />`;
  }
  if (layer.type === "ellipse") {
    const { rx, ry } = raw.shape;
    return `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" ${common}${filter} />`;
  }
  if (layer.type === "text") {
    return `<text x="0" y="0" ${common}${filter} font-family="Inter, Arial, sans-serif" font-size="${raw.text.size}" font-weight="${raw.text.weight}" text-anchor="${raw.text.align}" dominant-baseline="middle">${renderTextSpans(raw.text.value)}</text>`;
  }
  if (layer.type === "precomp") {
    const nestedScene = document.scenes.find((scene) => scene.id === raw.sceneId);
    if (!nestedScene) return "";
    const nested = evaluateScene(nestedScene, time % nestedScene.duration);
    const sx = (raw.shape?.width ?? nested.width) / nested.width;
    const sy = (raw.shape?.height ?? nested.height) / nested.height;
    const content = nested.layers.filter((nestedLayer) => nestedLayer.visible && !nestedLayer.raw.isMask).map((nestedLayer) => renderLayerSvg(nestedLayer, document, time)).join("\n    ");
    return `<g ${common}${filter}><rect x="${-raw.shape.width / 2}" y="${-raw.shape.height / 2}" width="${raw.shape.width}" height="${raw.shape.height}" rx="18" fill="${nested.background}" stroke="#d7d1c6" stroke-width="2" /><g transform="translate(${-raw.shape.width / 2} ${-raw.shape.height / 2}) scale(${sx} ${sy})">${content}</g></g>`;
  }
  return `<path d="${raw.path?.d ?? ""}" ${common}${filter} />`;
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

function lottieLayerType(layer) {
  return layer.type === "text" ? 5 : 4;
}

function lottieShape(layer) {
  const shape = lottieShapeGeometry(layer);
  return {
    ty: "gr",
    it: [
      shape,
      lottieFill(layer.style?.fill),
      lottieStroke(layer.style?.stroke, layer.style?.strokeWidth),
      { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
    ],
    nm: layer.name
  };
}

function lottieShapeGeometry(layer) {
  if (layer.type === "rect") {
    return {
      ty: "rc",
      p: { a: 0, k: [0, 0] },
      s: { a: 0, k: [layer.shape.width, layer.shape.height] },
      r: { a: 0, k: layer.shape.radius },
      nm: layer.name
    };
  }
  if (layer.type === "ellipse") {
    return {
      ty: "el",
      p: { a: 0, k: [0, 0] },
      s: { a: 0, k: [layer.shape.rx * 2, layer.shape.ry * 2] },
      nm: layer.name
    };
  }
  return { ty: "sh", ks: { a: 0, k: { i: [], o: [], v: [], c: true } }, nm: layer.name };
}

function lottieText(layer) {
  return {
    d: {
      k: [
        {
          s: {
            t: layer.text.value,
            s: layer.text.size,
            f: "Inter",
            j: 2,
            tr: 0,
            lh: layer.text.size * 1.15,
            fc: hexToUnitRgb(layer.style.fill),
            sc: hexToUnitRgb(layer.style.stroke),
            sw: layer.style.stroke === "transparent" ? 0 : (layer.style.strokeWidth ?? 0)
          }
        }
      ]
    }
  };
}

function lottieFill(fill = "#000000") {
  return {
    ty: "fl",
    c: { a: 0, k: hexToUnitRgb(fill) },
    o: { a: 0, k: fill === "transparent" ? 0 : 100 },
    r: 1,
    nm: "Fill"
  };
}

function lottieStroke(stroke = "transparent", strokeWidth = 0) {
  return {
    ty: "st",
    c: { a: 0, k: hexToUnitRgb(stroke) },
    o: { a: 0, k: stroke === "transparent" || strokeWidth === 0 ? 0 : 100 },
    w: { a: 0, k: strokeWidth ?? 0 },
    lc: 2,
    lj: 2,
    nm: "Stroke"
  };
}

function lottieAnimatedNumber(track = [], fps = 60, scale = 1, defaultValue = 0) {
  if (track.length <= 1) return { a: 0, k: (track[0]?.value ?? defaultValue) * scale };
  return {
    a: 1,
    k: track.map((frame) => ({
      t: frame.time * fps,
      s: [frame.value * scale],
      i: { x: [0.667], y: [1] },
      o: { x: [0.333], y: [0] }
    }))
  };
}

function lottieAnimatedPoint(xTrack = [], yTrack = [], fps = 60) {
  const times = [...new Set([...xTrack, ...yTrack].map((frame) => frame.time))].sort((a, b) => a - b);
  if (times.length <= 1) {
    const time = times[0] ?? 0;
    return { a: 0, k: [evaluateTrack(xTrack, time, 0), evaluateTrack(yTrack, time, 0), 0] };
  }
  return {
    a: 1,
    k: times.map((time) => ({
      t: time * fps,
      s: [evaluateTrack(xTrack, time, 0), evaluateTrack(yTrack, time, 0), 0],
      i: { x: 0.667, y: 1 },
      o: { x: 0.333, y: 0 }
    }))
  };
}

function lottieAnimatedScale(xTrack = [], yTrack = [], fps = 60) {
  const times = [...new Set([...xTrack, ...yTrack].map((frame) => frame.time))].sort((a, b) => a - b);
  if (times.length <= 1) {
    const time = times[0] ?? 0;
    return { a: 0, k: [evaluateTrack(xTrack, time, 1) * 100, evaluateTrack(yTrack, time, 1) * 100, 100] };
  }
  return {
    a: 1,
    k: times.map((time) => ({
      t: time * fps,
      s: [evaluateTrack(xTrack, time, 1) * 100, evaluateTrack(yTrack, time, 1) * 100, 100],
      i: { x: 0.667, y: 1 },
      o: { x: 0.333, y: 0 }
    }))
  };
}

function hexToUnitRgb(hex = "#000000") {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [0, 0, 0];
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function escapeXml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  })[char]);
}

function renderTextSpans(value) {
  const lines = String(value).split("\\n");
  if (lines.length === 1) return escapeXml(value);
  const start = -((lines.length - 1) * 0.58);
  return lines.map((line, index) => `<tspan x="0" dy="${index === 0 ? `${start}em` : "1.16em"}">${escapeXml(line)}</tspan>`).join("");
}
