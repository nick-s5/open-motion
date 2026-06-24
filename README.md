# Open Motion

Open Motion is an open-source, cross-platform motion graphics editor for precise 2D vector animation with AI-assisted editing. This first alpha targets Windows and Web so the core editor can be tested immediately, while keeping the document model renderer-agnostic for future macOS and iPadOS Metal front ends.

## Current Alpha

- Canonical scene/layer/keyframe document model.
- SVG-based realtime preview with playback and scrubbing.
- Layer list, inspector, timeline, basic keyframe editing, and easing.
- Shape and text layers with transforms, opacity, fills, strokes, blur, and shadows.
- AI dock that produces previewable, undoable document patches.
- JSON, SVG snapshot, and Lottie-subset export with compatibility warnings.

## Run

```powershell
npm.cmd test
npm.cmd start
```

Then open `http://localhost:4173`.

PowerShell may block `npm`; use `npm.cmd` on Windows.

## Project Direction

The product principle is manual mastery first, AI acceleration second. AI edits the same document state that the human editor and renderer use, and every AI operation becomes a normal patch that can be previewed, applied, and undone.

See [docs/development-plan.md](./docs/development-plan.md) for the implementation plan and milestone criteria.
