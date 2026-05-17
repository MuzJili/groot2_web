# Troubleshooting

## Browser Cannot Open The Web Page From Docker

Symptom:

```text
server.py runs inside Docker with --bind 127.0.0.1, but the host browser cannot
open http://127.0.0.1:8765.
```

Cause:

```text
127.0.0.1 inside Docker is container loopback, not host loopback.
```

Fix:

```bash
python3 -B groot2_web/server.py --bind 0.0.0.0 --port 8765
```

The container must also publish the web port:

```bash
-p 8765:8765
```

## Web Page Opens But Real Tree Connection Fails

Check these first:

- The behavior tree is actually created and running.
- `BT::Groot2Publisher` has been constructed.
- The webpage target IP and port are from the perspective of `server.py`, not
  necessarily from the perspective of the browser.
- `pyzmq` or `python3-zmq` is installed in the environment running `server.py`.
- Docker port publishing is present if `server.py` runs outside the behavior
  tree container.

Useful checks:

```bash
nc -vz 127.0.0.1 1667
curl http://127.0.0.1:8765/api/health
```

Run those checks from the same environment where the connection is supposed to
be made.

## Missing zmq

Symptom:

```text
ModuleNotFoundError: No module named 'zmq'
```

Fix with pip:

```bash
python3 -m pip install -r groot2_web/requirements.txt
```

Fix with Ubuntu packages:

```bash
sudo apt-get update
sudo apt-get install -y python3-zmq
```

## Port 8765 Is Already In Use

Use another web port:

```bash
python3 -B groot2_web/server.py --bind 127.0.0.1 --port 8766
```

Then open:

```text
http://127.0.0.1:8766
```

## Demo Mode Works But Real Tree Does Not

Demo mode only verifies the web server and frontend rendering. It does not prove
that the real Groot2 publisher is reachable.

If demo works but real connection fails, focus on:

- target IP and port
- Docker network namespace
- whether the behavior tree has started
- whether Groot2Publisher is listening
- whether ZeroMQ dependency is installed

## Blackboard Panel Is Empty

If tree XML and node status work but the blackboard panel is empty:

- confirm the behavior tree is running
- confirm the frontend is requesting the correct blackboard names
- confirm `msgpack` is installed in the Python environment running `server.py`
- check whether the C++ behavior process registered `BT::JsonExporter`
  converters for custom types and ROS messages

Groot2's `BLACKBOARD` request returns only values that BehaviorTree.CPP can
export to JSON.

## Blackboard Shows A JSON.parse Error

Symptom:

```text
JSON.parse: unexpected character at line 1 column ... of the JSON data
```

The blackboard panel may still show the requested blackboard name, for example
`test_check_target_in_region`.

Cause:

```text
The frontend expected `/api/blackboard` to return JSON, but the backend returned
a non-JSON error response. One known trigger is a msgpack blackboard payload that
contains values Python's `json.dumps` cannot serialize directly, such as bytes,
binary blobs, non-string map keys, or non-finite floats.
```

Fix:

```text
Keep backend blackboard payloads normalized through `_make_json_safe()` before
sending HTTP JSON, and keep `fetchJson()` parsing via response text so non-JSON
server failures become readable UI errors.
```

## Empty State Text Remains After Tree Loads

Symptom:

```text
The behavior tree renders, but the background text such as "等待行为树" is still
visible behind the tree.
```

Cause:

```text
The frontend sets the `hidden` attribute on the empty-state element, but author
CSS such as `.empty-state { display: grid; }` can override the browser's default
hidden display rule.
```

Fix:

```css
[hidden] {
  display: none !important;
}
```
