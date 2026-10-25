# Visual upgrade — 2026-10-24

- Character and hands authored and exported through the connected Blender MCP (Blender 4.5.9). The source is `assets-source-v2.blend`, generator `scripts/build_scene_v2.py`. The original source remains available.
- Adult face profile, smaller eyes, continuous cheek/jaw surface, swept hair, tailored jacket, narrow tie and felt fedora. Hands have separate tapered phalanges, knuckles, nails, cuffs and runtime finger pivots.
- Physical CRT canvas and projected HTML terminal receive the same progress events. The monitor turns toward the visitor; the projection originates at its screen. Five chain stages, animated loading rings, elapsed time, actual query logs and cancellation are visible. The bar indicates stages, not estimated remaining time.
- Improved paper handover, detective reach, visitor hand release, print movement, close camera, stamp anticipation, contact, rebound, expanding impact ring and optional synthesized impact sound. Finger pivots close during stamp/pen use. Stamp and printed mark share a position.
- Results use custom SVG symbols, differentiated ink colors and typographic seals for all four verdicts.

## Validation

- `npm run check`: passed, including the new Agent display module.
- `npm test`: 24 passed; no backend behavior changed in this upgrade.
- `node scripts/audit_asset.mjs`: GLB structure and required semantic objects passed. Approximately 4.9 MiB, 171,128 triangles, embedded resources only.
- Browser GPU load and interactive checks at 1440 × 1000 and 390 × 844. No browser warnings/errors observed on the tested load. Mobile projection leaves the detective and computer visible; cancellation restores the editable paper.
- Both stamp and pen animation paths were replayed from existing reports. These replays do not perform new searches.
- Agent screenshots use explicitly labeled offline demonstration cases. They are visual QA, not proof of a new live search.
- Static WebGL fallback image re-rendered with Cycles from the updated source. WebGL fallback terminal positioning is separately styled.

Screenshots: `agent-desktop.jpg`, `agent-mobile.jpg`, `stamp-action.jpg`, `cross-action.jpg`, `report-desktop.jpg`, `home-desktop.jpg`.

The character uses authored stylized mesh geometry and object/finger group animation; it has no facial rig or captured human motion. Visual QA is on the local browser and does not establish performance on every mobile GPU.
