"use strict";
// Real HTTP/C backend, with a minimal DOM double for rendering assertions.
const assert = require("node:assert/strict");
const { mountVisualizer } = require("./app.js");
const base = process.argv[2] || "http://127.0.0.1:8000";
const nativeFetch = global.fetch;
global.fetch = (path, options) => nativeFetch(new URL(path, base), options);
class Element {
  constructor() {
    this.children = []; this.style = {}; this.dataset = {}; this.attributes = {};
    this.handlers = {}; this.value = ""; this.textContent = "";
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  focus() {}
}
async function main() {
  await fetch("/api/init", { method: "POST", headers: {"Content-Type": "application/json"}, body: '{"heap_size":256}' });
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const presets = [128, 256, 512, 1024].map(size => {
    const button = new Element();
    button.dataset.heapSize = String(size);
    return button;
  });
  global.document = { getElementById: get, createElement: () => new Element(),
    querySelectorAll: selector => selector === "[data-heap-size]" ? presets : [] };
  global.confirm = () => true;
  const text = node => [node.textContent, ...node.children.map(text)].join(" ");
  const submit = async command => { get("command").value = command; await get("command-form").handlers.submit({ preventDefault() {} }); };
  const reset = () => get("reset").handlers.click();
  await mountVisualizer();
  assert.equal(get("connection-status").textContent, "● REAL C ALLOCATOR");
  assert.equal(get("header-bytes").textContent, "16 B");
  const configure = () => get("heap-form").handlers.submit({ preventDefault() {} });
  for (const preset of presets) {
    preset.handlers.click();
    assert.equal(get("heap-size-input").value, preset.dataset.heapSize);
    await configure();
    const size = Number(preset.dataset.heapSize);
    const response = await (await fetch("/api/state")).json();
    assert.equal(response.state.heap_size, size);
    assert.equal(response.state.blocks[0].total_size, size);
    assert.equal(get("heap-size").textContent, `${size} B`);
    assert.match(text(get("block-detail")), new RegExp(`free payload capacity ${size - 16} B`));
  }
  get("heap-size-input").value = "17";
  await configure();
  assert.equal(get("heap-size-input").value, "17");
  assert.equal(get("heap-size").textContent, "32 B");
  assert.match(get("heap-config-status").textContent, /입력 17 B → 실제 heap 32 B.*alignment/);
  for (const invalid of ["0", "-1", "abc", "", "1.5", "1048577"]) {
    get("heap-size-input").value = invalid;
    await configure();
    assert.equal(get("heap-size").textContent, "32 B");
    assert.equal(get("heap-size-input").attributes["aria-invalid"], "true");
  }
  get("heap-size-input").value = "256";
  await configure();
  await submit("void *old = malloc(17);");
  let confirmations = 0;
  global.confirm = message => { confirmations++; assert.match(message, /allocation 1개/); return false; };
  get("heap-size-input").value = "512";
  await configure();
  assert.equal(confirmations, 1);
  assert.equal(get("heap-size").textContent, "256 B");
  assert.equal(get("used-bytes").textContent, "48 B");
  // Presets never initialize the heap themselves.
  presets[0].handlers.click();
  assert.equal(get("heap-size").textContent, "256 B");
  global.confirm = () => true;
  await configure();
  assert.equal(get("heap-size").textContent, "128 B");
  assert.equal(get("used-bytes").textContent, "0 B");
  await submit("free(old);");
  assert.match(text(get("terminal-log")), /does not exist/);
  await submit("void *old = malloc(17);");
  assert.equal(get("used-bytes").textContent, "48 B");
  get("heap-size-input").value = "256";
  await configure();
  console.log("PASS heap configuration: presets, 17 → 32, invalid input, confirmation/cancel, variable reset");
  for (const [command, used, free, sizes] of [
    ["void *a = malloc(32);", 48, 208, [48, 208]],
    ["void *b = malloc(16);", 80, 176, [48, 32, 176]],
    ["free(a);", 32, 224, [48, 32, 176]],
    ["free(b);", 0, 256, [256]]
  ]) {
    await submit(command);
    assert.equal(get("used-bytes").textContent, `${used} B`);
    assert.equal(get("free-bytes").textContent, `${free} B`);
    assert.deepEqual(get("block-table").children.map(row => row.children[6].textContent), sizes.map(size => `${size} B`));
    assert.ok(get("heap-map").children.some(tile => tile.classList.contains("changed")));
  }
  assert.match(text(get("terminal-log")), /Merged adjacent free blocks at \+0.*\+48.*\+80/);
  await reset();
  await submit("void *x = malloc(17);");
  assert.equal(get("requested-bytes").textContent, "17 B");
  assert.equal(get("fragmentation-bytes").textContent, "15 B");
  assert.equal(get("header-bytes").textContent, "32 B");
  assert.deepEqual(get("block-table").children[0].children.map(cell => cell.textContent),
    ["x", "USED", "+0 → +48", "17 B", "32 B", "16 B", "48 B", "15 B"]);
  assert.deepEqual(get("block-table").children[1].children.map(cell => cell.textContent),
    ["—", "FREE", "+48 → +256", "—", "—", "16 B", "208 B", "—"]);
  assert.equal(get("heap-map").children[0].style.width, "18.75%");
  assert.equal(get("heap-map").children[0].children[1].children[0].style.width, `${16 / 48 * 100}%`);
  assert.match(text(get("block-detail")), /size_and_flag = 49.*LSB = 1/);
  get("heap-map").children[1].handlers.click();
  assert.match(text(get("block-detail")), /free payload capacity 192 B/);
  // Reload reads the existing native heap rather than initializing another heap.
  await mountVisualizer();
  assert.equal(get("used-bytes").textContent, "48 B");
  await submit("free(x);");
  await submit("free(x);");
  assert.match(text(get("terminal-log")), /already freed/);
  assert.equal(get("used-bytes").textContent, "0 B");
  await submit("exit;");
  assert.equal(get("heap-map").children.length, 0);
  assert.equal(get("heap-size").textContent, "0 B");
  await reset();
  assert.equal(get("heap-size").textContent, "256 B");
  get("heap-size-input").value = "1024";
  await configure();
  await submit("void *a = malloc(32);");
  await submit("void *b = malloc(16);");
  const tiles = get("heap-map").children;
  assert.deepEqual(tiles.map(tile => tile.style.width), ["4.6875%", "3.125%", "92.1875%"]);
  assert.deepEqual(get("block-table").children.map(row => row.children[6].textContent), ["48 B", "32 B", "944 B"]);
  for (const [tile, size] of tiles.map((tile, index) => [tile, [48, 32, 944][index]])) {
    const [header, payload] = tile.children[1].children;
    assert.equal(header.style.width, `${16 / size * 100}%`);
    assert.equal(payload.style.width, `${(size - 16) / size * 100}%`);
    for (const field of ["Variable:", "State:", "Requested:", "Aligned payload:", "Header:", "Total block:", "Offset:"]) {
      assert.ok(tile.title.includes(field));
      assert.ok(header.title.includes(field));
    }
    assert.equal(header.children[1].className, "header-size");
    assert.equal(payload.children[1].className, "payload-state");
  }
  tiles[0].handlers.click();
  assert.equal(get("block-table").children[0].attributes["data-selected"], "true");
  assert.equal(get("block-table").children[1].attributes["data-selected"], "false");
  assert.match(text(get("block-detail")), /a · heap_start \+ 0 → \+48/);
  tiles[1].handlers.click();
  assert.equal(get("block-table").children[1].attributes["data-selected"], "true");
  assert.match(text(get("block-detail")), /b · heap_start \+ 48 → \+80/);
  console.log("PASS 1024 B labeling: 48/32/944 B proportions, full tooltip data, selected row/detail");
  await reset();
  // Connection failure must not produce an invented allocation or change the view.
  global.fetch = async () => { throw new Error("connection lost"); };
  await submit("void *lost = malloc(17);");
  assert.equal(get("connection-status").textContent, "● DISCONNECTED");
  assert.equal(get("used-bytes").textContent, "0 B");
  assert.equal(get("command").disabled, false);
  delete global.document;
  delete global.confirm;
  console.log("PASS UI → HTTP → real C: state, headers, stats, coalescing, reset, reload, errors, disconnect");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
