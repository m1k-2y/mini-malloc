# GitHub Pages / WebAssembly

## Build and run

Activate **Emscripten 4.0.20**, then run from the project root:

```sh
./scripts/build_wasm.sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open http://localhost:8080. `EMCC=/path/to/emcc ./scripts/build_wasm.sh` also works. The script resolves the project root from its own path, regardless of the current directory. Only `dist/` is deployed; it is generated and ignored by Git.

Official SDK setup (outside this repository):

```sh
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install 4.0.20
./emsdk activate 4.0.20
source ./emsdk_env.sh
```

## Architecture

- **Native/local**: Browser → HTTP/JSON → `visualizer/server.py` → ctypes → `build/libminimalloc.so`. Start with `python3 visualizer/server.py` as before.
- **Pages**: Browser → `wasm/backend.mjs` → exported C wrappers → unchanged `src/block.c`, `src/malloc.c`, `src/free.c` compiled to WASM.
- Both modes render with the existing `visualizer/app.js` and `style.css`. The static build changes only the HTML entry script. No Python, HTTP API, external service, cross-origin isolation, or npm runtime dependency is required on Pages.
- Each browser tab owns its own WASM instance. Reload creates a new 256 B heap. This differs from the local server's shared persistent heap across tabs.

### 16-byte header without changing core code

The original header contains two `size_t` fields, including a duplicate definition in `src/block.c`. Default wasm32 would shrink the header to 8 bytes. **`-sMEMORY64=2`** compiles the original C using the 64-bit ABI, then Binaryen lowers the memory operations to wasm32. Thus the existing header stays 16 bytes and modern wasm32 browsers can run the result. The bridge has compile-time assertions for both `sizeof(size_t)==8` and `sizeof(BlockHeader)==16`. No allocator core or public header is modified.

Emscripten 4.0.20 is pinned for reproducibility. This mode uses JS BigInt for reading the 64-bit header fields. See [Emscripten MEMORY64 documentation](https://emscripten.org/docs/tools_reference/settings_reference.html#memory64).

### Why a separate heap backend?

The unchanged `src/heap.c` was compiled and run under both Node/WASM and Chromium. Anonymous `mmap` and `malloc(17)` worked, but destruction left `heap_start` non-null and `heap_size=256`: the existing `destroy_heap()` calls `munmap()` twice, and Emscripten rejects the second call, taking the return path before globals are cleared.

The native file is preserved. `wasm/heap_wasm.c` implements the same `heap.h` interface with a **16-byte-aligned 1 MiB static region in WASM linear memory**, matching the existing UI limit. Init clears the requested region and sets heap bounds. Destroy clears those bounds. The reserved backing region lives until the WASM instance is released; no OS `mmap` is used. The compiled module has a fixed 16 MiB linear memory, no memory growth, and no filesystem runtime.

Reproduce the original backend probe (exit code **3** is the observed failure):

```sh
emcc -std=gnu11 -Wall -Wextra -Werror -Iinclude \
  wasm/mmap_probe.c src/heap.c src/block.c src/malloc.c src/free.c \
  -sMEMORY64=2 -sENVIRONMENT=node,web -sEXIT_RUNTIME=1 -o build/mmap_probe.js
node build/mmap_probe.js
```

With that build present, `TEST_MMAP_PROBE=1 node wasm/browser_test.mjs` also checks it in Chromium.

### Bridge and memory source of truth

`wasm_bridge.c` exports fixed-width wrappers: `mm_init`, `mm_malloc`, `mm_free`, `mm_destroy`, `mm_heap_start`, `mm_heap_size`, `mm_header_size`, `mm_align`, and `mm_block_size`. They call the existing C public API; they contain no first-fit, split, or coalescing implementation.

JS tracks only variable names, returned payload pointers, requested sizes and active flags. The snapshot walker uses `DataView.getBigUint64()` on actual WASM memory, extracts the size and allocation flag, validates bounds, then advances by the current block size. It skips obsolete headers after coalescing. Aligned requested sizes come from C `alignment()`. UI statistics sum that snapshot; changes/highlights compare snapshots. Errors and reset use the existing UI response envelope. There is no mock or fallback allocator.

## Tests

```sh
./scripts/test_native.sh
python3 visualizer/server_test.py
./scripts/build_wasm.sh
node wasm/wasm_test.mjs
```

`wasm_test.mjs` checks the actual WASM module: malloc(17), raw header 49, 48/32/176 layout, coalescing to 256, first-fit pointer reuse, 256→1024 reinitialization, zero/null, split thresholds, exact fit, command errors, and repeated resets.

For real browser tests, install test-only Playwright outside the repository or in an ignored build directory:

```sh
npm install --prefix build/browser playwright@1.56.1
./build/browser/node_modules/.bin/playwright install --with-deps chromium
PLAYWRIGHT_MODULE="$PWD/build/browser/node_modules/playwright" node wasm/browser_test.mjs
```

The browser test starts its own temporary loopback static server, loads the site under `/mini-malloc/`, checks scenarios A–D through the actual UI, asserts zero `/api/` requests and no browser errors, verifies small block label suppression, and writes desktop/mobile screenshots to `build/`. It does not require the Python bridge.

## GitHub Pages

1. Commit the source changes (not `build/` or `dist/`) and push to `main`.
2. In repository **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**.
3. In **Actions**, run **Build and deploy WASM visualizer** manually if needed. Subsequent pushes to `main` run it automatically.
4. If an existing `github-pages` environment restricts deployments, allow `main` under its branch rules.

The workflow checks out the official emsdk at a fixed revision, installs Emscripten 4.0.20, runs native/Python/WASM/Chromium tests, builds and uploads only `dist/`, and deploys after success. Build has only `contents: read`; deploy has only `pages: write` and `id-token: write`. No PAT or other repository secret is needed.

Expected URL for this repository: **https://m1k-2y.github.io/mini-malloc/**. General project URL: `https://<owner>.github.io/<repository>/`. Assets are relative, so repository subpaths work.

Workflow execution on GitHub requires committing/pushing the workflow and enabling Pages; local tests do not constitute a remote deployment. See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
