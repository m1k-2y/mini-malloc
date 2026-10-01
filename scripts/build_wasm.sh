#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
EMCC_BIN="${EMCC:-emcc}"
command -v "$EMCC_BIN" >/dev/null || { echo 'emcc not found: activate Emscripten 4.0.20 first.' >&2; exit 1; }
mkdir -p dist
"$EMCC_BIN" -std=gnu11 -O2 -Wall -Wextra -Werror -Iinclude \
  wasm/heap_wasm.c wasm/wasm_bridge.c src/block.c src/malloc.c src/free.c \
  -sMEMORY64=2 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node \
  -sFILESYSTEM=0 -sDYNAMIC_EXECUTION=0 -sINITIAL_MEMORY=16777216 \
  -sEXPORTED_FUNCTIONS='["_mm_init","_mm_malloc","_mm_free","_mm_destroy","_mm_heap_start","_mm_heap_size","_mm_header_size","_mm_align","_mm_block_size"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o dist/minimalloc.mjs
cp visualizer/style.css visualizer/app.js dist/
cp wasm/backend.mjs wasm/wasm-entry.mjs dist/
python3 - <<'PY'
from pathlib import Path
html = Path('visualizer/index.html').read_text()
html = html.replace('<script src="app.js" defer></script>', '<script type="module" src="wasm-entry.mjs"></script>')
html = html.replace('로컬 C allocator의 실제 heap을 살펴봅니다.', '브라우저에서 실행하는 C/WASM allocator의 실제 heap을 살펴봅니다.')
Path('dist/index.html').write_text(html)
Path('dist/.nojekyll').touch()
PY
printf 'Pages files built in dist/\n'
