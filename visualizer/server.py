#!/usr/bin/env python3
"""Local HTTP bridge. All allocation and coalescing happen in libminimalloc.so."""
import argparse
import ctypes as C
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "visualizer"
LIBRARY = ROOT / "build" / "libminimalloc.so"
MAX_HEAP = 1024 * 1024
MAX_VARIABLES = 100
SIZE_MAX = C.c_size_t(-1).value
NAME = r"([A-Za-z_][A-Za-z0-9_]{0,30})"
MALLOC = re.compile(r"void\s*\*\s*" + NAME + r"\s*=\s*malloc\s*\(\s*([0-9]+)\s*\)\s*;", re.ASCII)
FREE = re.compile(r"free\s*\(\s*" + NAME + r"\s*\)\s*;", re.ASCII)


class BlockHeader(C.Structure):
    # Native ABI, matching block.h (two size_t fields).
    _fields_ = [("size_and_flag", C.c_size_t), ("padding", C.c_size_t)]


HEADER_SIZE = C.sizeof(BlockHeader)


def build_library():
    # Fixed arguments; no shell, and no request data ever reaches this command.
    # Replace atomically so an existing server's mapped library is not truncated.
    LIBRARY.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".build-", dir=LIBRARY.parent) as directory:
        output = Path(directory) / "libminimalloc.so"
        subprocess.run([
            "gcc", "-std=gnu11", "-Wall", "-Wextra", "-Werror", "-shared", "-fPIC",
            "-Iinclude", "src/heap.c", "src/block.c", "src/malloc.c", "src/free.c",
            "-o", str(output)
        ], cwd=ROOT, check=True)
        output.replace(LIBRARY)
    return LIBRARY


class AllocatorBridge:
    """One C heap per server. The HTTP server serializes all access to it."""
    def __init__(self, library):
        self.lib = C.CDLL(str(library))
        pointer = C.POINTER(BlockHeader)
        signatures = {
            "alignment": ([C.c_size_t], C.c_size_t),
            "allocate_heap_region": ([C.c_size_t], C.c_void_p),
            "init_block_header": ([C.c_void_p, C.c_size_t], None),
            "destroy_heap": ([], None),
            "mini_malloc": ([C.c_size_t], C.c_void_p),
            "mini_free": ([C.c_void_p], None),
            "get_block_size": ([pointer], C.c_size_t),
            "is_allocated": ([pointer], C.c_int),
        }
        for name, (args, result) in signatures.items():
            function = getattr(self.lib, name)
            function.argtypes = args
            function.restype = result
        if HEADER_SIZE != 16:
            raise RuntimeError("This visualizer requires the project's 16-byte BlockHeader ABI.")
        self.variables = {}
        self.initial_size = 256
        self.active = False

    def close(self):
        self.lib.destroy_heap()
        self.variables.clear()
        self.active = False

    def init(self, size):
        if type(size) is not int or not 1 <= size <= MAX_HEAP:
            raise ValueError(f"heap_size must be an integer between 1 and {MAX_HEAP}.")
        aligned = self.lib.alignment(size)
        if aligned < HEADER_SIZE:
            raise ValueError("Heap is too small for BlockHeader.")
        self.close()
        address = self.lib.allocate_heap_region(aligned)
        if not address:
            raise ValueError("Heap allocation failed.")
        self.lib.init_block_header(address, aligned)
        self.initial_size = aligned
        self.active = True
        return f"C heap initialized · {aligned} B"

    def command(self, command):
        if not isinstance(command, str) or len(command) > 255 or "\n" in command or "\r" in command:
            raise ValueError("Invalid command.")
        if not self.active:
            raise ValueError("Heap is destroyed. Reset heap to start again.")
        command = command.strip()
        if command == "exit;":
            self.close()
            return "C heap destroyed. Reset heap to start again."
        match = MALLOC.fullmatch(command)
        if match:
            name, number = match.groups()
            requested = int(number)
            if requested > SIZE_MAX:
                raise ValueError("Invalid command.")
            if name in self.variables:
                raise ValueError("Variable already exists.")
            if len(self.variables) >= MAX_VARIABLES:
                raise ValueError("Variable table is full.")
            # The existing C API does not guard size_t overflow internally.
            if requested > SIZE_MAX - 15 - HEADER_SIZE:
                raise ValueError("allocation failed")
            address = self.lib.mini_malloc(requested)
            if not address:
                raise ValueError("allocation failed")
            self.variables[name] = {"pointer": address, "requested": requested, "active": True}
            start = C.c_void_p.in_dll(self.lib, "heap_start").value
            return f"{name} = heap_start + {address - start} · {requested} B requested (C mini_malloc)"
        match = FREE.fullmatch(command)
        if match:
            name = match[1]
            entry = self.variables.get(name)
            if not entry or not entry["active"]:
                raise ValueError("Variable does not exist or is already freed.")
            self.lib.mini_free(entry["pointer"])
            entry["active"] = False
            entry["pointer"] = None
            return f"{name} freed. (C mini_free)"
        raise ValueError("Invalid command.")

    def state(self):
        start = C.c_void_p.in_dll(self.lib, "heap_start").value
        end = C.c_void_p.in_dll(self.lib, "heap_end").value
        size = C.c_size_t.in_dll(self.lib, "heap_size").value
        blocks = []
        if self.active:
            if not start or not end or end - start != size:
                raise RuntimeError("Invalid C heap bounds.")
            active = {entry["pointer"]: (name, entry) for name, entry in self.variables.items() if entry["active"]}
            address = start
            while address < end:
                # Validate the address before reading the native header.
                if end - address < HEADER_SIZE or (address - start) % 16:
                    raise RuntimeError("Invalid C header address.")
                header = C.cast(address, C.POINTER(BlockHeader))
                total = self.lib.get_block_size(header)
                allocated = bool(self.lib.is_allocated(header))
                if total < HEADER_SIZE or total % 16 or total > end - address:
                    raise RuntimeError("Invalid C block size.")
                entry = active.get(address + HEADER_SIZE)
                if allocated != (entry is not None):
                    raise RuntimeError("C heap and variable table disagree.")
                variable, record = entry if entry else (None, None)
                requested = record["requested"] if record else None
                aligned = self.lib.alignment(requested) if record else None
                capacity = total - HEADER_SIZE
                blocks.append({
                    "offset": address - start, "total_size": total, "allocated": allocated,
                    "variable": variable, "requested_size": requested,
                    "aligned_payload_size": aligned, "header_size": HEADER_SIZE,
                    "payload_capacity": capacity,
                    "internal_fragmentation": capacity - requested if record else None,
                    "alignment_padding": aligned - requested if record else None,
                    "unsplit_remainder": capacity - aligned if record else None,
                    "size_and_flag": header.contents.size_and_flag,
                    "allocation_flag": header.contents.size_and_flag & 1,
                })
                # Always follow the CURRENT block size, skipping stale coalesced headers.
                address += total
        else:
            size = 0
        used = [block for block in blocks if block["allocated"]]
        stats = {
            "used": sum(block["total_size"] for block in used),
            "requested": sum(block["requested_size"] for block in used),
            "usedHeaders": sum(block["header_size"] for block in used),
            "headers": sum(block["header_size"] for block in blocks),
            "fragmentation": sum(block["internal_fragmentation"] for block in used),
            "free": sum(block["total_size"] for block in blocks if not block["allocated"]),
        }
        return {"heap_size": size, "initial_heap_size": self.initial_size,
                "active": self.active, "source": "c-allocator", "blocks": blocks, "stats": stats}


class VisualizerServer(HTTPServer):
    # Deliberately single-threaded: the C globals are not thread-safe.
    def __init__(self, address, bridge):
        self.bridge = bridge
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(5)

    def respond(self, status, body, content_type="application/json; charset=utf-8"):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(body)

    def local_request(self):
        port = self.server.server_port
        hosts = {f"localhost:{port}", f"127.0.0.1:{port}"}
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if host not in hosts or (origin is not None and origin != f"http://{host}"):
            self.respond(403, {"ok": False, "message": "Local same-origin requests only."})
            return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path == "/api/state":
            self.api_response("State read from C heap.")
            return
        # Serve only the UI assets, never Python sources or arbitrary files.
        assets = {"/": ("index.html", "text/html; charset=utf-8"),
                  "/index.html": ("index.html", "text/html; charset=utf-8"),
                  "/style.css": ("style.css", "text/css; charset=utf-8"),
                  "/app.js": ("app.js", "text/javascript; charset=utf-8")}
        if path not in assets:
            self.respond(404, {"ok": False, "message": "Not found."})
            return
        filename, content_type = assets[path]
        self.respond(200, (WEB / filename).read_bytes(), content_type)

    def api_response(self, message, status=200):
        try:
            state = self.server.bridge.state()
        except RuntimeError as error:
            self.respond(500, {"ok": False, "message": str(error)})
            return
        self.respond(status, {"ok": status == 200, "message": message, "state": state})

    def do_POST(self):
        if not self.local_request():
            return
        path = urlsplit(self.path).path
        if path not in {"/api/init", "/api/command", "/api/reset"}:
            self.respond(404, {"ok": False, "message": "Not found."})
            return
        if self.headers.get_content_type() != "application/json":
            self.respond(415, {"ok": False, "message": "Content-Type must be application/json."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= 4096 or self.headers.get("Transfer-Encoding"):
                raise ValueError("Invalid request length (maximum 4096 bytes).")
            data = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object.")
            bridge = self.server.bridge
            if path == "/api/init":
                message = bridge.init(data.get("heap_size"))
            elif path == "/api/reset":
                message = bridge.init(bridge.initial_size)
            else:
                message = bridge.command(data.get("command"))
        except (ValueError, UnicodeError) as error:
            self.api_response(str(error), 400)
            return
        self.api_response(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    bridge = None
    try:
        bridge = AllocatorBridge(build_library())
        bridge.init(256)
        with VisualizerServer(("127.0.0.1", args.port), bridge) as server:
            print(f"Real C allocator ready: http://localhost:{server.server_port}", flush=True)
            server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except (OSError, RuntimeError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Cannot start visualizer: {error}\n")
    finally:
        if bridge:
            bridge.close()


if __name__ == "__main__":
    main()
