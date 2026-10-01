#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
mkdir -p build
flags=(-std=gnu11 -Wall -Wextra -Werror -Iinclude)
core=(src/heap.c src/block.c src/malloc.c src/free.c)
gcc "${flags[@]}" tests/block_test.c src/block.c -o build/block_test
gcc "${flags[@]}" tests/allocator_test.c "${core[@]}" -o build/allocator_test
gcc "${flags[@]}" tests/edge_test.c "${core[@]}" -o build/edge_test
gcc "${flags[@]}" src/main.c "${core[@]}" -o build/mini_malloc
build/block_test
build/allocator_test
build/edge_test
