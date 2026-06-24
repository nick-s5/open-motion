# Development Plan

## Objective

Build Open Motion as an editor-first, AI-native 2D motion graphics application. The immediate target is a working Web/Windows alpha; the long-term target is a shared document and rendering core that can support native macOS/iPadOS with Metal.

## Product Contract

The alpha must prove this loop:

1. Open a real editable motion project.
2. Inspect its layers, masks, nested scenes, keyframes, and export warnings.
3. Edit objects manually through the canvas, inspector, and timeline.
4. Ask AI for a structured patch.
5. Preview, apply, reject, and undo the patch.
6. Export project JSON, an SVG snapshot, and a best-effort Lottie subset.

AI never creates an opaque flattened result. AI output must be normal document operations.

## Current Alpha Scope

Implemented:

- Static Web app that runs on Windows with Node only.
- Canonical JSON document with scenes, layers, masks, keyframes, effects, and nested scene instances.
- SVG preview renderer with realtime playback and scrubbing.
- Layer list, inspector, timeline markers, starter project switching, scene switching, nested scene opening.
- Layer creation, deletion, visibility, reordering, mask assignment, transform keyframing, easing choice, playhead key deletion.
- Local AI patch dock for Draft/Edit/Explain/Automate-style flows.
- Project JSON, SVG snapshot, and Lottie-subset export with warnings.
- Smoke tests for model, patch, SVG export, Lottie export, and demo structure.

Not implemented yet:

- Direct canvas drag/scale/rotate handles.
- Timeline drag/multiselect.
- Full graph editor.
- Audio import/waveforms.
- PNG sequence/video export.
- Real OpenAI relay integration.
- WebGPU/wgpu render backend.
- Native Windows package.

## Architecture Direction

The durable contract is:

```text
Document
  -> Semantic Operations
  -> Evaluated Scene At Time
  -> Render IR / Export IR
  -> Platform Renderer or Exporter
```

The browser alpha currently combines these pieces in small ES modules. As the product grows, split them into packages:

```text
packages/schema          JSON schema, migrations, operation schemas
packages/core            evaluation, interpolation, timeline logic
packages/editor-state    selection, history, command routing
packages/editor-ui       panels, canvas tools, timeline, AI dock
packages/ai-patches      patch validation, preview, provider abstraction
packages/export          Lottie, SVG, frame queues, video encoders
apps/web                 browser editor
apps/windows             packaged Windows shell
apps/apple-native        future SwiftUI/Metal host
```

Use integer ticks internally once timeline editing becomes dense. The current alpha uses seconds for simplicity.

## Milestone 1: Web/Windows Usable Alpha

Acceptance criteria:

- Runs in Chromium/Edge on Windows.
- Demo project plays immediately.
- Canvas, layers, inspector, and timeline stay synchronized.
- Users can create/delete/reorder layers.
- Users can create/delete transform and opacity keyframes.
- Users can choose easing for new keyframes.
- Masks preview correctly.
- Nested scene instances preview in parent scenes.
- Users can enter nested scenes and edit their contents.
- AI dock generates previewable structured patches and supports apply/reject.
- Export warnings identify unsupported Lottie features.
- Project state persists locally.

Remaining work:

- Add keyboard shortcuts for play, delete, undo, and keyframe insertion.
- Add canvas drag for selected layer position.
- Add a clear local reset/import project control.
- Add JSON import.
- Add browser smoke tests once Playwright or the in-app browser bridge is available.

## Milestone 2: Core Hardening

- Move document shape into a formal schema.
- Add document migrations.
- Add operation validation beyond operation names.
- Convert direct UI mutations to semantic operations.
- Add redo and patch history.
- Add deterministic snapshot tests for evaluated scenes.
- Add compatibility warning tests.

## Milestone 3: Rendering And Export

- Introduce `RenderSceneIR` with path/text/image/clip/effect commands.
- Keep SVG renderer as debug/reference backend.
- Add Canvas2D or WebGPU preview backend.
- Add PNG still export.
- Add deterministic PNG sequence export.
- Add WebM export in browser where supported.
- Add MP4 through a Windows desktop shell or bundled encoder.
- Keep Lottie as a subset exporter with explicit warnings.

## Milestone 4: AI Relay

- Define strict operation schemas.
- Add backend relay; do not expose OpenAI keys in browser/mobile clients.
- Add provider abstraction for local/dev/mock/relay providers.
- Add patch simulation and visual diff.
- Add scope controls: selection, current scene, whole project.
- Add patch history with undo/redo integration.

## Milestone 5: Native Platform Track

- Keep native apps as thin shells over the shared model, operations, and evaluator.
- Build a Metal renderer against the same evaluated scene/render IR contract.
- Add Pencil/touch-first tools on iPad.
- Add renderer parity tests between SVG/Web and Metal snapshots.
- Avoid Apple-only assumptions in the project format.

## Engineering Rules

- The document model is the source of truth.
- Manual edits, AI edits, imports, and exports use the same semantic operations.
- Renderers do not own animation state.
- Unsupported export behavior is warned, not hidden.
- The alpha can be dependency-light; production architecture should split into packages only when the module boundaries are proven.
