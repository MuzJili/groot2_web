# TODO

## Current Status

- `groot2_web` is a standalone local web viewer for BehaviorTree.CPP Groot2.
- The initial implementation has backend bridge code, static frontend code,
  Chinese documentation, English documentation, demo mode, and disconnect
  behavior.
- Blackboard reading has been added through the Groot2 `BLACKBOARD` request.
- The repository has been initialized as an independent git repository and has
  an upstream GitHub remote.
- Project-local agent routing has been moved to `AGENTS.md` plus `.agent/`.

## Done

- Implemented `server.py` as the HTTP-to-ZeroMQ bridge.
- Implemented static frontend files in `static/`.
- Added Chinese `README.md` and separate English `README_en.md`.
- Added demo behavior tree data in `server.py`.
- Added a webpage close/disconnect button.
- Removed personal local paths and private machine details from public docs.
- Added `.gitignore`.
- Added `.agent/` memory and workflow files.
- Added blackboard value reading, demo blackboard data, and a frontend
  blackboard panel.
- Compressed runtime event retention to keep the event log short.
- Added a settings panel for event history length, request timeout, and
  blackboard auto-refresh.
- Redesigned the frontend as a dark instrument-console interface with a large
  wordmark, telemetry-style readouts, and compact control panels.
- Replaced the top-left brand mark with the generated minimal sci-fi icon.
- Added tree empty-space deselection, a full blackboard value picker with
  pinned homepage values, and expandable scrollable runtime events.
- Added a millisecond polling interval input, scrollable sidebar blackboard
  values, and a blackboard split-view mode that gives the tree and blackboard
  equal workspace columns.
- Added node search, search-result navigation, selected-node focus, selected
  subtree collapse/expand, and expand-all tree controls.

## Open Items

- Add an open-source license before formal public release.
- Runtime-test blackboard reading with a real `BT::Groot2Publisher` inside the
  target Docker container.
- Register `BT::JsonExporter` converters in the C++ behavior process for custom
  blackboard value types or ROS messages that should appear in Groot2.
- Consider adding a short README note for the recommended Docker networking
  pattern when the behavior tree only listens on container-local loopback.
- Keep `.agent/MEMORY.md` updated after every future modification.

## Planned Roadmap

### First Batch

- Timeline replay.
- Active path and failure-chain highlighting.

### Second Batch

- Blackboard diff/watch.
- Connection diagnostic assistant.

### Third Batch

- Tactical HUD.
- Minimap.
- Failure heatmap.
- Story-style runtime log.

## Last Sync

- 2026-05-07: fixed view/XML tab buttons so blackboard expanded mode cannot
  shrink them or wrap their labels.
- 2026-05-07: fixed blackboard expanded mode to use three columns: behavior
  tree, standalone blackboard, and right-side tools/details/events.
- 2026-05-07: moved tree search controls above node details, made node-card
  collapse marks clickable, and kept node details/runtime events visible in
  blackboard expanded mode.
- 2026-05-07: completed search/focus/collapse controls for the tree viewer.
- 2026-05-07: recorded the staged feature roadmap for timeline replay,
  active-path/failure highlighting, search/focus/collapse, blackboard
  diff/watch, diagnostics, tactical HUD, minimap, failure heatmap, and
  story-style logs.
- 2026-05-06: added polling interval input and blackboard split-view scrolling.
