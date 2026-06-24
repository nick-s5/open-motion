import { describePatch } from "./patches.js";
import { getActiveScene } from "./model.js";

export function runLocalAgent({ mode, prompt, document, selectedLayerId, time }) {
  const scene = getActiveScene(document);
  const selected = scene.layers.find((layer) => layer.id === selectedLayerId) ?? scene.layers.at(-1);
  const normalized = `${mode} ${prompt}`.toLowerCase();

  if (mode === "explain") {
    return {
      kind: "explanation",
      title: "Timing read",
      message: explainScene(scene, selected),
      patch: null
    };
  }

  const patch = { title: "AI patch", operations: [] };

  if (mode === "draft" || normalized.includes("logo")) {
    patch.title = "Draft logo reveal";
    patch.operations.push(
      {
        type: "createLayer",
        layerType: "ellipse",
        layer: {
          name: "AI accent ring",
          shape: { rx: 230, ry: 230 },
          style: { fill: "transparent", stroke: "#2f80ed", strokeWidth: 10 },
          keyframes: {
            x: [{ time: 0, value: scene.width / 2 }],
            y: [{ time: 0, value: scene.height / 2 }],
            scaleX: [{ time: 0, value: 0.2, ease: "spring" }, { time: 1.25, value: 1 }],
            scaleY: [{ time: 0, value: 0.2, ease: "spring" }, { time: 1.25, value: 1 }],
            rotation: [{ time: 0, value: -30 }, { time: scene.duration, value: 42 }],
            opacity: [{ time: 0, value: 0 }, { time: 0.25, value: 1 }, { time: 2.8, value: 0.2 }]
          }
        }
      },
      {
        type: "createLayer",
        layerType: "text",
        layer: {
          name: "AI tagline",
          text: { value: "AI-native motion", size: 36, weight: 650, align: "middle" },
          style: { fill: "#275d5f", stroke: "transparent", strokeWidth: 0 },
          keyframes: {
            x: [{ time: 0, value: scene.width / 2 }],
            y: [{ time: 0, value: scene.height - 74, ease: "easeOut" }, { time: 1.4, value: scene.height - 94 }],
            scaleX: [{ time: 0, value: 1 }],
            scaleY: [{ time: 0, value: 1 }],
            rotation: [{ time: 0, value: 0 }],
            opacity: [{ time: 0, value: 0 }, { time: 1.1, value: 0 }, { time: 1.7, value: 1 }]
          }
        }
      }
    );
  } else if (selected && (normalized.includes("bounce") || normalized.includes("bouncy") || normalized.includes("pop"))) {
    patch.title = "Make selected layer bouncier";
    patch.operations.push({ type: "applyPreset", layerId: selected.id, preset: "popReveal", start: Math.max(0, time - 0.2), duration: 0.9 });
  } else if (selected && normalized.includes("stagger")) {
    patch.title = "Stagger visible layers";
    scene.layers.filter((layer) => layer.visible).forEach((layer, index) => {
      patch.operations.push({ type: "applyPreset", layerId: layer.id, preset: "slideUp", start: index * 0.12, duration: 0.75 });
    });
  } else if (selected && normalized.includes("loop")) {
    patch.title = "Add subtle loop motion";
    patch.operations.push({ type: "applyPreset", layerId: selected.id, preset: "breathe", start: 0, duration: scene.duration });
  } else if (selected) {
    patch.title = "Refine selected timing";
    patch.operations.push(
      { type: "setInterpolation", layerId: selected.id, property: "x", time: 0, ease: "easeInOut" },
      { type: "setInterpolation", layerId: selected.id, property: "y", time: 0, ease: "easeInOut" },
      { type: "insertKeyframe", layerId: selected.id, property: "opacity", time: Math.min(scene.duration, time + 0.5), value: 1, ease: "easeOut" }
    );
  }

  return {
    kind: "patch",
    title: patch.title,
    message: describePatch(patch).join("\n"),
    patch
  };
}

function explainScene(scene, selected) {
  const layerCount = scene.layers.length;
  const selectedName = selected ? selected.name : "nothing";
  const denseTracks = scene.layers.filter((layer) => Object.values(layer.keyframes ?? {}).some((track) => track.length > 2)).length;
  return [
    `${scene.name} is ${scene.duration}s at ${scene.fps}fps with ${layerCount} layers.`,
    `The current selection is ${selectedName}.`,
    denseTracks
      ? `${denseTracks} layer(s) already have multi-keyframe timing, so easing consistency matters.`
      : "The motion is simple enough that a stronger reveal or stagger would be a good next edit.",
    "For a more polished logo reveal, keep the first second decisive, then reserve later motion for subtle secondary movement."
  ].join("\n");
}
