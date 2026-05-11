# Groot2 Web

English documentation. For the main Chinese documentation, see [README.md](README.md).

`Groot2 Web` is a local browser-based viewer for BehaviorTree.CPP / Groot2.
It connects to `BT::Groot2Publisher`, fetches the behavior tree XML, and shows
node statuses in a web page.

## What It Does

BehaviorTree.CPP uses a ZeroMQ-based Groot2 protocol. A browser can not connect
to that protocol directly, so this project runs a small local Python bridge:

```text
Browser
  -> HTTP
groot2_web/server.py
  -> ZeroMQ Groot2 protocol
BT::Groot2Publisher
  -> running behavior tree
```

The web page can show:

- Tree structure
- Node statuses: `IDLE`, `RUNNING`, `SUCCESS`, `FAILURE`, `SKIPPED`
- Node details
- Blackboard values
- Recent status changes
- Raw XML
- Node search, focus, and subtree collapse

This tool is read-only. It can read blackboards, but it does not edit
blackboards, insert breakpoints, or control tree execution.

## Directory Layout

```text
groot2_web/
  README.md
  README_en.md
  requirements.txt
  server.py
  static/
    index.html
    styles.css
    app.js
```

## Requirements

### BehaviorTree.CPP Side

Your C++ program must create a `BT::Groot2Publisher`:

```cpp
auto publisher = std::make_shared<BT::Groot2Publisher>(tree, 1667);
```

The port, `1667` in this example, is the target port used by the web page.

Note: `Groot2Publisher` usually starts listening only after the tree has been
created and started. If the behavior server is running but no tree has been
created yet, the web page may not connect.

### Python Side

Python 3, `pyzmq`, and `msgpack` are required.

Install dependencies:

```bash
python3 -m pip install -r groot2_web/requirements.txt
```

On Ubuntu, you can also use:

```bash
sudo apt-get update
sudo apt-get install -y python3-zmq python3-msgpack
```

## Start Locally

From the repository root:

```bash
cd /path/to/your/project
python3 -B groot2_web/server.py --bind 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

If your project is in another directory, adjust the `groot2_web/server.py` path.

## How to Use

1. Start your BehaviorTree.CPP program.
2. Make sure the tree has been created and is running.
3. Start `groot2_web/server.py`.
4. Open `http://127.0.0.1:8765`.
5. Enter the IP and port of the Groot2Publisher.
6. Click `Connect`.

If the web server and the behavior tree program run on the same machine, use:

```text
Host: 127.0.0.1
Port: 1667
```

If the behavior tree program runs on another machine, enter that machine's IP
and Groot2 port.

After a successful connection, the web page automatically reads all blackboards
associated with the `BehaviorTree` elements in the current XML. Values are shown
in the `Blackboard` panel. The `Refresh` button reads them again manually, and
the polling interval also controls automatic blackboard refreshes.

Note: Groot2 can only export blackboard values that BehaviorTree.CPP can convert
to JSON. Basic types usually work out of the box. Custom types or ROS messages
need `BT::JsonExporter` converters registered in the C++ process, otherwise they
may not appear in the blackboard panel.

## Settings

Click `Settings` in the top bar to adjust page runtime parameters:

- `Event history length`: maximum number of runtime events kept in the right panel.
- `Request timeout`: timeout in milliseconds for each Groot2Publisher request.
- `Auto refresh blackboard`: when enabled, blackboard values refresh with the
  status polling loop; when disabled, blackboards are read only when `Refresh`
  is clicked manually.

Settings are saved in the current browser and survive page refreshes.

## Demo Mode

Click `Demo` in the web page to load a built-in demo tree without connecting to
a real behavior tree.

Demo mode is useful for:

- Checking that the page opens correctly
- Checking tree rendering
- Checking status highlighting and event logs
- Giving new users something to try without setting up BehaviorTree.CPP

Demo data is defined in [server.py](server.py):

```python
DEMO_XML = ...
DEMO_STATUSES = ...
DEMO_BLACKBOARDS = ...
```

Click `Close Demo` to stop demo polling and clear the page.

## Stop

If the server is running in the foreground, press:

```text
Ctrl-C
```

If the server runs in the background:

```bash
lsof -ti tcp:8765
kill <PID>
```

The `Disconnect` button in the web page only stops the current polling session
and clears the view. It does not stop the Python server.

## API

These endpoints are mainly used by the web page, but they are useful for manual
debugging too.

### Health Check

```text
GET /api/health
```

### Fetch Tree XML

```text
GET /api/fulltree?host=127.0.0.1&port=1667
```

### Fetch Node Statuses

```text
GET /api/status?host=127.0.0.1&port=1667
```

### Fetch Blackboard Values

```text
GET /api/blackboard?host=127.0.0.1&port=1667&blackboards=MainTree;SubTreeName
```

`blackboards` is a semicolon-separated list of blackboard names. The web page
derives these names from the behavior tree XML automatically.

### Demo Endpoints

```text
GET /api/fulltree?demo=1
GET /api/status?demo=1
GET /api/blackboard?demo=1
```

## Troubleshooting

### The Page Opens, But the Real Port Fails

Make sure the behavior tree is actually running. `Groot2Publisher` listens only
after the tree has been created.

You can also check whether the port is reachable:

```bash
nc -vz 127.0.0.1 1667
```

### Missing `zmq` or `msgpack`

If you see:

```text
ModuleNotFoundError: No module named 'zmq'
```

or:

```text
ModuleNotFoundError: No module named 'msgpack'
```

Install the Python dependencies:

```bash
python3 -m pip install -r groot2_web/requirements.txt
```

### The Blackboard Panel Is Empty

First make sure the behavior tree is running and the page is connected to the
correct Groot2 port.

If the tree and node statuses work but the blackboard is empty, the blackboard
values may not have JSON exporters. BehaviorTree.CPP's Groot2 blackboard API
depends on `BT::JsonExporter`; complex types need converters registered in the
C++ process.

### Port 8765 Is Already in Use

Use another port:

```bash
python3 -B groot2_web/server.py --bind 127.0.0.1 --port 8766
```

Then open:

```text
http://127.0.0.1:8766
```

## Security

This is a local debugging tool. It has no login, authentication, or HTTPS.

Use this by default:

```bash
--bind 127.0.0.1
```

Do not expose it directly to the public internet.
