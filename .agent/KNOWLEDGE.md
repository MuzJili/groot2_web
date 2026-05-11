# Knowledge

## Project Purpose

`groot2_web` is a lightweight local browser viewer for BehaviorTree.CPP
Groot2 publishers.

The tool is read-only from the behavior tree point of view. It displays the
tree XML and node status. It should not control behavior tree execution,
mutate blackboard data, or add debugger side effects unless explicitly
requested.

## Architecture

Browsers cannot directly speak the native Groot2 ZeroMQ protocol. The bridge is:

```text
Browser
  -> HTTP
server.py
  -> ZeroMQ Groot2 protocol
BT::Groot2Publisher
  -> running BehaviorTree.CPP tree
```

## Backend Facts

- `server.py` serves static frontend files from `static/`.
- `server.py` provides `/api/health`.
- `server.py` provides `/api/fulltree`.
- `server.py` provides `/api/status`.
- `server.py` provides `/api/blackboard`.
- `server.py` converts Groot2 status bytes into readable status names.
- `server.py` decodes Groot2 blackboard replies from msgpack into JSON.
- Demo data lives in `server.py` as `DEMO_XML`, `DEMO_STATUSES`, and
  `DEMO_BLACKBOARDS`.

## Frontend Facts

- `static/index.html` defines the page structure.
- `static/styles.css` defines the visual style.
- `static/app.js` handles connection, demo mode, polling, tree rendering,
  status rendering, blackboard rendering, details, event history, raw XML, and
  disconnect behavior.
- The runtime settings panel stores values in browser `localStorage` under
  `groot2_web_settings`.
- Runtime settings currently include event history length, Groot2 request
  timeout, and blackboard auto-refresh.
- The webpage close/disconnect button stops frontend polling and clears the
  view. It does not stop the Python server.
- The current visual style is a dark instrument-console layout: large
  low-opacity wordmark, dashed pill controls, telemetry-style readouts, compact
  panels, and strong status color accents. Keep future UI changes compatible
  with that direction unless the maintainer asks for another redesign.
- The top-left brand mark and favicon use
  `static/assets/groot2-web-icon.png`, a cropped project copy of the selected
  generated minimal sci-fi icon.
- Clicking empty space in the tree viewer clears the selected node and returns
  node details to the unselected state.
- The sidebar blackboard panel only shows user-pinned key/value pairs. The
  `全部` button opens the full blackboard value picker, and pinned pair IDs are
  stored in browser `localStorage` under `groot2_web_pinned_blackboard_keys`.
- The sidebar blackboard panel has a magnify button next to `全部`. When active,
  the main workspace becomes three columns: behavior tree on the left, an
  enlarged standalone blackboard column in the middle, and tree tools/node
  details/runtime events on the right. The blackboard shows all exported pairs
  and scrolls vertically.
- The topbar polling control is a numeric input in milliseconds. The frontend
  clamps it to 50-60000 ms before restarting the runtime polling timer.
- The right inspector includes tree search/focus/collapse controls above the
  node details panel. Search matches node names, tags, UIDs, paths, and XML
  attributes. Activating a match selects it, expands its ancestors, and centers
  it in the tree pane. The selected node can be focused, collapsed/expanded if
  it has children, and the whole tree can be expanded again with the expand-all
  control. The node card's top-right collapse mark is also clickable.
- Runtime events are collapsed to the latest 3 items by default. The triangle
  button expands the event log to the configured event history length, with the
  panel itself scrollable.

## Groot2 Blackboard Protocol

BehaviorTree.CPP Groot2 request types include:

```text
FULLTREE   = 'T'
STATUS     = 'S'
BLACKBOARD = 'B'
```

The `BLACKBOARD` request is a multipart ZeroMQ request:

```text
part 1: Groot2 request header
part 2: semicolon-separated blackboard names
```

The reply payload is msgpack-encoded JSON. Python needs the `msgpack` package to
decode it.

`Groot2Publisher` stores blackboards by subtree name. For each `BehaviorTree`
element in the XML, the frontend derives the request name from `_fullpath` or,
if that is empty/missing, from `ID`.

Only values exportable by BehaviorTree.CPP `BT::JsonExporter` will appear.
Complex custom types and ROS messages need converters registered in the C++
behavior process.

## Groot2 Target Memory

If `server.py` and the BehaviorTree.CPP process run in the same network
namespace, the target is usually:

```text
IP: 127.0.0.1
Port: 1667
```

The default local web page is usually:

```text
http://127.0.0.1:8765
```

## Docker Networking Memory

Container `127.0.0.1` is not host `127.0.0.1`.

Recommended setup when the behavior tree runs inside Docker and Groot2 is only
reachable on container-local loopback:

```text
BehaviorTree.CPP process and server.py run in the same container.
server.py binds HTTP to 0.0.0.0:8765.
Docker maps host 8765 -> container 8765.
The browser opens http://127.0.0.1:8765.
The webpage target is 127.0.0.1:1667.
```

In this setup, `127.0.0.1:1667` is resolved by `server.py` inside the
container, not by the host browser.

Alternative setup:

```text
Expose the Groot2 port from Docker, then run server.py on the host.
```

That requires the container to publish the Groot2 port and the Groot2 publisher
to be reachable from outside the container.
