# Memory

This file is the append-only project-local memory for `groot2_web`.

Agents must append an entry here after every file change under `groot2_web`.
Keep entries concise but specific enough for the next agent to recover intent,
decisions, verification, and remaining risk.

## 2026-05-05 - Historical Baseline

- Intent: capture the project state before the `.agent/` memory layout became
  the canonical context source.
- Files already present:
  - `.gitignore`
  - `README.md`
  - `README_en.md`
  - `requirements.txt`
  - `server.py`
  - `static/app.js`
  - `static/index.html`
  - `static/styles.css`
- Known behavior:
  - `server.py` bridges browser HTTP requests to BehaviorTree.CPP Groot2 over
    ZeroMQ.
  - The frontend can render the tree, poll status, show details, show raw XML,
    run demo mode, and disconnect/clear the view.
  - Public docs were simplified to local startup and had personal paths removed.
- Verification previously used:
  - Python compile check for `server.py`.
  - `node --check` for `static/app.js`.
  - targeted privacy scan for public docs and code.
- Remaining risk:
  - real Docker runtime with an actual Groot2 publisher still needs end-to-end
    validation.

## 2026-05-05 - Adopt .agent Layout

- Intent: restructure agent guidance to match the maintainer's preferred
  pattern where `AGENTS.md` is only a context router and concrete knowledge
  lives in `.agent/`.
- Files changed:
  - `AGENTS.md`
  - removed root `MEMORY.md`
  - `.agent/TODO.md`
  - `.agent/DEVELOPMENT.md`
  - `.agent/KNOWLEDGE.md`
  - `.agent/TROUBLESHOOTING.md`
  - `.agent/MEMORY.md`
- Decisions:
  - `AGENTS.md` now contains only pre-task loading, execution constraints, and
    post-task sync rules.
  - Stable architecture and Docker networking facts moved to
    `.agent/KNOWLEDGE.md`.
  - Development workflow, verification commands, privacy scan, and memory
    update rules moved to `.agent/DEVELOPMENT.md`.
  - Troubleshooting notes moved to `.agent/TROUBLESHOOTING.md`.
  - Per-change memory is now `.agent/MEMORY.md`.
  - Privacy scan guidance in `.agent/DEVELOPMENT.md` intentionally avoids
    committing real private identifiers as example search terms.
- Verification:
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed targeted privacy scan over tracked project files, including hidden
    `.agent/` files and excluding `.git/`.

## 2026-05-05 - Add Groot2 Blackboard Reading

- Intent: add read-only viewing for all blackboards available through the
  BehaviorTree.CPP Groot2 protocol.
- Files changed:
  - `server.py`
  - `requirements.txt`
  - `static/index.html`
  - `static/app.js`
  - `static/styles.css`
  - `README.md`
  - `README_en.md`
  - `.agent/TODO.md`
  - `.agent/DEVELOPMENT.md`
  - `.agent/KNOWLEDGE.md`
  - `.agent/TROUBLESHOOTING.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Implemented `/api/blackboard` using Groot2 request type `BLACKBOARD='B'`.
  - Sent requested blackboard names as the required second ZeroMQ multipart
    frame, separated by semicolons.
  - Added `msgpack` as a Python dependency because Groot2 blackboard replies are
    msgpack-encoded JSON.
  - The frontend derives blackboard names from `BehaviorTree` `_fullpath` or
    `ID`, then polls blackboard values with the same interval as node status.
  - Added a manual `刷新` button in the blackboard panel.
  - Documented that complex blackboard values only appear if the C++ process has
    registered `BT::JsonExporter` converters.
- Verification:
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed targeted privacy scan over `groot2_web`, including hidden `.agent/`
    files and excluding `.git/`.
  - Started a temporary server on `127.0.0.1:8767`.
  - Verified `/api/health` returned `ok=true`, `pyzmq=true`, and
    `msgpack=false` in the current host Python environment.
  - Verified `/api/fulltree?demo=1` returned demo XML.
  - Verified `/api/blackboard?demo=1` returned demo blackboard values.
- Follow-up:
  - Install `msgpack` from `requirements.txt` in the Docker/Python environment
    that will read real Groot2 blackboards.
  - Real blackboard values from custom ROS message types still require C++
    `BT::JsonExporter` converters.

## 2026-05-05 - Compress Runtime Event Retention

- Intent: reduce the retained length of the runtime event log because the old
  history kept too many entries.
- Files changed:
  - `static/app.js`
  - `.agent/KNOWLEDGE.md`
  - `.agent/TODO.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Replaced the hard-coded `slice(0, 80)` event retention with
    `EVENT_LIMIT = 24`.
  - Recorded the event-retention rule in `.agent/KNOWLEDGE.md` so future agents
    can find and tune it quickly.
- Verification:
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `git diff --check`.
  - Passed targeted privacy scan over `groot2_web`, including hidden `.agent/`
    files and excluding `.git/`.

## 2026-05-05 - Add Frontend Settings Panel

- Intent: add a webpage settings button so users can tune runtime parameters,
  including the retained length of the runtime event log.
- Files changed:
  - `static/index.html`
  - `static/app.js`
  - `static/styles.css`
  - `README.md`
  - `README_en.md`
  - `.agent/KNOWLEDGE.md`
  - `.agent/TODO.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Added a topbar `设置` button and a lightweight modal settings panel.
  - Added browser-local settings stored under `groot2_web_settings`.
  - Added configurable `eventLimit`, defaulting to 24 and clamped to 1-200.
  - Added configurable request timeout, defaulting to 1200 ms and sent as
    `timeout_ms` on API requests.
  - Added an `autoBlackboard` toggle. When disabled, blackboard values only
    refresh when the user clicks `刷新`.
  - Updated public documentation in both Chinese and English.
- Verification:
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `git diff --check`.
  - Passed targeted privacy scan over `groot2_web`, including hidden `.agent/`
    files and excluding `.git/`.
  - Started a temporary server on `127.0.0.1:8767`.
  - Verified `index.html` contains the settings button and settings inputs.
  - Verified served `app.js` contains the settings storage key, configurable
    event limit, `timeout_ms`, and blackboard auto-refresh logic.
  - Verified `/api/health` and `/api/blackboard?demo=1` still respond.
  - Stopped the temporary server after verification.

## 2026-05-05 - Redesign Frontend Visual Style

- Intent: redesign the web UI with inspiration from a dark portfolio/reference
  page that uses oversized typography, sparse telemetry readouts, and
  high-contrast instrument-like controls.
- Files changed:
  - `static/index.html`
  - `static/styles.css`
  - `.agent/TODO.md`
  - `.agent/KNOWLEDGE.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Added a large decorative `GROOT2` wordmark behind the application shell.
  - Added a topbar telemetry readout showing the Groot2/ZMQ context.
  - Rebuilt the CSS around a dark instrument-console style with dashed pill
    controls, compact panels, large numeric status counters, and strong status
    accents.
  - Preserved existing frontend IDs and behavior so settings, blackboard,
    demo mode, connection, and disconnect logic continue to work.
- Verification:
  - Took a local Playwright screenshot at `1440x900` against a temporary server
    on `127.0.0.1:8767` and checked for obvious layout overlap.
  - Stopped the temporary server after the screenshot check.
  - Final syntax, diff, and privacy checks are run after this memory entry.

## 2026-05-05 - Replace Brand Icon With Generated Asset

- Intent: use the selected generated minimal sci-fi icon as the top-left
  `Groot2 Web` brand mark.
- Files changed:
  - `static/assets/groot2-web-icon.png`
  - `static/index.html`
  - `static/styles.css`
  - `.agent/TODO.md`
  - `.agent/KNOWLEDGE.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Copied the selected generated image into the project instead of referencing
    the generator output path.
  - Center-cropped the asset with `sips` so the symbol remains visible at small
    UI sizes.
  - Replaced the CSS-only `.brand-mark` block with an image element and reused
    the same PNG as the page favicon.
- Verification:
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `git diff --check`.
  - Passed targeted privacy scan over `groot2_web`, including hidden `.agent/`
    files and excluding `.git/`.
  - Started a temporary server on `127.0.0.1:8767`.
  - Verified `/api/health` still responds.
  - Took a local Playwright screenshot at `1440x900` and confirmed the new
    icon appears in the top-left brand area.
  - Stopped the temporary server after verification.

## 2026-05-05 - Hide Empty State After Tree Loads

- Intent: fix the UI bug where the `等待行为树` empty-state text remained visible
  after a behavior tree was successfully loaded.
- Files changed:
  - `static/styles.css`
  - `.agent/TROUBLESHOOTING.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Added a global `[hidden] { display: none !important; }` rule so elements
    hidden by `app.js` are reliably removed from layout even when component CSS
    defines its own `display` value.
  - Documented the hidden-attribute CSS conflict in troubleshooting memory.
- Verification:
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `git diff --check`.
  - Passed targeted privacy scan over `groot2_web`, including hidden `.agent/`
    files and excluding `.git/`.
  - Started a temporary server on `127.0.0.1:8767`.
  - Verified `/api/health` still responds.
  - Verified the served CSS contains the global `[hidden]` rule before the
    `.empty-state` display rule.
  - Took a local Playwright screenshot for a basic page-render sanity check.
  - Stopped the temporary server after verification.

## 2026-05-05 - Add Blackboard Picker And Event Expansion

- Intent: improve the runtime inspection workflow by clearing selected nodes
  from empty tree space, separating full blackboard values into their own UI,
  pinning chosen blackboard pairs to the homepage, and making runtime events
  expandable and scrollable.
- Files changed:
  - `static/index.html`
  - `static/app.js`
  - `static/styles.css`
  - `.agent/TODO.md`
  - `.agent/KNOWLEDGE.md`
  - `.agent/MEMORY.md`
- Decisions:
  - Clicking empty space inside `#treePane` clears `selectedUid`, refreshes node
    classes, and restores node details to `未选择节点`.
  - Added `#blackboardOverlay` as a full blackboard value picker.
  - Added `groot2_web_pinned_blackboard_keys` in browser `localStorage` to
    persist which blackboard key/value pairs appear on the homepage.
  - The homepage blackboard panel now shows only pinned values and points users
    to `全部` when none are selected.
  - Runtime events now use a triangle toggle: collapsed shows the latest 3
    items; expanded shows the configured retained event length and scrolls.
- Verification:
  - Started a temporary server on `127.0.0.1:8767`.
  - Ran a headless Chrome DevTools Protocol interaction test against demo mode:
    loaded demo tree, verified empty state hidden, selected a node, clicked
    empty tree space, verified details returned to `未选择节点`, opened the full
    blackboard picker, pinned a value, verified the homepage blackboard panel
    changed, waited for 3 collapsed events, expanded the event log, and verified
    more than 3 events became visible.
  - Captured `/tmp/groot2_web_feature_test.png` during the browser interaction
    check.
  - Stopped the temporary server after verification.
  - Passed `node --check` for `groot2_web/static/app.js`.
  - Passed Python compile check for `groot2_web/server.py`.
  - Passed `git diff --check`.
  - Passed targeted privacy scan over `groot2_web`, including hidden `.agent/`
    files and excluding `.git/`.
