#!/usr/bin/env python3
"""Local web viewer for BehaviorTree.CPP Groot2 publishers.

The browser talks to this HTTP server. The server talks to the BT.CPP
Groot2Publisher through ZeroMQ, because browsers can not connect to the
native Groot2 protocol directly.
"""

from __future__ import annotations

import argparse
import base64
import json
import math
import random
import socket
import struct
import sys
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    import zmq  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - exercised on machines without pyzmq
    zmq = None  # type: ignore

try:
    import msgpack  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - exercised on machines without msgpack
    msgpack = None  # type: ignore


PROTOCOL_ID = 2
REQUEST_FULLTREE = ord("T")
REQUEST_STATUS = ord("S")
REQUEST_BLACKBOARD = ord("B")

STATUS_NAMES = {
    0: "IDLE",
    1: "RUNNING",
    2: "SUCCESS",
    3: "FAILURE",
    4: "SKIPPED",
    11: "IDLE_FROM_RUNNING",
    12: "IDLE_FROM_SUCCESS",
    13: "IDLE_FROM_FAILURE",
}

STATIC_DIR = Path(__file__).resolve().parent / "static"

DEMO_XML = """<root BTCPP_format="4" main_tree_to_execute="rmul_2026_no_attack">
  <BehaviorTree ID="rmul_2026_no_attack">
    <ReactiveSequence _uid="1" _fullPath="rmul_2026_no_attack/ReactiveSequence">
      <IsGameStatus _uid="2" _fullPath="rmul_2026_no_attack/IsGameStatus" game_status="4"/>
      <Fallback _uid="3" _fullPath="rmul_2026_no_attack/Fallback">
        <IsGoalAvailable _uid="4" _fullPath="rmul_2026_no_attack/IsGoalAvailable"/>
        <CalculateAttackPose _uid="5" _fullPath="rmul_2026_no_attack/CalculateAttackPose"
          goal="{attack_pose}"/>
      </Fallback>
      <Sequence _uid="6" _fullPath="rmul_2026_no_attack/Sequence">
        <PubTargetMode _uid="7" _fullPath="rmul_2026_no_attack/PubTargetMode" target_mode="1"/>
        <PubNav2Goal _uid="8" _fullPath="rmul_2026_no_attack/PubNav2Goal"
          goal_pose="{attack_pose}"/>
      </Sequence>
    </ReactiveSequence>
  </BehaviorTree>
</root>
"""

DEMO_STATUSES = [
    {1: 1, 2: 2, 3: 1, 4: 3, 5: 2, 6: 1, 7: 2, 8: 1},
    {1: 1, 2: 2, 3: 2, 4: 2, 5: 12, 6: 1, 7: 12, 8: 1},
    {1: 2, 2: 12, 3: 12, 4: 12, 5: 12, 6: 2, 7: 12, 8: 2},
    {1: 11, 2: 12, 3: 12, 4: 12, 5: 12, 6: 12, 7: 12, 8: 12},
]

DEMO_BLACKBOARDS = {
    "rmul_2026_no_attack": {
        "attack_pose": {"x": 2.4, "y": -1.1, "yaw": 1.57},
        "referee_gameStatus": {"game_progress": 4, "stage_remain_time": 256},
        "referee_rfidStatus": {"base_buff": True, "outpost_buff": False},
        "target_mode": 1,
        "nav2_goal_pose": "2.40;-1.10;1.57",
    }
}


class Groot2Error(RuntimeError):
    """Raised when a Groot2 request failed."""


def _json_bytes(payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> tuple[int, bytes]:
    safe_payload = _make_json_safe(payload)
    return (
        int(status),
        json.dumps(safe_payload, ensure_ascii=False, allow_nan=False).encode("utf-8"),
    )


def _make_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return _bytes_to_json(bytes(value))
    if isinstance(value, dict):
        return {_json_key(key): _make_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_make_json_safe(item) for item in value]
    if msgpack is not None and isinstance(value, msgpack.ExtType):  # type: ignore[union-attr]
        return {
            "type": "msgpack_ext",
            "code": value.code,
            "data": _bytes_to_json(value.data),
        }
    return str(value)


def _json_key(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (bytes, bytearray, memoryview)):
        text = _bytes_to_json(bytes(value))
        return text if isinstance(text, str) else f"bytes:{text['value']}"
    return str(value)


def _bytes_to_json(value: bytes) -> str | dict[str, Any]:
    try:
        return value.decode("utf-8")
    except UnicodeDecodeError:
        return {
            "type": "bytes",
            "encoding": "base64",
            "size": len(value),
            "value": base64.b64encode(value).decode("ascii"),
        }


def _request_header(request_type: int) -> bytes:
    return struct.pack("<BBI", PROTOCOL_ID, request_type, random.getrandbits(32))


def _decode_reply_header(data: bytes) -> dict[str, Any]:
    if len(data) < 22:
        raise Groot2Error("Groot2 reply header is too short")
    protocol, request_type, request_id = struct.unpack_from("<BBI", data, 0)
    tree_uuid = data[6:22].hex()
    return {
        "protocol": protocol,
        "request_type": chr(request_type),
        "request_id": request_id,
        "tree_uuid": tree_uuid,
    }


def _parse_status_buffer(data: bytes) -> list[dict[str, Any]]:
    if len(data) % 3 != 0:
        raise Groot2Error(f"invalid status buffer size: {len(data)}")

    statuses: list[dict[str, Any]] = []
    for offset in range(0, len(data), 3):
        uid = struct.unpack_from("<H", data, offset)[0]
        raw_status = data[offset + 2]
        statuses.append(
            {
                "uid": uid,
                "status": STATUS_NAMES.get(raw_status, f"UNKNOWN_{raw_status}"),
                "raw": raw_status,
            }
        )
    return statuses


def _decode_blackboard_payload(data: bytes) -> dict[str, Any]:
    if msgpack is None:
        raise Groot2Error(
            "Python dependency msgpack is missing. Install it with: "
            "python3 -m pip install -r groot2_web/requirements.txt"
        )
    try:
        payload = msgpack.unpackb(data, raw=False, strict_map_key=False)  # type: ignore[union-attr]
    except Exception as exc:  # noqa: BLE001 - msgpack exception classes vary by version
        raise Groot2Error(f"failed to decode Groot2 blackboard msgpack: {exc}") from exc
    if not isinstance(payload, dict):
        raise Groot2Error("Groot2 blackboard reply is not a map")
    return payload


class Groot2Client:
    def __init__(self, host: str, port: int, timeout_ms: int) -> None:
        if zmq is None:
            raise Groot2Error(
                "Python dependency pyzmq is missing. Install it with: "
                "sudo apt install python3-zmq  # or: python3 -m pip install pyzmq"
            )
        self._address = f"tcp://{host}:{port}"
        self._timeout_ms = timeout_ms

    def request(
        self, request_type: int, extra_parts: list[str | bytes] | None = None
    ) -> tuple[dict[str, Any], bytes]:
        context = zmq.Context.instance()  # type: ignore[union-attr]
        socket_obj = context.socket(zmq.REQ)  # type: ignore[union-attr]
        socket_obj.setsockopt(zmq.LINGER, 0)  # type: ignore[union-attr]
        socket_obj.setsockopt(zmq.RCVTIMEO, self._timeout_ms)  # type: ignore[union-attr]
        socket_obj.setsockopt(zmq.SNDTIMEO, self._timeout_ms)  # type: ignore[union-attr]
        try:
            socket_obj.connect(self._address)
            request_parts = [_request_header(request_type)]
            for part in extra_parts or []:
                request_parts.append(part if isinstance(part, bytes) else part.encode("utf-8"))
            socket_obj.send_multipart(request_parts)
            parts = socket_obj.recv_multipart()
        except Exception as exc:  # noqa: BLE001 - pyzmq exception classes vary by version
            raise Groot2Error(f"failed to request {self._address}: {exc}") from exc
        finally:
            socket_obj.close(0)

        if not parts:
            raise Groot2Error("empty Groot2 reply")
        if parts[0] == b"error":
            message = parts[1].decode("utf-8", "replace") if len(parts) > 1 else "unknown error"
            raise Groot2Error(message)
        if len(parts) < 2:
            raise Groot2Error("Groot2 reply did not include a payload")

        return _decode_reply_header(parts[0]), parts[1]


def _query_value(query: dict[str, list[str]], name: str, default: str) -> str:
    values = query.get(name)
    return values[0] if values else default


def _target_from_query(query: dict[str, list[str]]) -> tuple[str, int, bool]:
    host = _query_value(query, "host", "127.0.0.1").strip()
    port_text = _query_value(query, "port", "1667").strip()
    demo = _query_value(query, "demo", "0") == "1" or host.lower() == "demo"

    if demo:
        return "demo", 1667, True
    if not host:
        raise ValueError("host is required")
    if len(host) > 253:
        raise ValueError("host is too long")
    try:
        port = int(port_text)
    except ValueError as exc:
        raise ValueError("port must be an integer") from exc
    if port < 1 or port > 65535:
        raise ValueError("port must be between 1 and 65535")
    return host, port, False


def _blackboard_names_from_query(query: dict[str, list[str]]) -> list[str]:
    raw_values: list[str] = []
    raw_values.extend(query.get("blackboards", []))
    raw_values.extend(query.get("blackboard", []))

    names: list[str] = []
    seen: set[str] = set()
    for raw_value in raw_values:
        for item in raw_value.replace(",", ";").split(";"):
            name = item.strip()
            if name and name not in seen:
                if len(name) > 512:
                    raise ValueError("blackboard name is too long")
                names.append(name)
                seen.add(name)
    return names


def _demo_statuses() -> list[dict[str, Any]]:
    frame = DEMO_STATUSES[int(time.time() * 2) % len(DEMO_STATUSES)]
    return [
        {
            "uid": uid,
            "status": STATUS_NAMES.get(status, f"UNKNOWN_{status}"),
            "raw": status,
        }
        for uid, status in frame.items()
    ]


def _demo_blackboards(names: list[str]) -> dict[str, Any]:
    selected = names or list(DEMO_BLACKBOARDS.keys())
    return {name: DEMO_BLACKBOARDS.get(name, {}) for name in selected}


class Groot2WebHandler(SimpleHTTPRequestHandler):
    server_version = "Groot2Web/0.1"

    def __init__(self, *args: Any, directory: str | None = None, **kwargs: Any) -> None:
        super().__init__(*args, directory=directory or str(STATIC_DIR), **kwargs)

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("[groot2_web] " + fmt % args + "\n")

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api(parsed.path, parse_qs(parsed.query))
            return
        if parsed.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def _send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        code, body = _json_bytes(payload, status)
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_api(self, path: str, query: dict[str, list[str]]) -> None:
        try:
            if path == "/api/health":
                self._send_json(
                    {
                        "ok": True,
                        "pyzmq": zmq is not None,
                        "msgpack": msgpack is not None,
                        "static_dir": str(STATIC_DIR),
                    }
                )
                return

            host, port, demo = _target_from_query(query)
            timeout_ms = int(_query_value(query, "timeout_ms", "1200"))

            if path == "/api/fulltree":
                if demo:
                    self._send_json(
                        {
                            "ok": True,
                            "target": {"host": host, "port": port, "demo": True},
                            "reply": {"tree_uuid": "demo"},
                            "xml": DEMO_XML,
                        }
                    )
                    return
                reply, payload = Groot2Client(host, port, timeout_ms).request(REQUEST_FULLTREE)
                self._send_json(
                    {
                        "ok": True,
                        "target": {"host": host, "port": port, "demo": False},
                        "reply": reply,
                        "xml": payload.decode("utf-8", "replace"),
                    }
                )
                return

            if path == "/api/status":
                if demo:
                    self._send_json(
                        {
                            "ok": True,
                            "target": {"host": host, "port": port, "demo": True},
                            "reply": {"tree_uuid": "demo"},
                            "statuses": _demo_statuses(),
                        }
                    )
                    return
                reply, payload = Groot2Client(host, port, timeout_ms).request(REQUEST_STATUS)
                self._send_json(
                    {
                        "ok": True,
                        "target": {"host": host, "port": port, "demo": False},
                        "reply": reply,
                        "statuses": _parse_status_buffer(payload),
                    }
                )
                return

            if path == "/api/blackboard":
                blackboard_names = _blackboard_names_from_query(query)
                if demo:
                    self._send_json(
                        {
                            "ok": True,
                            "target": {"host": host, "port": port, "demo": True},
                            "reply": {"tree_uuid": "demo"},
                            "blackboards": _demo_blackboards(blackboard_names),
                            "requested": blackboard_names,
                        }
                    )
                    return
                if not blackboard_names:
                    raise ValueError("blackboards query parameter is required")
                reply, payload = Groot2Client(host, port, timeout_ms).request(
                    REQUEST_BLACKBOARD, [";".join(blackboard_names)]
                )
                self._send_json(
                    {
                        "ok": True,
                        "target": {"host": host, "port": port, "demo": False},
                        "reply": reply,
                        "blackboards": _decode_blackboard_payload(payload),
                        "requested": blackboard_names,
                    }
                )
                return

            self._send_json({"ok": False, "error": "unknown API route"}, HTTPStatus.NOT_FOUND)
        except (Groot2Error, OSError, ValueError, socket.error) as exc:
            self._send_json({"ok": False, "error": str(exc)}, HTTPStatus.BAD_GATEWAY)


def main() -> int:
    parser = argparse.ArgumentParser(description="Start a local web viewer for Groot2 publishers.")
    parser.add_argument("--bind", default="127.0.0.1", help="HTTP bind address")
    parser.add_argument("--port", type=int, default=8765, help="HTTP port")
    args = parser.parse_args()

    httpd = ThreadingHTTPServer((args.bind, args.port), Groot2WebHandler)
    url = f"http://{args.bind}:{args.port}"
    print(f"Groot2 web viewer: {url}")
    if zmq is None:
        print(
            "Warning: pyzmq is not installed. The page can open, but real Groot2 "
            "connections need python3-zmq or pyzmq.",
            file=sys.stderr,
        )
    if msgpack is None:
        print(
            "Warning: msgpack is not installed. Tree and status can work, but "
            "blackboard viewing needs the msgpack Python package.",
            file=sys.stderr,
        )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Groot2 web viewer")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
