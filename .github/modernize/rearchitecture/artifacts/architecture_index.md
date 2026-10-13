# Architecture index

This index is not the full contract. Do not implement from this file alone; follow the artifact paths below.

## Global artifacts

- `unit_graph.yaml`: entrypoints, dependencies, shared references, and public signatures.
- `migration_boundary.yaml`: implementation scope; `must_rewrite` is authoritative and `source_anchors` are not rewrite targets.
- `wire_contracts.yaml`: HTTP and cross-language contracts; preserve rows marked `must_preserve`.
- `shared_modules.yaml`: filter by `used_by_units` before changing runner, rules, or auth.
- `cross_unit_state.yaml`: filter by writer/reader unit; runtime-confirm local runtime/compiler and sandbox availability.
- `seams.yaml`: Bot Arena Protocol bridge mapping and frozen game-engine rule.
- `project-structure.md`, `tech-stack.md`, `data-model.md`: global planning views.

## Implementation Guide

### Unit: bots

- external trigger: authenticated `/api/bots` CRUD and `/api/bots/test`.
- must read `units/bots/behavior.yaml`, `units/bots/bindings.yaml`, and `units/bots/unit_decomposition.yaml`.
- filter global rows where `unit == bots`, `used_by_units` includes `bots`, or a seam cut touches `bots`.
- completion evidence: real JavaScript/Python/C++ adapter tests, protocol/error tests, UI contract review, sandbox capability result, and exact list of preserved error mappings.

### Unit: submissions

- external trigger: authenticated `/api/submissions`.
- must read the three `units/submissions/*` files and global contracts whose unit is `submissions`.
- completion evidence: accepted/rejected/failed persistence for JavaScript, C++, and Python.

### Unit: matches

- external trigger: `/api/matches` and scheduled bot turns.
- must read the three `units/matches/*` files; filter shared runner/rules rows by `used_by_units`.
- completion evidence: stored bot language reaches the local adapter and a failed sandboxed execution preserves existing turn semantics.

### Units: auth, users, rooms, friends, health

- external triggers: their route groups and `/api/health`.
- read the corresponding per-unit files before touching shared auth, persistence, or scheduler behavior.
- these units are outside the C++/Python implementation boundary unless integration verification exposes a regression.

### Required handoff

Before DONE report `artifacts_read`, `implemented_must_preserve`, `unresolved_or_deferred`, and test/build/runtime evidence. Candidate splits are advisory only; every `unit_decomposition.yaml` has `commit: false`.
