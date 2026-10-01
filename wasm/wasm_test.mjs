import assert from 'node:assert/strict';
import { createBackend } from '../dist/backend.mjs';

const backend = await createBackend();
const module = backend.module;
const command = text => {
  const result = backend.request('/api/command', { command: text });
  assert.equal(result.ok, true, result.message);
  return result.state;
};
const sizes = state => state.blocks.map(block => block.total_size);
let state = command('void *a = malloc(17);');
let block = state.blocks[0];
assert.deepEqual([block.requested_size, block.aligned_payload_size, block.header_size, block.total_size, block.size_and_flag], [17, 32, 16, 48, 49]);
assert.deepEqual(sizes(state), [48, 208]);
assert.equal(module._mm_block_size(module._mm_heap_start()), 48);
assert.equal(new DataView(module.HEAPU8.buffer).getBigUint64(module._mm_heap_start(), true), 49n);
assert.equal(backend.variables.get('a').pointer, module._mm_heap_start() + 16);
console.log('A PASS: C/WASM malloc(17): aligned=32 header=16 total=48 raw=49 free=208');
state = command('void *b = malloc(16);');
assert.deepEqual(sizes(state), [48, 32, 176]);
state = command('free(a);');
assert.deepEqual(state.blocks.map(b => [b.total_size, b.allocated]), [[48, false], [32, true], [176, false]]);
state = command('free(b);');
assert.deepEqual(sizes(state), [256]);
assert.equal(state.blocks[0].size_and_flag, 256);
console.log('B PASS: real coalescing → one FREE 256 B block');
backend.init(256);
for (const name of ['a', 'b', 'c']) command(`void *${name} = malloc(16);`);
const oldPointer = backend.variables.get('b').pointer;
command('free(b);');
command('void *d = malloc(16);');
assert.equal(backend.variables.get('d').pointer, oldPointer);
console.log('C PASS: first-fit reuse, b and d payload pointers are identical');
backend.init(1024);
assert.equal(backend.variables.size, 0);
assert.deepEqual(sizes(backend.state()), [1024]);
assert.equal(backend.state().blocks[0].allocated, false);
console.log('D PASS: reinitialize 256 → 1024, clean C heap and variable table');
for (const [heap, request, expected, fragmentation] of [[64, 32, [64], 16], [80, 32, [48, 32], 0], [32, 16, [32], 0]]) {
  backend.init(heap);
  state = command(`void *x = malloc(${request});`);
  assert.deepEqual(sizes(state), expected);
  assert.equal(state.blocks[0].internal_fragmentation, fragmentation);
}
backend.init(256);
assert.equal(module._mm_malloc(0), 0);
module._mm_free(0);
for (const input of ['void *x = malloc(0);', 'void *x = malloc(257);', 'void *x = malloc(99999999999999999999999);', 'free(missing);', 'void *1x = malloc(1);', 'free(x); extra']) {
  const before = backend.state();
  assert.equal(backend.request('/api/command', { command: input }).ok, false);
  assert.deepEqual(backend.state(), before);
}
command('void *x = malloc(17);');
assert.equal(backend.request('/api/command', {command: 'void *x = malloc(1);'}).ok, false);
command('free(x);');
assert.equal(backend.request('/api/command', {command: 'free(x);'}).ok, false);
command('exit;');
assert.deepEqual(backend.state().blocks, []);
assert.equal(backend.request('/api/reset', {}).ok, true);
for (let i = 0; i < 200; i++) {
  backend.init(i % 2 ? 17 : 1024);
  assert.deepEqual(sizes(backend.state()), [i % 2 ? 32 : 1024]);
}
console.log('PASS: zero/null, split thresholds, exact fit, errors, exit/reset, 200 reinitializations');
