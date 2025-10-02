# Agent Design Guide

This repository is maintained by codified automation ("agents").  The goal is to keep the codebase clean, modular, and easy to reason about as features grow.  Use this guide as the playbook for future refactors or new automation work.

## Core Principles

1. **Single Responsibility Composables**
   - Prefer extracting feature-specific logic into dedicated composables/modules.
   - Each composable manages one concern (e.g., PDF document lifecycle, viewer scaling, search state, highlight rendering).
   - Components (`*.vue`) coordinate composables instead of owning detailed logic.

2. **Lean Components**
   - Keep Vue components as declarative bindings between state and templates.
   - If a component contains extensive business logic, consider promoting it into a composable or utility.

3. **Clear API Boundaries**
   - Composables should return explicit, documented APIs (state refs + action functions).
   - Avoid leaking internal implementation details (e.g., raw DOM nodes) unless required.

4. **Search & Highlight Strategy**
   - PDF text search operates via the text layer; cross-node matching and highlight painting are handled in `usePdfSearch` + `usePageHighlights`.
   - Image/PDF hybrid behaviour should fallback gracefully (optionally via future OCR).

5. **Scaling & Layout Behaviour**
   - Zoom behaviour (pinch, keyboard, fit/actual toggles, sidebar interactions) lives in `useViewerScaling` to keep ViewMode focused on orchestration.
   - Maintain consistent anchor logic when changing scale, ensuring the viewport re-centres around the pointer/focus content.

6. **Document Lifecycle**
   - PDF loading/destroy and error handling reside in `useDocumentLoader`.
   - Any file-related side effects (search state, page history) observe loader events instead of re-implementing load logic.

7. **State Persistence**
   - Use the persistence composables to read/write user settings and per-file state (e.g., search snapshots).
   - Keep serialization logic (debounce, schema migration) isolated from UI code.

8. **Testing Mindset**
   - Type-check (`vue-tsc`) after each refactor to catch missing contracts early.
   - Prefer writing deterministic helper functions (pure where possible) to support future unit tests.

## When Adding New Features

- Start by identifying the module/composable most aligned with the feature.
- If the logic does not fit existing modules, scaffold a new composable with a focused API.
- Update documentation (design.md / AGENT.md) so future agents inherit the context.
- Ensure components only glue together composables and presentational layout.

## Current Composable Layout

- `useDocumentLoader` – PDF load/destroy, error state, page count.
- `useViewerScaling` – zoom state, anchors, sidebar integrations, pinch handling.
- `usePdfSearch` – per-file search state, match traversal.
- `usePageHighlights` – draw/remove search highlights for PdfViewer.
- `usePdfViewerEngine` – low-level PDF.js rendering window (kept cohesive, even if larger).

Refer back to this guide whenever automation or manual refactors are scheduled.  Consistency is the key to keeping the project maintainable.
