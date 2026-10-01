"use strict";

// These fields come directly from the server's C heap snapshot.
function describeBlock(block) {
  return { allocated: block.allocated, aligned: block.aligned_payload_size,
    capacity: block.payload_capacity, padding: block.alignment_padding,
    unsplit: block.unsplit_remainder, fragmentation: block.internal_fragmentation,
    flag: block.allocation_flag, sizeAndFlag: block.size_and_flag };
}

async function requestAPI(path, body) {
  if (globalThis.miniMallocBackend) {
    return (await globalThis.miniMallocBackend).request(path, body);
  }
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store"
  });
  const result = await response.json();
  if (!result.state || result.state.source !== "c-allocator") {
    throw new Error(result.message || "C allocator API에 연결할 수 없습니다.");
  }
  return result;
}

function changedBlocks(before, after) {
  return after.filter(block => !before.some(old => old.offset === block.offset &&
    old.total_size === block.total_size && old.variable === block.variable && old.requested_size === block.requested_size));
}

function mergeDescription(before, after) {
  return after.filter(block => block.variable === null).flatMap(block => {
    const previous = before.filter(old => old.offset >= block.offset && old.offset < block.offset + block.total_size);
    return previous.length > 1
      ? [`Merged adjacent free blocks at ${previous.map(old => `+${old.offset} (${old.total_size} B)`).join(" + ")} → [+${block.offset}, +${block.offset + block.total_size}) · ${block.total_size} B`]
      : [];
  }).join("\n");
}

async function mountVisualizer() {
  let allocator = null;
  let busy = false;
  let selectedOffset = 0;
  let highlightTimer;
  const $ = id => document.getElementById(id);
  const input = $("command");
  const log = $("terminal-log");
  const heapInput = $("heap-size-input");
  const configStatus = $("heap-config-status");

  function configurationMessage(message, error = false) {
    configStatus.textContent = message;
    configStatus.className = `configuration-status${error ? " error" : ""}`;
  }

  function confirmReinitialize() {
    const count = allocator?.blocks.filter(block => block.allocated).length ?? 0;
    return count === 0 || globalThis.confirm(`사용 중인 allocation ${count}개가 있습니다. Heap을 재초기화하면 모든 할당과 변수·포인터가 사라집니다. 계속할까요?`);
  }

  function element(tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }

  function appendLog(message, kind = "info") {
    log.append(element("p", message, `log-line log-${kind}`));
    if (log.children.length > 200) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function showDetail(block) {
    selectedOffset = block.offset;
    const d = describeBlock(block);
    const detail = $("block-detail");
    detail.replaceChildren();
    detail.append(element("strong", `${block.variable ?? "FREE"} · heap_start + ${block.offset} → +${block.offset + block.total_size} (exclusive)`));
    detail.append(element("p", d.allocated
      ? `Requested ${block.requested_size} B → aligned payload ${d.aligned} B + header ${block.header_size} B + unsplit remainder ${d.unsplit} B = total block ${block.total_size} B`
      : `Header ${block.header_size} B + free payload capacity ${d.capacity} B = total block ${block.total_size} B · requested / aligned payload: —`));
    detail.append(element("p", `Header [+${block.offset}, +${block.offset + block.header_size}) · Payload [+${block.offset + block.header_size}, +${block.offset + block.total_size})`));
    detail.append(element("p", `size_and_flag = ${d.sizeAndFlag} (0b${d.sizeAndFlag.toString(2).padStart(9, "0")}) · LSB = ${d.flag} (${d.allocated ? "allocated" : "free"}) · size = size_and_flag & ~1 = ${block.total_size} B`));
    if (d.allocated) detail.append(element("p", `Internal fragmentation ${d.fragmentation} B = alignment padding ${d.padding} B + unsplit remainder ${d.unsplit} B`));
    for (const row of $("block-table").children) {
      row.setAttribute("data-selected", String(Number(row.dataset.offset) === selectedOffset));
    }
    for (const tile of $("heap-map").children) {
      tile.setAttribute("aria-pressed", String(Number(tile.dataset.offset) === selectedOffset));
    }
  }

  function render(changes = []) {
    clearTimeout(highlightTimer);
    const stats = allocator.stats;
    $("initialize-heap").textContent = allocator.active ? "Reinitialize heap" : "Initialize heap";
    $("heap-size").textContent = `${allocator.heap_size} B`;
    $("used-bytes").textContent = `${stats.used} B`;
    $("free-bytes").textContent = `${stats.free} B`;
    $("block-count").textContent = allocator.blocks.length;
    $("requested-bytes").textContent = `${stats.requested} B`;
    $("header-bytes").textContent = `${stats.headers} B`;
    $("header-breakdown").textContent = `(used ${stats.usedHeaders} / free ${stats.headers - stats.usedHeaders})`;
    $("fragmentation-bytes").textContent = `${stats.fragmentation} B`;
    $("accounting").textContent = `Allocated ${stats.used} B = requested ${stats.requested} B + allocated headers ${stats.usedHeaders} B + internal fragmentation ${stats.fragmentation} B. Header overhead는 free block의 header도 포함합니다.`;
    $("usage").textContent = `${(allocator.heap_size ? Math.round(stats.used / allocator.heap_size * 100) : 0)}% used`;
    $("heap-end").textContent = `+${allocator.heap_size} B`;
    $("heap-map").replaceChildren();
    $("block-table").replaceChildren();
    const highlighted = [];

    for (const block of allocator.blocks) {
      const d = describeBlock(block);
      const state = d.allocated ? "USED" : "FREE";
      const tile = element("button", "", `block${d.allocated ? " used" : ""}`);
      tile.type = "button";
      tile.dataset.offset = block.offset;
      tile.style.width = `${block.total_size / allocator.heap_size * 100}%`;
      tile.title = [
        `Variable: ${block.variable ?? "—"} · State: ${state}`,
        `Requested: ${d.allocated ? `${block.requested_size} B` : "—"}`,
        `Aligned payload: ${d.allocated ? `${d.aligned} B` : "—"}`,
        `Header: ${block.header_size} B · Payload capacity: ${d.capacity} B`,
        `Total block: ${block.total_size} B`,
        `Offset: heap_start [+${block.offset}, +${block.offset + block.total_size}) (end exclusive)`
      ].join("\n");
      tile.setAttribute("aria-label", tile.title);
      tile.append(element("span", `+${block.offset}`, "block-offset"));
      const layout = element("span", "", "block-layout");
      const header = element("span", "", "block-header");
      header.style.width = `${block.header_size / block.total_size * 100}%`;
      header.append(element("span", "H", "header-short"), element("span", `${block.header_size} B`, "header-size"));
      header.title = `${tile.title}\nsize_and_flag = ${d.sizeAndFlag} · LSB = ${d.flag}`;
      const payload = element("span", "", "block-payload");
      payload.style.width = `${d.capacity / block.total_size * 100}%`;
      payload.append(element("strong", block.variable ?? "FREE"), element("span", d.allocated ? "USED PAYLOAD" : "FREE PAYLOAD", "payload-state"), element("span", `${d.capacity} B`, "block-size"));
      layout.append(header, payload);
      tile.append(layout, element("span", `${block.total_size} B · end +${block.offset + block.total_size}`, "block-end"));
      tile.addEventListener("click", () => showDetail(block));
      if (changes.includes(block)) {
        tile.classList.add("changed");
        highlighted.push(tile);
      }
      $("heap-map").append(tile);
      const row = document.createElement("tr");
      row.dataset.offset = block.offset;
      for (const value of [block.variable ?? "—", state, `+${block.offset} → +${block.offset + block.total_size}`,
        d.allocated ? `${block.requested_size} B` : "—", d.allocated ? `${d.aligned} B` : "—",
        `${block.header_size} B`, `${block.total_size} B`, d.allocated ? `${d.fragmentation} B` : "—"]) {
        row.append(element("td", value));
      }
      if (d.allocated) row.children[1].className = "state-used";
      $("block-table").append(row);
    }
    if (allocator.blocks.length) {
      showDetail(allocator.blocks.find(block => block.offset === selectedOffset) ?? allocator.blocks[0]);
    } else {
      $("block-detail").replaceChildren(element("p", "C heap이 해제되었습니다. Reset heap으로 다시 시작하세요."));
    }
    if (highlighted.length) highlightTimer = setTimeout(() => {
      highlighted.forEach(tile => tile.classList.remove("changed"));
    }, 900);
  }

  const controls = [...document.querySelectorAll("button"), input, heapInput];
  function setBusy(value) {
    busy = value;
    controls.forEach(control => { control.disabled = value; });
  }

  async function update(path, body, resetLog = false) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestAPI(path, body);
      const before = allocator?.blocks ?? [];
      const firstLoad = allocator === null;
      allocator = result.state;
      if (firstLoad) {
        heapInput.value = String(allocator.initial_heap_size);
        configurationMessage(allocator.active ? `현재 실제 heap: ${allocator.heap_size} B` : "Heap이 해제된 상태입니다. Initialize heap으로 시작하세요.");
      }
      if (path === "/api/init" || path === "/api/reset") {
        if (result.ok) {
          const requested = path === "/api/init" ? body.heap_size : allocator.initial_heap_size;
          heapInput.value = String(requested);
          configurationMessage(`입력 ${requested} B → 실제 heap ${allocator.heap_size} B${requested !== allocator.heap_size ? " (C alignment()로 16 B 단위 정렬)" : ""}. 기존 할당과 변수·포인터가 모두 초기화되었습니다.`);
        } else {
          configurationMessage(result.message, true);
        }
      } else if (result.ok && !allocator.active) {
        configurationMessage("Heap이 해제되었습니다. Initialize heap으로 새 heap을 만드세요.");
      }
      $("connection-status").textContent = allocator.transport === "wasm" ? "● REAL C / WASM" : "● REAL C ALLOCATOR";
      const changes = path === "/api/command" && result.ok ? changedBlocks(before, allocator.blocks) : [];
      if (resetLog && result.ok) {
        selectedOffset = 0;
        log.replaceChildren();
      }
      appendLog(result.message, result.ok ? "success" : "error");
      const merge = changes.length ? mergeDescription(before, allocator.blocks) : "";
      if (merge) appendLog(merge, "info");
      if (changes.length) selectedOffset = changes[0].offset;
      render(changes);
      if (result.ok) input.value = "";
    } catch (error) {
      $("connection-status").textContent = "● DISCONNECTED";
      configurationMessage("서버 연결 오류입니다. 현재 heap 상태를 확인하려면 연결 복구 후 새로고침하세요.", true);
      const recovery = globalThis.miniMallocBackend
        ? "WASM 파일을 불러오지 못했습니다. 페이지를 새로고침하세요."
        : "python3 visualizer/server.py 실행 후 새로고침하세요.";
      appendLog(`연결 오류: ${error.message} · ${recovery} 마지막 표시 상태는 최신이 아닐 수 있습니다. 명령을 자동 재전송하지 않습니다.`, "error");
    } finally {
      setBusy(false);
    }
  }

  $("command-form").addEventListener("submit", async event => {
    event.preventDefault();
    const command = input.value.trim();
    if (!command || busy) return;
    appendLog(`❯ ${command}`, "command");
    await update("/api/command", { command });
    input.focus();
  });
  $("reset").addEventListener("click", async () => {
    if (busy) return;
    if (!confirmReinitialize()) {
      configurationMessage("재초기화를 취소했습니다. 기존 heap을 유지합니다.");
      return;
    }
    await update("/api/reset", {}, true);
    input.focus();
  });
  $("heap-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const raw = heapInput.value.trim();
    const size = Number(raw);
    if (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(size) || size < 1 || size > 1048576) {
      heapInput.setAttribute("aria-invalid", "true");
      configurationMessage("Heap size는 1–1,048,576 B 범위의 양의 정수여야 합니다.", true);
      heapInput.focus();
      return;
    }
    heapInput.setAttribute("aria-invalid", "false");
    if (!confirmReinitialize()) {
      configurationMessage("재초기화를 취소했습니다. 기존 heap을 유지합니다.");
      return;
    }
    await update("/api/init", { heap_size: size }, true);
  });
  document.querySelectorAll("[data-heap-size]").forEach(button => {
    button.addEventListener("click", () => {
      heapInput.value = button.dataset.heapSize;
      heapInput.setAttribute("aria-invalid", "false");
      heapInput.focus();
    });
  });
  document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("click", () => {
      input.value = button.dataset.command;
      input.focus();
    });
  });
  await update("/api/state");
}

if (typeof document !== "undefined") mountVisualizer();
if (typeof module !== "undefined") module.exports = { describeBlock, changedBlocks, mergeDescription, mountVisualizer, requestAPI };
