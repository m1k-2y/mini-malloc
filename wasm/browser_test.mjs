// Playwright is a test-only dependency; the shipped site has no npm dependencies.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    // Serve the Pages build under a repository subpath, not just domain root.
    let file;
    if (path.startsWith('/mini-malloc/')) file = resolve(root, 'dist', path.slice(13) || 'index.html');
    else if (path === '/probe.html') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<script>window.probeLog=[];var Module={print:s=>probeLog.push(s),printErr:s=>probeLog.push(s)};</script><script src="/mmap_probe.js"></script>');
      return;
    } else if (/^\/mmap_probe\.(js|wasm)$/.test(path)) file = resolve(root, 'build', path.slice(1));
    else { res.writeHead(404); res.end(); return; }
    if (!file.startsWith(resolve(root, 'dist') + '/') && !file.startsWith(resolve(root, 'build') + '/')) throw new Error('Bad path');
    const data = await readFile(file);
    res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.wasm':'application/wasm'})[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
let browser;
try {
  browser = await chromium.launch({headless:true});
  const base = `http://127.0.0.1:${server.address().port}`;
  if (process.env.TEST_MMAP_PROBE) {
    const probe = await browser.newPage();
    await probe.goto(`${base}/probe.html`);
    await probe.waitForFunction(() => window.probeLog?.some(line => line.startsWith('destroy:')));
    const logs = await probe.evaluate(() => window.probeLog);
    assert.ok(logs.includes('destroy: start_is_null=0 size=256'));
    console.log('Browser original mmap probe:', logs.join(' | '));
    await probe.close();
  }
  const page = await browser.newPage({viewport:{width:1280,height:1100}});
  const errors = [], apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/')) apiRequests.push(request.url()); });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${base}/mini-malloc/`);
  await page.waitForFunction(() => document.querySelector('#connection-status').textContent.includes('REAL C / WASM'));
  const snapshot = () => page.evaluate(async () => (await window.miniMallocBackend).state());
  const command = async text => {
    await page.locator('#command').fill(text);
    await page.locator('#command').press('Enter');
    await page.waitForFunction(() => !document.querySelector('#command').disabled);
  };
  const init = async size => {
    await page.locator('#heap-size-input').fill(String(size));
    await page.locator('#initialize-heap').click();
    await page.waitForFunction(() => !document.querySelector('#heap-size-input').disabled);
  };
  await command('void *a = malloc(17);');
  let state = await snapshot();
  assert.equal(state.blocks[0].size_and_flag,49);
  assert.equal(state.blocks[0].total_size,48);
  assert.match(await page.locator('#block-detail').textContent(), /size_and_flag = 49/);
  await command('void *b = malloc(16);');
  assert.deepEqual((await snapshot()).blocks.map(b=>b.total_size),[48,32,176]);
  await command('free(a);');
  assert.deepEqual((await snapshot()).blocks.map(b=>b.allocated),[false,true,false]);
  await command('free(b);');
  assert.deepEqual((await snapshot()).blocks.map(b=>b.total_size),[256]);
  await init(256);
  for (const name of ['a','b','c']) await command(`void *${name} = malloc(16);`);
  const pointer = await page.evaluate(async () => (await window.miniMallocBackend).variables.get('b').pointer);
  await command('free(b);');
  await command('void *d = malloc(16);');
  assert.equal(await page.evaluate(async () => (await window.miniMallocBackend).variables.get('d').pointer),pointer);
  await init(1024);
  assert.equal(await page.evaluate(async () => (await window.miniMallocBackend).variables.size),0);
  assert.deepEqual((await snapshot()).blocks.map(b=>b.total_size),[1024]);
  await command('void *a = malloc(32);');
  await command('void *b = malloc(16);');
  assert.deepEqual((await snapshot()).blocks.map(b=>b.total_size),[48,32,944]);
  const layout = await page.locator('#heap-map').evaluate(map => {
    const tiles = [...map.children];
    return tiles.map(tile => ({width:tile.getBoundingClientRect().width / map.getBoundingClientRect().width,
      headerSize:getComputedStyle(tile.querySelector('.header-size')).display,
      payloadState:getComputedStyle(tile.querySelector('.payload-state')).display,
      overflow:getComputedStyle(tile).overflow}));
  });
  [48,32,944].forEach((size,i)=>assert.ok(Math.abs(layout[i].width-size/1024)<0.001));
  assert.equal(layout[0].headerSize,'none');
  assert.equal(layout[0].payloadState,'none');
  assert.equal(layout[1].overflow,'hidden');
  await page.screenshot({path:resolve(root,'build/wasm-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(root,'build/wasm-mobile.png'),fullPage:true});
  await init(17);
  assert.equal((await snapshot()).heap_size,32);
  assert.match(await page.locator('#heap-config-status').textContent(),/입력 17 B → 실제 heap 32 B/);
  await command('exit;');
  assert.equal((await snapshot()).blocks.length,0);
  await page.locator('#reset').click();
  assert.equal((await snapshot()).heap_size,32);
  assert.deepEqual(apiRequests,[]);
  assert.deepEqual(errors,[]);
  console.log('Browser PASS: A/B/C/D, repository subpath, real WASM metadata, labels, mobile, alignment, reset, zero API calls');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
