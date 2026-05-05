const NODE_WIDTH = 214;
const NODE_HEIGHT = 78;
const LEVEL_GAP = 138;
const LEAF_GAP = 250;
const MARGIN_X = 34;
const MARGIN_Y = 28;

const state = {
  host: "127.0.0.1",
  port: "1667",
  demo: false,
  xml: "",
  tree: null,
  nodes: [],
  nodeByUid: new Map(),
  statusByUid: new Map(),
  events: [],
  selectedUid: null,
  pollTimer: null,
  polling: false,
};

const els = {
  form: document.querySelector("#connectForm"),
  host: document.querySelector("#hostInput"),
  port: document.querySelector("#portInput"),
  interval: document.querySelector("#intervalInput"),
  demo: document.querySelector("#demoButton"),
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
  eventLog: document.querySelector("#eventLog"),
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
    path: el.getAttribute("_fullPath") || "",
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

function apiUrl(path) {
  const params = new URLSearchParams({
    host: state.demo ? "demo" : state.host,
    port: state.port,
  });
  if (state.demo) {
    params.set("demo", "1");
  }
  return `${path}?${params.toString()}`;
}

async function fetchJson(path) {
  const response = await fetch(apiUrl(path), { cache: "no-store" });
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
  els.xmlPane.textContent = state.xml;
  renderTree();
  renderDetails();
  renderEvents();
  setConnection(`${state.demo ? "demo" : state.host}:${state.port}`);
  updateDisconnectButton(true);
  await pollStatus();
  startPolling();
}

function setConnection(text) {
  els.connectionText.textContent = text;
}

function stopPolling() {
  state.polling = false;
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
  state.events = [];
  state.selectedUid = null;
  els.xmlPane.textContent = "";
  els.edgeLayer.innerHTML = "";
  els.nodeLayer.innerHTML = "";
  renderTree();
  renderDetails();
  renderEvents();
  renderStatusStrip();
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
}

function startPolling() {
  stopPolling();
  state.polling = true;
  state.pollTimer = setInterval(pollStatus, Number(els.interval.value));
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
  state.events = state.events.slice(0, 80);
  renderEvents();
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
    el.addEventListener("click", () => {
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
    .filter((attr) => !["_uid", "_fullPath"].includes(attr.name))
    .forEach((attr) => rows.push([attr.name, attr.value]));
  els.details.innerHTML = rows.map(([key, value]) => kv(key, value)).join("");
}

function renderEvents() {
  if (!state.events.length) {
    els.eventLog.classList.add("muted");
    els.eventLog.textContent = "暂无状态变化";
    return;
  }
  els.eventLog.classList.remove("muted");
  els.eventLog.innerHTML = state.events
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

els.interval.addEventListener("change", () => {
  if (state.polling) {
    startPolling();
  }
});

els.treeTab.addEventListener("click", () => showTab("tree"));
els.xmlTab.addEventListener("click", () => showTab("xml"));

renderStatusStrip();
