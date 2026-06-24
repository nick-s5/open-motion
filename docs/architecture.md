# Architecture

## Core Idea

Open Motion keeps one canonical project document. Humans, AI agents, importers, exporters, renderers, and future native shells all operate on that same model through patch operations.

## Modules

- `src/model.js`: document creation, keyframe interpolation, easing, evaluated scene state.
- `src/patches.js`: schema-like patch validation and application.
- `src/exporters.js`: JSON, SVG snapshot, Lottie-subset conversion, compatibility warnings.
- `src/aiAgent.js`: local alpha agent that maps user intents to document patches.
- `src/app.js`: browser editor shell, controls, playback, timeline, inspector, export flow.

## Platform Boundary

The browser alpha uses SVG as the preview renderer because it is easy to inspect and maps cleanly to Lottie/SVG exports. Future platform renderers should consume evaluated scene state from `model.js` rather than owning animation behavior themselves.

Recommended native path:

1. Keep the document schema and patch protocol in a shared package.
2. Add a native renderer adapter for Metal using the same evaluated scene state.
3. Add platform-specific input surfaces for Pencil/touch/trackpad.
4. Keep AI orchestration behind a secure relay rather than embedding API keys in mobile clients.

## Export Policy

Video export will eventually render frames through the active renderer and encode via a platform encoder. The alpha ships project JSON, SVG snapshots, and a Lottie-compatible subset. Any unsupported feature should be reported as a warning instead of silently producing a broken export.
