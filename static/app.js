const NODE_WIDTH = 214;
const NODE_HEIGHT = 78;
const LEVEL_GAP = 138;
const LEAF_GAP = 250;
const MARGIN_X = 34;
const MARGIN_Y = 28;
const SETTINGS_STORAGE_KEY = "groot2_web_settings";
const PINNED_BLACKBOARD_STORAGE_KEY = "groot2_web_pinned_blackboard_keys";
const COLLAPSED_EVENT_LIMIT = 3;
const DEFAULT_POLL_INTERVAL_MS = 500;
const MIN_POLL_INTERVAL_MS = 50;
const MAX_POLL_INTERVAL_MS = 60000;
const DEFAULT_SETTINGS = {
  eventLimit: 24,
  timeoutMs: 1200,
  autoBlackboard: true,
};

const state = {
  settings: loadSettings(),
  host: "127.0.0.1",
  port: "1667",
  demo: false,
  xml: "",
  tree: null,
  nodes: [],
  nodeByUid: new Map(),
  statusByUid: new Map(),
  blackboardNames: [],
  blackboards: {},
  blackboardError: "",
  pinnedBlackboardKeys: loadPinnedBlackboardKeys(),
  blackboardExpanded: false,
  events: [],
  eventsExpanded: false,
  selectedUid: null,
  pollTimer: null,
  polling: false,
  pollInFlight: false,
};

const els = {
  form: document.querySelector("#connectForm"),
  host: document.querySelector("#hostInput"),
  port: document.querySelector("#portInput"),
  interval: document.querySelector("#intervalInput"),
  demo: document.querySelector("#demoButton"),
  settingsButton: document.querySelector("#settingsButton"),
  disconnect: document.querySelector("#disconnectButton"),
  connectionText: document.querySelector("#connectionText"),
  statusStrip: document.querySelector("#statusStrip"),
  empty: document.querySelector("#emptyState"),
  treeCanvas: document.querySelector("#treeCanvas"),
  edgeLayer: document.querySelector("#edgeLayer"),
  nodeLayer: document.querySelector("#nodeLayer"),
  treeTab: document.querySelector("#treeTab"),
  xmlTab: document.querySelector("#xmlTab"),
  treePane: document.querySelector("#treePane"),
  xmlPane: document.querySelector("#xmlPane"),
  details: document.querySelector("#nodeDetails"),
  blackboard: document.querySelector("#blackboardView"),
  blackboardOpen: document.querySelector("#blackboardOpenButton"),
  blackboardExpand: document.querySelector("#blackboardExpandButton"),
  blackboardRefresh: document.querySelector("#blackboardRefreshButton"),
  blackboardModalRefresh: document.querySelector("#blackboardModalRefreshButton"),
  blackboardOverlay: document.querySelector("#blackboardOverlay"),
  blackboardClose: document.querySelector("#blackboardCloseButton"),
  blackboardClearPinned: document.querySelector("#blackboardClearPinnedButton"),
  blackboardPicker: document.querySelector("#blackboardPicker"),
  eventLog: document.querySelector("#eventLog"),
  eventToggle: document.querySelector("#eventToggleButton"),
  settingsOverlay: document.querySelector("#settingsOverlay"),
  settingsForm: document.querySelector("#settingsForm"),
  settingsClose: document.querySelector("#settingsCloseButton"),
  settingsCancel: document.querySelector("#settingsCancelButton"),
  settingsEventLimit: document.querySelector("#settingsEventLimit"),
  settingsTimeoutMs: document.querySelector("#settingsTimeoutMs"),
  settingsAutoBlackboard: document.querySelector("#settingsAutoBlackboard"),
};

const statusLabel = {
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  SKIPPED: "SKIPPED",
  IDLE_FROM_RUNNING: "IDLE <- RUNNING",
  IDLE_FROM_SUCCESS: "IDLE <- SUCCESS",
  IDLE_FROM_FAILURE: "IDLE <- FAILURE",
};

function slugStatus(status) {
  return String(status || "IDLE").toLowerCase().replaceAll("_", "-");
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeSettings(settings = {}) {
  return {
    eventLimit: clampNumber(
      settings.eventLimit,
      1,
      200,
      DEFAULT_SETTINGS.eventLimit,
    ),
    timeoutMs: clampNumber(settings.timeoutMs, 100, 10000, DEFAULT_SETTINGS.timeoutMs),
    autoBlackboard: settings.autoBlackboard !== false,
  };
}

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return normalizeSettings(stored ? JSON.parse(stored) : DEFAULT_SETTINGS);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
  } catch {
    // Ignore storage failures; settings still work for the current page.
  }
}

function loadPinnedBlackboardKeys() {
  try {
    const stored = JSON.parse(localStorage.getItem(PINNED_BLACKBOARD_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) {
      return new Set();
    }
    return new Set(stored.filter((item) => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function savePinnedBlackboardKeys() {
  try {
    localStorage.setItem(
      PINNED_BLACKBOARD_STORAGE_KEY,
      JSON.stringify(Array.from(state.pinnedBlackboardKeys)),
    );
  } catch {
    // Ignore storage failures; pinned values still work for the current page.
  }
}

function elementChildren(el) {
  return Array.from(el.children).filter((child) => {
    return !["TreeNodesModel", "BehaviorTree"].includes(child.tagName);
  });
}

function attrsOf(el) {
  return Array.from(el.attributes).map((attr) => ({
    name: attr.name,
    value: attr.value,
  }));
}

function chooseBehaviorTree(doc) {
  const root = doc.documentElement;
  const trees = Array.from(doc.querySelectorAll("BehaviorTree"));
  if (!trees.length) {
    throw new Error("XML 中没有 BehaviorTree");
  }

  const mainTreeId = root.getAttribute("main_tree_to_execute");
  if (mainTreeId) {
    const matched = trees.find((tree) => tree.getAttribute("ID") === mainTreeId);
    if (matched) {
      return matched;
    }
  }
  return trees[0];
}

function buildTreeFromElement(el, parent = null, index = 0) {
  const uidText = el.getAttribute("_uid") || el.getAttribute("uid");
  const uid = uidText && /^\d+$/.test(uidText) ? Number(uidText) : null;
  const node = {
    uid,
    syntheticId: `${parent ? parent.syntheticId : "root"}-${index}`,
    tag: el.tagName,
    name: el.getAttribute("name") || el.getAttribute("ID") || el.tagName,
    path: el.getAttribute("_fullPath") || el.getAttribute("_fullpath") || "",
    attrs: attrsOf(el),
    parent,
    children: [],
    depth: 0,
    x: 0,
    y: 0,
  };
  node.children = elementChildren(el).map((child, childIndex) =>
    buildTreeFromElement(child, node, childIndex),
  );
  return node;
}

function flattenTree(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return out;
}

function layoutTree(root) {
  let leafCursor = 0;
  const walk = (node, depth) => {
    node.depth = depth;
    node.y = MARGIN_Y + depth * LEVEL_GAP;
    if (!node.children.length) {
      node.x = MARGIN_X + leafCursor * LEAF_GAP;
      leafCursor += 1;
      return node.x;
    }
    const childXs = node.children.map((child) => walk(child, depth + 1));
    node.x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    return node.x;
  };
  walk(root, 0);

  const nodes = flattenTree(root);
  const minX = Math.min(...nodes.map((node) => node.x));
  if (minX < MARGIN_X) {
    nodes.forEach((node) => {
      node.x += MARGIN_X - minX;
    });
  }
}

function parseXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error(parseError.textContent.trim());
  }
  const behaviorTree = chooseBehaviorTree(doc);
  const roots = elementChildren(behaviorTree);
  if (!roots.length) {
    throw new Error("BehaviorTree 没有根节点");
  }
  const rootNode = buildTreeFromElement(roots[0]);
  layoutTree(rootNode);
  return rootNode;
}

function extractBlackboardNames(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return [];
  }
  const names = [];
  Array.from(doc.querySelectorAll("BehaviorTree")).forEach((tree) => {
    const fullpath = tree.getAttribute("_fullpath") || tree.getAttribute("_fullPath") || "";
    const fallback = tree.getAttribute("ID") || "";
    const name = (fullpath || fallback).trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  });
  return names;
}

function apiUrl(path, extraParams = {}) {
  const params = new URLSearchParams({
    host: state.demo ? "demo" : state.host,
    port: state.port,
    timeout_ms: state.settings.timeoutMs,
  });
  if (state.demo) {
    params.set("demo", "1");
  }
  Object.entries(extraParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  return `${path}?${params.toString()}`;
}

async function fetchJson(path, extraParams = {}) {
  const response = await fetch(apiUrl(path, extraParams), { cache: "no-store" });
  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "请求失败");
  }
  return payload;
}

async function connect() {
  setConnection("连接中...");
  clearTreeState();
  state.host = els.host.value.trim();
  state.port = els.port.value.trim();
  state.demo = state.host.toLowerCase() === "demo";
  updateDisconnectButton(false);

  const payload = await fetchJson("/api/fulltree");
  state.xml = payload.xml;
  state.tree = parseXml(payload.xml);
  state.nodes = flattenTree(state.tree);
  state.nodeByUid = new Map(
    state.nodes.filter((node) => node.uid !== null).map((node) => [node.uid, node]),
  );
  state.blackboardNames = extractBlackboardNames(payload.xml);
  els.xmlPane.textContent = state.xml;
  renderTree();
  renderDetails();
  renderEvents();
  renderBlackboards();
  setConnection(`${state.demo ? "demo" : state.host}:${state.port}`);
  updateDisconnectButton(true);
  await pollRuntimeData();
  startPolling();
}

function setConnection(text) {
  els.connectionText.textContent = text;
}

function stopPolling() {
  state.polling = false;
  state.pollInFlight = false;
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function clearTreeState() {
  stopPolling();
  state.xml = "";
  state.tree = null;
  state.nodes = [];
  state.nodeByUid = new Map();
  state.statusByUid = new Map();
  state.blackboardNames = [];
  state.blackboards = {};
  state.blackboardError = "";
  state.blackboardExpanded = false;
  state.events = [];
  state.selectedUid = null;
  els.xmlPane.textContent = "";
  els.edgeLayer.innerHTML = "";
  els.nodeLayer.innerHTML = "";
  renderTree();
  renderDetails();
  renderEvents();
  renderBlackboards();
  renderStatusStrip();
  applyBlackboardExpandedState();
}

function disconnect() {
  const wasDemo = state.demo;
  clearTreeState();
  state.demo = false;
  setConnection("未连接");
  updateDisconnectButton(false);
  if (wasDemo) {
    els.host.value = "127.0.0.1";
    els.port.value = "1667";
  }
  showTab("tree");
}

function updateDisconnectButton(enabled) {
  els.disconnect.disabled = !enabled;
  els.disconnect.textContent = state.demo ? "关闭示例" : "断开";
  els.blackboardRefresh.disabled = !enabled;
  els.blackboardOpen.disabled = !enabled;
  els.blackboardExpand.disabled = !enabled;
  els.blackboardModalRefresh.disabled = !enabled;
}

function startPolling() {
  stopPolling();
  state.polling = true;
  state.pollTimer = setInterval(pollRuntimeData, getPollIntervalMs());
}

function getPollIntervalMs() {
  return clampNumber(
    els.interval.value,
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS,
  );
}

function normalizePollIntervalInput() {
  els.interval.value = String(getPollIntervalMs());
}

async function pollRuntimeData() {
  if (state.pollInFlight) {
    return;
  }
  state.pollInFlight = true;
  try {
    const tasks = [pollStatus()];
    if (state.settings.autoBlackboard) {
      tasks.push(pollBlackboards());
    }
    await Promise.allSettled(tasks);
  } finally {
    state.pollInFlight = false;
  }
}

async function pollStatus() {
  if (!state.tree) {
    return;
  }
  try {
    const payload = await fetchJson("/api/status");
    const next = new Map();
    payload.statuses.forEach((entry) => {
      next.set(Number(entry.uid), entry.status);
    });
    recordStatusChanges(next);
    state.statusByUid = next;
    updateRenderedStatuses();
    renderStatusStrip();
  } catch (error) {
    setConnection(`错误: ${error.message}`);
  }
}

async function pollBlackboards() {
  if (!state.tree) {
    return;
  }
  if (!state.blackboardNames.length) {
    state.blackboardError = "没有可请求的黑板名";
    renderBlackboards();
    return;
  }
  try {
    const payload = await fetchJson("/api/blackboard", {
      blackboards: state.blackboardNames.join(";"),
    });
    state.blackboards = payload.blackboards || {};
    state.blackboardError = "";
  } catch (error) {
    state.blackboardError = error.message;
  }
  renderBlackboards();
}

function recordStatusChanges(next) {
  next.forEach((status, uid) => {
    const prev = state.statusByUid.get(uid);
    if (prev && prev !== status) {
      const node = state.nodeByUid.get(uid);
      state.events.unshift({
        uid,
        name: node ? node.name : `uid ${uid}`,
        from: prev,
        to: status,
        time: new Date(),
      });
    }
  });
  state.events = state.events.slice(0, state.settings.eventLimit);
  renderEvents();
}

function openSettings() {
  els.settingsEventLimit.value = String(state.settings.eventLimit);
  els.settingsTimeoutMs.value = String(state.settings.timeoutMs);
  els.settingsAutoBlackboard.checked = state.settings.autoBlackboard;
  els.settingsOverlay.hidden = false;
  els.settingsEventLimit.focus();
}

function closeSettings() {
  els.settingsOverlay.hidden = true;
}

function openBlackboardPanel() {
  renderBlackboardPicker();
  els.blackboardOverlay.hidden = false;
  els.blackboardClose.focus();
}

function closeBlackboardPanel() {
  els.blackboardOverlay.hidden = true;
}

function setBlackboardExpanded(expanded) {
  state.blackboardExpanded = expanded;
  applyBlackboardExpandedState();
  renderBlackboards();
  if (expanded) {
    showTab("tree");
  }
}

function applyBlackboardExpandedState() {
  document.body.classList.toggle("blackboard-expanded", state.blackboardExpanded);
  els.blackboardExpand.classList.toggle("active", state.blackboardExpanded);
  els.blackboardExpand.setAttribute("aria-pressed", String(state.blackboardExpanded));
  els.blackboardExpand.setAttribute(
    "aria-label",
    state.blackboardExpanded ? "恢复黑板尺寸" : "放大黑板",
  );
  els.blackboardExpand.title = state.blackboardExpanded ? "恢复黑板尺寸" : "放大黑板";
}

function applySettingsFromForm() {
  state.settings = normalizeSettings({
    eventLimit: els.settingsEventLimit.value,
    timeoutMs: els.settingsTimeoutMs.value,
    autoBlackboard: els.settingsAutoBlackboard.checked,
  });
  saveSettings();
  state.events = state.events.slice(0, state.settings.eventLimit);
  renderEvents();
  closeSettings();
  if (state.tree && state.settings.autoBlackboard) {
    pollBlackboards();
  }
}

function clearSelectedNode() {
  if (state.selectedUid === null) {
    return;
  }
  state.selectedUid = null;
  updateRenderedStatuses();
  renderDetails();
}

function renderTree() {
  if (!state.tree) {
    els.empty.hidden = false;
    els.treeCanvas.hidden = true;
    return;
  }
  els.empty.hidden = true;
  els.treeCanvas.hidden = false;

  const maxX = Math.max(...state.nodes.map((node) => node.x)) + NODE_WIDTH + MARGIN_X;
  const maxY = Math.max(...state.nodes.map((node) => node.y)) + NODE_HEIGHT + MARGIN_Y;
  els.treeCanvas.style.width = `${maxX}px`;
  els.treeCanvas.style.height = `${maxY}px`;
  els.edgeLayer.setAttribute("width", maxX);
  els.edgeLayer.setAttribute("height", maxY);
  els.edgeLayer.setAttribute("viewBox", `0 0 ${maxX} ${maxY}`);

  const edges = [];
  const collectEdges = (node) => {
    node.children.forEach((child) => {
      edges.push(edgePath(node, child));
      collectEdges(child);
    });
  };
  collectEdges(state.tree);
  els.edgeLayer.innerHTML = edges.join("");
  els.nodeLayer.innerHTML = "";

  state.nodes.forEach((node) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = nodeClassName(node);
    el.dataset.uid = node.uid ?? node.syntheticId;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.innerHTML = `
      <span class="node-title">${escapeHtml(node.name)}</span>
      <span class="node-meta">${escapeHtml(node.tag)}${node.uid !== null ? ` · uid ${node.uid}` : ""}</span>
      <span class="node-status">${escapeHtml(statusLabel[getStatus(node)] || getStatus(node))}</span>
    `;
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedUid = node.uid ?? node.syntheticId;
      updateRenderedStatuses();
      renderDetails(node);
    });
    els.nodeLayer.appendChild(el);
  });
  renderStatusStrip();
}

function edgePath(parent, child) {
  const x1 = parent.x + NODE_WIDTH / 2;
  const y1 = parent.y + NODE_HEIGHT;
  const x2 = child.x + NODE_WIDTH / 2;
  const y2 = child.y;
  const midY = (y1 + y2) / 2;
  return `<path class="edge" d="M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}" />`;
}

function getStatus(node) {
  if (node.uid === null) {
    return "IDLE";
  }
  return state.statusByUid.get(node.uid) || "IDLE";
}

function nodeClassName(node) {
  const status = getStatus(node);
  const selected = state.selectedUid === (node.uid ?? node.syntheticId);
  return `bt-node status-${slugStatus(status)}${selected ? " selected" : ""}`;
}

function updateRenderedStatuses() {
  Array.from(els.nodeLayer.children).forEach((el, index) => {
    const node = state.nodes[index];
    el.className = nodeClassName(node);
    const statusEl = el.querySelector(".node-status");
    const status = getStatus(node);
    statusEl.textContent = statusLabel[status] || status;
  });
  if (state.selectedUid !== null) {
    const node = state.nodes.find((item) => (item.uid ?? item.syntheticId) === state.selectedUid);
    renderDetails(node);
  }
}

function renderStatusStrip() {
  const counts = {
    RUNNING: 0,
    SUCCESS: 0,
    FAILURE: 0,
    SKIPPED: 0,
    IDLE: 0,
  };
  state.nodes.forEach((node) => {
    const status = getStatus(node);
    if (status.includes("RUNNING")) {
      counts.RUNNING += 1;
    } else if (status.includes("SUCCESS")) {
      counts.SUCCESS += 1;
    } else if (status.includes("FAILURE")) {
      counts.FAILURE += 1;
    } else if (status === "SKIPPED") {
      counts.SKIPPED += 1;
    } else {
      counts.IDLE += 1;
    }
  });
  els.statusStrip.innerHTML = [
    pill("running", "RUNNING", counts.RUNNING),
    pill("success", "SUCCESS", counts.SUCCESS),
    pill("failure", "FAILURE", counts.FAILURE),
    pill("skipped", "SKIPPED", counts.SKIPPED),
    pill("", "IDLE", counts.IDLE),
  ].join("");
}

function pill(dotClass, label, count) {
  return `<span class="status-pill"><span class="dot ${dotClass}"></span>${label}<strong>${count}</strong></span>`;
}

function renderDetails(node = null) {
  if (!node && state.selectedUid !== null) {
    node = state.nodes.find((item) => (item.uid ?? item.syntheticId) === state.selectedUid);
  }
  if (!node) {
    els.details.classList.add("muted");
    els.details.textContent = "未选择节点";
    return;
  }
  els.details.classList.remove("muted");
  const rows = [
    ["名称", node.name],
    ["类型", node.tag],
    ["UID", node.uid === null ? "无" : String(node.uid)],
    ["状态", statusLabel[getStatus(node)] || getStatus(node)],
    ["路径", node.path || "无"],
    ["子节点", String(node.children.length)],
  ];
  node.attrs
    .filter((attr) => !["_uid", "_fullPath", "_fullpath"].includes(attr.name))
    .forEach((attr) => rows.push([attr.name, attr.value]));
  els.details.innerHTML = rows.map(([key, value]) => kv(key, value)).join("");
}

function renderBlackboards() {
  renderBlackboardPicker();

  if (!state.tree) {
    els.blackboard.classList.add("muted");
    els.blackboard.textContent = "未连接黑板";
    return;
  }

  if (state.blackboardError) {
    els.blackboard.classList.remove("muted");
    els.blackboard.innerHTML = `
      <div class="blackboard-error">${escapeHtml(state.blackboardError)}</div>
      ${renderBlackboardNames()}
    `;
    return;
  }

  const pairs = getBlackboardPairs();
  if (!pairs.length) {
    els.blackboard.classList.add("muted");
    els.blackboard.innerHTML =
      "没有可导出的值。复杂类型需要在行为树进程中注册 JsonExporter。";
    return;
  }

  const pinnedPairs = state.blackboardExpanded
    ? pairs
    : pairs.filter((pair) => state.pinnedBlackboardKeys.has(pair.id));
  if (!pinnedPairs.length) {
    els.blackboard.classList.add("muted");
    els.blackboard.textContent = state.blackboardExpanded
      ? "当前黑板没有可显示项。"
      : "未选择主页显示项。点击“全部”选择键值对。";
    return;
  }

  els.blackboard.classList.remove("muted");
  els.blackboard.innerHTML = pinnedPairs
    .map((pair) => renderBlackboardPanelPair(pair, state.blackboardExpanded))
    .join("");
}

function getBlackboardPairs() {
  const pairs = [];
  Object.keys(state.blackboards)
    .sort()
    .forEach((boardName) => {
      const values = state.blackboards[boardName];
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return;
      }
      Object.entries(values)
        .sort(([left], [right]) => left.localeCompare(right))
        .forEach(([key, value]) => {
          pairs.push({
            id: blackboardPairId(boardName, key),
            boardName,
            key,
            value,
          });
        });
    });
  return pairs;
}

function blackboardPairId(boardName, key) {
  return JSON.stringify([boardName, key]);
}

function renderBlackboardPicker() {
  if (!state.tree) {
    els.blackboardPicker.classList.add("muted");
    els.blackboardPicker.textContent = "未连接黑板";
    return;
  }

  if (state.blackboardError) {
    els.blackboardPicker.classList.remove("muted");
    els.blackboardPicker.innerHTML = `
      <div class="blackboard-error">${escapeHtml(state.blackboardError)}</div>
      ${renderBlackboardNames()}
    `;
    return;
  }

  const pairs = getBlackboardPairs();
  if (!pairs.length) {
    els.blackboardPicker.classList.add("muted");
    els.blackboardPicker.innerHTML =
      "没有可导出的值。复杂类型需要在行为树进程中注册 JsonExporter。";
    return;
  }

  els.blackboardPicker.classList.remove("muted");
  els.blackboardPicker.innerHTML = pairs.map((pair) => renderBlackboardPickerRow(pair)).join("");
}

function renderBlackboardNames() {
  if (!state.blackboardNames.length) {
    return "";
  }
  return `
    <div class="blackboard-names">
      ${state.blackboardNames.map((name) => `<code>${escapeHtml(name)}</code>`).join("")}
    </div>
  `;
}

function renderBlackboardPanelPair(pair, expanded = false) {
  return `
    <div class="blackboard-pin${expanded ? " expanded" : ""}">
      <div class="blackboard-pin-head">
        <strong>${escapeHtml(pair.key)}</strong>
        <span>${escapeHtml(pair.boardName)}</span>
      </div>
      ${renderBlackboardValue(pair.value, expanded ? "expanded" : "compact")}
    </div>
  `;
}

function renderBlackboardPickerRow(pair) {
  const checked = state.pinnedBlackboardKeys.has(pair.id) ? "checked" : "";
  return `
    <div class="blackboard-row">
      <input
        type="checkbox"
        aria-label="主页显示 ${escapeHtml(pair.key)}"
        data-pair-id="${escapeHtml(pair.id)}"
        ${checked}
      />
      <span class="blackboard-row-meta">
        <strong>${escapeHtml(pair.key)}</strong>
        <small>${escapeHtml(pair.boardName)}</small>
      </span>
      <div class="blackboard-row-value">${renderBlackboardValue(pair.value, "inline")}</div>
    </div>
  `;
}

function renderBlackboardValue(value, mode = "") {
  const scalar = value === null || ["string", "number", "boolean"].includes(typeof value);
  if (scalar) {
    return `<code class="blackboard-value">${escapeHtml(formatBlackboardScalar(value))}</code>`;
  }
  return `<pre class="blackboard-json ${escapeHtml(mode)}">${escapeHtml(
    JSON.stringify(value, null, 2),
  )}</pre>`;
}

function formatBlackboardScalar(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function renderEvents() {
  els.eventToggle.textContent = state.eventsExpanded ? "▾" : "▸";
  els.eventToggle.setAttribute("aria-expanded", String(state.eventsExpanded));
  els.eventToggle.setAttribute(
    "aria-label",
    state.eventsExpanded ? "收起运行事件" : "展开运行事件",
  );
  els.eventLog.classList.toggle("expanded", state.eventsExpanded);

  if (!state.events.length) {
    els.eventLog.classList.add("muted");
    els.eventLog.textContent = "暂无状态变化";
    return;
  }
  els.eventLog.classList.remove("muted");
  const limit = state.eventsExpanded ? state.settings.eventLimit : COLLAPSED_EVENT_LIMIT;
  els.eventLog.innerHTML = state.events
    .slice(0, limit)
    .map(
      (event) => `
        <div class="event-item">
          <span class="event-node">${escapeHtml(event.name)} · uid ${event.uid}</span>
          <span>${escapeHtml(statusLabel[event.from] || event.from)} -> ${escapeHtml(statusLabel[event.to] || event.to)}</span>
          <span class="event-time">${event.time.toLocaleTimeString()}</span>
        </div>
      `,
    )
    .join("");
}

function kv(key, value) {
  return `<div class="kv"><span>${escapeHtml(key)}</span><span>${escapeHtml(value)}</span></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showTab(tab) {
  const xml = tab === "xml";
  els.xmlPane.hidden = !xml;
  els.treePane.hidden = xml;
  els.xmlTab.classList.toggle("active", xml);
  els.treeTab.classList.toggle("active", !xml);
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  connect().catch((error) => {
    setConnection(`错误: ${error.message}`);
  });
});

els.demo.addEventListener("click", () => {
  els.host.value = "demo";
  els.port.value = "1667";
  connect().catch((error) => {
    setConnection(`错误: ${error.message}`);
  });
});

els.disconnect.addEventListener("click", disconnect);

els.settingsButton.addEventListener("click", openSettings);

els.settingsClose.addEventListener("click", closeSettings);

els.settingsCancel.addEventListener("click", closeSettings);

els.settingsOverlay.addEventListener("click", (event) => {
  if (event.target === els.settingsOverlay) {
    closeSettings();
  }
});

els.blackboardOverlay.addEventListener("click", (event) => {
  if (event.target === els.blackboardOverlay) {
    closeBlackboardPanel();
  }
});

els.settingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySettingsFromForm();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.settingsOverlay.hidden) {
    closeSettings();
  } else if (event.key === "Escape" && !els.blackboardOverlay.hidden) {
    closeBlackboardPanel();
  }
});

els.blackboardOpen.addEventListener("click", openBlackboardPanel);

els.blackboardExpand.addEventListener("click", () => {
  setBlackboardExpanded(!state.blackboardExpanded);
});

els.blackboardClose.addEventListener("click", closeBlackboardPanel);

els.blackboardRefresh.addEventListener("click", () => {
  pollBlackboards();
});

els.blackboardModalRefresh.addEventListener("click", () => {
  pollBlackboards();
});

els.blackboardClearPinned.addEventListener("click", () => {
  state.pinnedBlackboardKeys.clear();
  savePinnedBlackboardKeys();
  renderBlackboards();
});

els.blackboardPicker.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-pair-id]");
  if (!input) {
    return;
  }
  const pairId = input.dataset.pairId;
  if (!pairId) {
    return;
  }
  if (input.checked) {
    state.pinnedBlackboardKeys.add(pairId);
  } else {
    state.pinnedBlackboardKeys.delete(pairId);
  }
  savePinnedBlackboardKeys();
  renderBlackboards();
});

els.eventToggle.addEventListener("click", () => {
  state.eventsExpanded = !state.eventsExpanded;
  renderEvents();
});

els.treePane.addEventListener("click", (event) => {
  if (!event.target.closest(".bt-node")) {
    clearSelectedNode();
  }
});

els.interval.addEventListener("change", () => {
  normalizePollIntervalInput();
  if (state.polling) {
    startPolling();
  }
});

els.treeTab.addEventListener("click", () => showTab("tree"));
els.xmlTab.addEventListener("click", () => showTab("xml"));

renderStatusStrip();
