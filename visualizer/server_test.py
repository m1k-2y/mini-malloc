"""Integration checks against the real shared library and HTTP API."""
import ctypes as C
import http.client
import json
from pathlib import Path
import shutil
import subprocess
import threading
import unittest

from server import AllocatorBridge, BlockHeader, Handler, VisualizerServer, build_library


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class BridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bridge = AllocatorBridge(build_library())
        cls.server = VisualizerServer(("127.0.0.1", 0), cls.bridge)
        cls.server.RequestHandlerClass = QuietHandler
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()
        cls.server.server_close()
        cls.bridge.close()

    def request(self, path, data=None, method=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        body = json.dumps(data) if data is not None else None
        connection.request(method or ("POST" if data is not None else "GET"), path, body,
                           headers or ({"Content-Type": "application/json"} if body else {}))
        response = connection.getresponse()
        status, payload = response.status, json.loads(response.read())
        connection.close()
        return status, payload

    def setUp(self):
        self.assertEqual(self.request("/api/init", {"heap_size": 256})[0], 200)

    def command(self, text):
        status, body = self.request("/api/command", {"command": text})
        self.assertEqual(status, 200, body)
        return body["state"]

    def test_malloc_17_reads_native_header(self):
        state = self.command("void *a = malloc(17);")
        block, free = state["blocks"]
        self.assertEqual([block[k] for k in ("requested_size", "aligned_payload_size", "header_size", "total_size", "allocation_flag", "size_and_flag")], [17, 32, 16, 48, 1, 49])
        self.assertEqual(free["total_size"], 208)
        self.assertEqual(block["internal_fragmentation"], 15)
        start = C.c_void_p.in_dll(self.bridge.lib, "heap_start").value
        actual_pointer = self.bridge.variables["a"]["pointer"]
        self.assertEqual(actual_pointer, start + 16)
        native = C.cast(actual_pointer - 16, C.POINTER(BlockHeader))
        self.assertEqual(native.contents.size_and_flag, 49)
        self.assertEqual(self.bridge.lib.get_block_size(native), block["total_size"])
        self.assertEqual(self.bridge.lib.is_allocated(native), 1)
        print("\nNative malloc(17): requested=17 aligned=32 header=16 total=48 flag=1 raw=49 free=208")

    def test_coalescing_and_stale_headers(self):
        for command, expected in [
            ("void *a = malloc(32);", [48, 208]),
            ("void *b = malloc(16);", [48, 32, 176]),
            ("free(a);", [48, 32, 176]),
            ("free(b);", [256]),
        ]:
            state = self.command(command)
            self.assertEqual([block["total_size"] for block in state["blocks"]], expected)
            print(f"\nC snapshot {command}: {expected}")
            if command == "free(a);":
                self.assertEqual([block["allocated"] for block in state["blocks"]], [False, True, False])
        self.assertEqual(state["blocks"][0]["size_and_flag"], 256)
        start = C.c_void_p.in_dll(self.bridge.lib, "heap_start").value
        self.assertEqual(BlockHeader.from_address(start).size_and_flag, 256)
        self.assertEqual(len(state["blocks"]), 1)  # +48 and +80 are no longer live headers.
        self.assertFalse(self.bridge.variables["b"]["active"])

    def test_alignment_split_and_first_fit(self):
        self.request("/api/init", {"heap_size": 65})
        state = self.command("void *a = malloc(32);")
        self.assertEqual([b["total_size"] for b in state["blocks"]], [48, 32])
        self.request("/api/init", {"heap_size": 64})
        block = self.command("void *a = malloc(32);")["blocks"][0]
        self.assertEqual((block["total_size"], block["unsplit_remainder"], block["internal_fragmentation"]), (64, 16, 16))
        self.request("/api/init", {"heap_size": 256})
        for command in ["void *a = malloc(16);", "void *b = malloc(16);", "void *c = malloc(16);", "free(b);", "void *d = malloc(16);"]:
            state = self.command(command)
        self.assertEqual(next(b["offset"] for b in state["blocks"] if b["variable"] == "d"), 32)

    def test_command_errors_do_not_mutate_heap(self):
        self.command("void *a = malloc(17);")
        self.command("free(a);")
        before = self.request("/api/state")[1]["state"]
        for command in ["free(a);", "free(missing);", "void *a = malloc(1);", "void *x = malloc(0);", "void *x = malloc(257);", "void *x = malloc(18446744073709551615);", "void *1x = malloc(1);", "void *x = malloc(-1);", "free(a); trailing", "exit;\nfree(a);", "x" * 256, None, "$(touch /tmp/not-executed)"]:
            with self.subTest(command=command):
                status, payload = self.request("/api/command", {"command": command})
                self.assertEqual(status, 400)
                self.assertEqual(payload["state"], before)

    def test_reset_exit_and_reload(self):
        self.request("/api/init", {"heap_size": 513})
        self.command("void *a = malloc(17);")
        self.assertEqual(self.request("/api/state")[1]["state"]["blocks"][0]["variable"], "a")
        state = self.request("/api/reset", {})[1]["state"]
        self.assertEqual(state["heap_size"], 528)
        self.assertEqual(len(state["blocks"]), 1)
        self.command("void *a = malloc(17);")
        state = self.command("exit;")
        self.assertEqual(state["blocks"], [])
        self.assertEqual(state["heap_size"], 0)
        self.assertIsNone(C.c_void_p.in_dll(self.bridge.lib, "heap_start").value)
        self.assertEqual(self.request("/api/command", {"command": "free(a);"})[0], 400)
        self.assertEqual(self.request("/api/reset", {})[1]["state"]["heap_size"], 528)

    def test_heap_configuration_presets(self):
        for size in (128, 256, 512, 1024):
            with self.subTest(heap_size=size):
                self.command("void *old = malloc(17);")
                status, initialized = self.request("/api/init", {"heap_size": size})
                self.assertEqual(status, 200)
                status, result = self.request("/api/state")
                self.assertEqual(status, 200)
                state = result["state"]
                self.assertEqual(state, initialized["state"])
                self.assertEqual(state["heap_size"], size)
                self.assertEqual(len(state["blocks"]), 1)
                block = state["blocks"][0]
                self.assertEqual(block["total_size"], size)
                self.assertFalse(block["allocated"])
                self.assertEqual(block["payload_capacity"], size - 16)
                self.assertEqual(self.bridge.variables, {})
                start = C.c_void_p.in_dll(self.bridge.lib, "heap_start").value
                self.assertEqual(BlockHeader.from_address(start).size_and_flag, size)
                print(f"\nConfiguration {size} B: /api/state heap_size={size}, free total_size={size}, payload={size - 16}")
        for requested, aligned in ((17, 32), (1, 16)):
            status, result = self.request("/api/init", {"heap_size": requested})
            self.assertEqual(status, 200)
            self.assertEqual(result["state"]["heap_size"], aligned)
            self.assertEqual(result["state"]["blocks"][0]["total_size"], aligned)

    def test_table_limit(self):
        self.request("/api/init", {"heap_size": 4096})
        for i in range(100):
            self.command(f"void *v{i} = malloc(1);")
        status, result = self.request("/api/command", {"command": "void *extra = malloc(1);"})
        self.assertEqual(status, 400)
        self.assertIn("table is full", result["message"])

    def test_bad_requests_and_origin(self):
        for size in [0, -1, True, "256", 1.5, 1048577, None]:
            self.assertEqual(self.request("/api/init", {"heap_size": size})[0], 400)
        self.assertEqual(self.request("/api/command", ["bad"])[0], 400)
        self.assertEqual(self.request("/api/reset", {}, headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request("/api/reset", {}, headers={"Content-Type": "application/json", "Origin": "http://evil.example"})[0], 403)
        self.assertEqual(self.request("/api/state", headers={"Host": "evil.example"})[0], 403)
        for path in ["/server.py", "/../heap.c", "/api/unknown"]:
            self.assertEqual(self.request(path)[0], 404)

    @unittest.skipUnless(shutil.which("node"), "Node is only needed for the UI integration test")
    def test_ui_against_real_http_api(self):
        subprocess.run(["node", str(Path(__file__).with_name("app.test.js")),
                        f"http://127.0.0.1:{self.server.server_port}"], check=True, timeout=20)


if __name__ == "__main__":
    unittest.main(verbosity=2)
