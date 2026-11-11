# 3D Web Secret Hitler - Architecture & Rules

## Project Scope
- Tech Stack: Vite, TypeScript, Three.js, TailwindCSS (for UI overlay).
- Viewport: Fullscreen 3D table with an isometric/top-down perspective.
- Mode: Single-player with 4 local mock/AI bots (Offline turn-based).

## Architectural Boundaries (STRICT)
1. NO 3D Canvas UI: All text, role cards, votes (Ja/Nein), and modal dialogues MUST be DOM/HTML elements overlaid on the canvas. Do NOT use 3D text or canvas textures for readable interface elements.
2. Decoupled Logic: The game loop, deck shuffling, role assignment, and policy tracking must live strictly inside `src/engine/`. The 3D renderer (`src/render/`) only subscribes to state changes.
3. Simple 3D Primitives: Use low-poly meshes, primitive shapes (boxes for cards, cylinders for players, wooden texture plane for table) to ensure high performance and zero asset loading bottlenecks.

## Core Phases to Implement
1. Election Phase: President chooses Chancellor nominee -> Everyone votes (Ja/Nein).
2. Legislative Phase: President draws 3 policies, discards 1 -> Chancellor plays 1, discards 1.
3. Executive Action Phase: If fascist policies hit milestones (Policy peek, execution).
4. Victory Check Phase: Liberal / Fascist / Hitler conditions.
