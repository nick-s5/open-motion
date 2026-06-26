import assert from "node:assert/strict";
import { createDemoDocument, createStarterDocument, evaluateScene, getActiveScene } from "../src/model.js";
import { applyPatch, validatePatch } from "../src/patches.js";
import { exportLottieSubset, exportSvgSnapshot } from "../src/exporters.js";
import { runLocalAgent } from "../src/aiAgent.js";
import { validateProjectDocument } from "../src/projectValidation.js";

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

assert.throws(() => validatePatch({
  operations: [{ type: "insertKeyframe", layerId: selected, property: "opacity", time: 2, value: 2 }]
}, document), /out of range/);
assert.throws(() => validatePatch({
  operations: [{ type: "deleteLayer", layerId: "missing_layer" }]
}, document), /target layer does not exist/);

const withDeletedKey = applyPatch(patched, {
  title: "delete key at playhead",
  operations: [{ type: "deleteKeyframesAtTime", layerId: selected, time: 2, properties: ["x"] }]
});
assert.equal(getActiveScene(withDeletedKey).layers[0].keyframes.x.some((frame) => frame.time === 2), false);

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
assert.equal(parsedLottie.layers[0].ks.o.k[1].t, scene.layers[0].keyframes.opacity[1].time * scene.fps);
assert.equal(parsedLottie.layers[0].ks.p.k[1].s[1], 360);
assert.equal(parsedLottie.layers.some((layer) => layer.shapes?.some((shape) => shape.ty === "gr" && shape.it?.some((item) => item.ty === "fl"))), true);

const social = createStarterDocument("social");
assert.equal(getActiveScene(social).width, 1080);
assert.equal(getActiveScene(social).height, 1920);

const micro = createStarterDocument("micro");
assert.equal(getActiveScene(micro).name, "Button microinteraction");

const imported = validateProjectDocument(JSON.parse(JSON.stringify(document)));
assert.equal(imported.activeSceneId, document.activeSceneId);
assert.equal(getActiveScene(imported).layers.length, 5);

const unsafeImport = JSON.parse(JSON.stringify(document));
unsafeImport.scenes[0].layers[0].style.fill = "\" onload=\"alert(1)";
assert.throws(() => validateProjectDocument(unsafeImport), /#rrggbb or transparent/);

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
