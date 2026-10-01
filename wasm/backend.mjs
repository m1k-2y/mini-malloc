import createModule from './minimalloc.mjs';

// Only variable names/requested sizes are kept in JS. Block layout belongs to C.
export async function createBackend(options = {}) {
  const module = await createModule(options);
  const backend = new WasmBackend(module);
  backend.init(256);
  return backend;
}

export class WasmBackend {
  constructor(module) {
    this.module = module;
    this.variables = new Map();
    this.initialSize = 256;
    if (module._mm_header_size() !== 16) throw new Error('Unexpected C header ABI.');
  }

  init(size) {
    if (!Number.isSafeInteger(size) || size < 1 || size > 1048576) {
      throw new Error('heap_size must be an integer between 1 and 1048576.');
    }
    if (!this.module._mm_init(size)) throw new Error('Heap allocation failed.');
    this.variables.clear();
    this.initialSize = this.module._mm_heap_size();
    return `C/WASM heap initialized · ${this.initialSize} B`;
  }

  command(command) {
    if (typeof command !== 'string' || command.length > 255 || /[\r\n]/.test(command)) {
      throw new Error('Invalid command.');
    }
    if (!this.module._mm_heap_start()) throw new Error('Heap is destroyed. Initialize heap to start again.');
    command = command.trim();
    if (command === 'exit;') {
      this.module._mm_destroy();
      this.variables.clear();
      return 'C/WASM heap destroyed. Initialize heap to start again.';
    }
    const allocation = /^void\s*\*\s*([A-Za-z_][A-Za-z0-9_]{0,30})\s*=\s*malloc\s*\(\s*([0-9]+)\s*\)\s*;$/.exec(command);
    if (allocation) {
      const [, name, number] = allocation;
      const requested = Number(number);
      if (this.variables.has(name)) throw new Error('Variable already exists.');
      if (this.variables.size >= 100) throw new Error('Variable table is full.');
      if (!Number.isSafeInteger(requested) || requested > 1048576) throw new Error('allocation failed');
      const pointer = this.module._mm_malloc(requested);
      if (!pointer) throw new Error('allocation failed');
      this.variables.set(name, { pointer, requested, active: true });
      return `${name} = heap_start + ${pointer - this.module._mm_heap_start()} · ${requested} B requested (C/WASM mini_malloc)`;
    }
    const release = /^free\s*\(\s*([A-Za-z_][A-Za-z0-9_]{0,30})\s*\)\s*;$/.exec(command);
    if (release) {
      const entry = this.variables.get(release[1]);
      if (!entry?.active) throw new Error('Variable does not exist or is already freed.');
      this.module._mm_free(entry.pointer);
      entry.active = false;
      entry.pointer = null;
      return `${release[1]} freed. (C/WASM mini_free)`;
    }
    throw new Error('Invalid command.');
  }

  state() {
    const module = this.module;
    const start = module._mm_heap_start();
    const heapSize = module._mm_heap_size();
    const headerSize = module._mm_header_size();
    const memory = new DataView(module.HEAPU8.buffer);
    const active = new Map([...this.variables].filter(([, entry]) => entry.active)
      .map(([name, entry]) => [entry.pointer, { name, ...entry }]));
    const blocks = [];
    if (start + heapSize > memory.byteLength) throw new Error('Invalid C heap bounds.');
    for (let offset = 0; offset < heapSize;) {
      if (!start || offset % 16 || heapSize - offset < headerSize) throw new Error('Invalid C header address.');
      // Two native 64-bit size_t fields, preserved with MEMORY64=2.
      const raw = memory.getBigUint64(start + offset, true);
      const total = Number(raw & ~1n);
      const allocated = (raw & 1n) === 1n;
      if (total < headerSize || total % 16 || total > heapSize - offset) throw new Error('Invalid C block size.');
      const entry = active.get(start + offset + headerSize);
      if (allocated !== Boolean(entry)) throw new Error('C heap and variable table disagree.');
      const requested = entry?.requested ?? null;
      const aligned = entry ? module._mm_align(requested) : null;
      const capacity = total - headerSize;
      blocks.push({ offset, total_size: total, allocated, variable: entry?.name ?? null,
        requested_size: requested, aligned_payload_size: aligned, header_size: headerSize,
        payload_capacity: capacity, internal_fragmentation: entry ? capacity - requested : null,
        alignment_padding: entry ? aligned - requested : null,
        unsplit_remainder: entry ? capacity - aligned : null,
        size_and_flag: Number(raw), allocation_flag: Number(raw & 1n) });
      offset += total; // Follow real headers, never stale headers left by coalescing.
    }
    const used = blocks.filter(block => block.allocated);
    const sum = (items, field) => items.reduce((total, item) => total + item[field], 0);
    return { source: 'c-allocator', transport: 'wasm', active: Boolean(start),
      heap_size: heapSize, initial_heap_size: this.initialSize, blocks,
      stats: { used: sum(used, 'total_size'), requested: sum(used, 'requested_size'),
        usedHeaders: sum(used, 'header_size'), headers: sum(blocks, 'header_size'),
        fragmentation: sum(used, 'internal_fragmentation'),
        free: sum(blocks.filter(block => !block.allocated), 'total_size') } };
  }

  // Same response envelope as the Python API; no HTTP requests in Pages mode.
  request(path, body) {
    let message;
    try {
      if (path === '/api/state') message = 'State read from C/WASM heap.';
      else if (path === '/api/init') message = this.init(body?.heap_size);
      else if (path === '/api/reset') message = this.init(this.initialSize);
      else if (path === '/api/command') message = this.command(body?.command);
      else throw new Error('Unknown operation.');
      return { ok: true, message, state: this.state() };
    } catch (error) {
      return { ok: false, message: error.message, state: this.state() };
    }
  }
}
