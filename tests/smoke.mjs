import assert from "node:assert/strict";
import { createDemoDocument, createStarterDocument, evaluateScene, getActiveScene } from "../src/model.js";
import { applyPatch } from "../src/patches.js";
import { exportLottieSubset, exportSvgSnapshot } from "../src/exporters.js";
import { runLocalAgent } from "../src/aiAgent.js";

const document = createDemoDocument();
const scene = getActiveScene(document);

assert.equal(scene.layers.length, 5);
assert.equal(evaluateScene(scene, 0.5).layers.length, 5);
assert.equal(scene.layers.some((layer) => layer.isMask), true);
assert.equal(scene.layers.some((layer) => layer.type === "precomp"), true);

const selected = scene.layers[0].id;
const patched = applyPatch(document, {
  title: "test patch",
  operations: [
    { type: "insertKeyframe", layerId: selected, property: "x", time: 2, value: 777, ease: "easeInOut" },
    { type: "applyPreset", layerId: selected, preset: "breathe", start: 0, duration: 4 }
  ]
});

const patchedScene = getActiveScene(patched);
assert.equal(patchedScene.layers[0].keyframes.x.some((frame) => frame.value === 777), true);

const svg = exportSvgSnapshot(patched, 1);
assert.match(svg, /<svg/);
assert.match(svg, /OPEN MOTION/);

const lottie = exportLottieSubset(patched);
let parsedLottie;
assert.doesNotThrow(() => {
  parsedLottie = JSON.parse(lottie.json);
});
assert.ok(Array.isArray(lottie.warnings));
assert.equal(lottie.warnings.some((warning) => warning.includes("nested scenes")), true);
assert.equal(parsedLottie.layers.some((layer) => layer.nm === "wordmark matte"), false);
assert.equal(parsedLottie.layers.some((layer) => layer.nm === "nested UI badge"), false);

const social = createStarterDocument("social");
assert.equal(getActiveScene(social).width, 1080);
assert.equal(getActiveScene(social).height, 1920);

const micro = createStarterDocument("micro");
assert.equal(getActiveScene(micro).name, "Button microinteraction");

const agentResult = runLocalAgent({
  mode: "edit",
  prompt: "make this bouncier",
  document,
  selectedLayerId: selected,
  time: 0
});
assert.equal(agentResult.kind, "patch");
assert.ok(agentResult.patch.operations.length > 0);

console.log("Smoke tests passed.");
