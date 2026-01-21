// Fast HTML Editor v8.x – with Translate (Vercel /api/translate) apply-back fix

const state = {
  files: [],
  activeIndex: -1,
  includeAttrs: false,
  hideShort: true,
  searchTerm: "",
  openCounter: 0,
  allMode: true,
  translating: false,
};

const zipBundles = [];
let zipBundleCounter = 0;

// ---- Helpers ----
const $ = (s) => document.querySelector(s);

const tabsEl = $("#tabs");
const listEl = $("#textList");
const dirtyText = $("#dirtyText");
const fileInfo = $("#fileInfo");

const densitySelect = $("#densitySelect");
const fontSizeRange = $("#fontSizeRange");
const fontSizeLabel = $("#fontSizeLabel");
const expandAllBtn = $("#expandAllBtn");
const collapseAllBtn = $("#collapseAllBtn");

const allModeToggle = $("#allModeToggle");
const openBtn = $("#openBtn");
const openZipBtn = $("#openZipBtn");
const reloadBtn = $("#reloadBtn");
const rescanBtn = $("#rescanBtn");
const saveBtn = $("#saveBtn");
const saveAllBtn = $("#saveAllBtn");
const exportZipBtn = $("#exportZipBtn");
const downloadBtn = $("#downloadBtn");

const searchInput = $("#search");
const shortToggle = $("#shortToggle");
const attrsToggle = $("#attrsToggle");

const replaceAllBtn = $("#replaceAllBtn");
const findInput = $("#findInput");
const replaceInput = $("#replaceInput");

// Translate UI (if exists)
const langSelect = $("#langSelect"); // <select id="langSelect">
const translateCurrentBtn = $("#translateCurrentBtn"); // <button id="translateCurrentBtn">
const translateAllBtn = $("#translateAllBtn"); // <button id="translateAllBtn">

const hasFS = "showOpenFilePicker" in window && "showSaveFilePicker" in window;

// ---- UI Density & Font size ----
if (densitySelect) {
  document.body.dataset.density = densitySelect.value;
  densitySelect.addEventListener("change", () => {
    document.body.dataset.density = densitySelect.value;
  });
}

if (fontSizeRange) {
  fontSizeRange.addEventListener("input", () => {
    const v = fontSizeRange.value;
    if (fontSizeLabel) fontSizeLabel.textContent = v + "px";
    document.documentElement.style.setProperty("--base-font", v + "px");
    document.querySelectorAll(".card textarea").forEach((ta) => (ta.style.fontSize = v + "px"));
  });
}

if (expandAllBtn) {
  expandAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".group").forEach((g) => g.classList.remove("collapsed"));
  });
}
if (collapseAllBtn) {
  collapseAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".group").forEach((g) => g.classList.add("collapsed"));
  });
}

// ---- Sanitização ----
function normalizeHTML(src) {
  if (!src) return src;
  let s = src.replace(/^\uFEFF/, "");
  s = s.replace(/^(\s*\\n)+/, "").replace(/^\s*\n+/, "");
  return s;
}

function stripLiteralBackslashN(doc) {
  if (!doc || !doc.body) return;
  while (
    doc.body.firstChild &&
    doc.body.firstChild.nodeType === 3 &&
    /^(\s*\\n)+\s*$/.test(doc.body.firstChild.nodeValue)
  ) {
    doc.body.removeChild(doc.body.firstChild);
  }
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach((t) => (t.nodeValue = t.nodeValue.replace(/\\n+/g, "")));
}

// ---- Open Files ----
if (openBtn) {
  openBtn.addEventListener("click", async () => {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        excludeAcceptAllOption: true,
        types: [{ description: "Arquivos HTML", accept: { "text/html": [".html", ".htm"] } }],
      });
      if (!handles?.length) return;
      for (const handle of handles.slice(0, 5)) await openOne(handle);
      if (state.activeIndex === -1 && state.files.length > 0) setActive(0);
    } catch (e) {
      if (e.name !== "AbortError") alert("Não foi possível abrir: " + e.message);
    }
  });
}

// ---- Open ZIP ----
if (openZipBtn) {
  openZipBtn.addEventListener("click", async () => {
    try {
      if (!window.JSZip) {
        alert("JSZip não carregado.");
        return;
      }
      if (!window.showOpenFilePicker) {
        alert("Navegador não suporta showOpenFilePicker.");
        return;
      }

      const handles = await window.showOpenFilePicker({
        multiple: true,
        excludeAcceptAllOption: true,
        types: [{ description: "Arquivos ZIP", accept: { "application/zip": [".zip"] } }],
      });
      if (!handles?.length) return;

      const limited = handles.slice(0, 10);
      if (handles.length > 10) alert("Só os 10 primeiros ZIPs serão abertos.");

      let totalHtmls = 0;

      for (const handle of limited) {
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);

        const bundleId = ++zipBundleCounter;
        zipBundles.push({ id: bundleId, name: file.name, zip });

        const htmlEntries = [];
        zip.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir && /\.html?$/i.test(relativePath)) htmlEntries.push(zipEntry);
        });

        for (const entry of htmlEntries) {
          const text = await entry.async("text");
          const doc = parseToDoc(text);
          const nameInZip = entry.name.split("/").pop() || "arquivo.html";

          const fileEntry = {
            name: nameInZip,
            handle: null,
            doc,
            nodes: [],
            dirty: false,
            openedOrder: ++state.openCounter,
            zipBundleId: bundleId,
            zipPath: entry.name,
          };

          state.files.push(fileEntry);
          totalHtmls++;
        }
      }

      if (totalHtmls === 0) {
        alert("Nenhum arquivo HTML encontrado nos ZIPs.");
        return;
      }

      buildTabs();
      if (state.activeIndex === -1 && state.files.length > 0) setActive(0);
      else await rescanAllOrActive();

      toast(`✅ Carregado(s) ${totalHtmls} HTML(s) de ${limited.length} ZIP(s).`);
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error(e);
        alert("Falha ao abrir ZIP(s): " + e.message);
      }
    }
  });
}

if (reloadBtn) {
  reloadBtn.addEventListener("click", async () => {
    const f = state.files[state.activeIndex];
    if (!f) return;
    await reloadFromDisk(f);
    await rescanAllOrActive();
  });
}

async function openOne(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const doc = parseToDoc(text);
  const entry = {
    name: handle.name || file.name,
    handle,
    doc,
    nodes: [],
    dirty: false,
    openedOrder: ++state.openCounter,
    zipBundleId: null,
    zipPath: null,
  };
  state.files.push(entry);
  buildTabs();
  await rescanAllOrActive();
}

async function reloadFromDisk(entry) {
  if (!entry?.handle) return;
  const file = await entry.handle.getFile();
  const text = await file.text();
  entry.doc = parseToDoc(text);
  entry.dirty = false;
  updateDirty();
}

function parseToDoc(text) {
  const parser = new DOMParser();
  const html = normalizeHTML(text);
  const doc = parser.parseFromString(html, "text/html");
  stripLiteralBackslashN(doc);
  return doc;
}

function buildTabs() {
  if (!tabsEl) return;
  tabsEl.innerHTML = "";
  state.files.forEach((f, i) => {
    const el = document.createElement("div");
    el.className = "tab" + (i === state.activeIndex ? " active" : "");
    el.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${i + 1}. ${f.name}</span>
      ${f.dirty ? '<span class="dirty-dot"></span>' : ""}
    `;
    el.title = f.name;
    el.addEventListener("click", () => setActive(i));
    tabsEl.appendChild(el);
  });
}

async function setActive(i) {
  state.activeIndex = i;
  buildTabs();
  const f = state.files[i];
  if (!f) return;
  if (fileInfo) fileInfo.textContent = f.name + " • " + (f.dirty ? "alterado" : "sem alterações");
  await rescanAllOrActive();
}

function updateDirty() {
  const anyDirty = state.files.some((f) => f.dirty);
  if (dirtyText) {
    dirtyText.textContent = anyDirty ? "Há alterações não salvas." : "Nenhuma alteração.";
    dirtyText.className = "status-badge" + (anyDirty ? " dirty" : "");
  }
  buildTabs();
  const f = state.files[state.activeIndex];
  if (f && fileInfo) fileInfo.textContent = f.name + " • " + (f.dirty ? "alterado" : "sem alterações");
}

// ---- Visibility ----
function isHiddenByInline(el) {
  if (!el || el.nodeType !== 1) return false;
  const style = (el.getAttribute("style") || "").toLowerCase();
  if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
  if (el.hasAttribute("hidden")) return true;
  return false;
}

function isEffectivelyVisible(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    if (isHiddenByInline(cur)) return false;
    cur = cur.parentElement;
  }
  return true;
}

// ---- Scanner ----
async function rescanActive() {
  const file = state.files[state.activeIndex];
  if (!file) return;
  file.nodes = scanDoc(file.doc);
  renderList();
}

function scanDoc(doc) {
  const nodes = [];
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node) return NodeFilter.FILTER_REJECT;
      const raw = node.nodeValue || "";
      const txt = raw.replace(/\s+/g, " ").trim();
      if (!txt) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName?.toLowerCase();
      if (["script", "style", "noscript", "template", "head"].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (!isEffectivelyVisible(parent)) return NodeFilter.FILTER_REJECT;
      if (state.hideShort && txt.length < 3) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let id = 1;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const snippet = (node.nodeValue || "").replace(/\s+/g, " ").trim();
    nodes.push({
      id: id++,
      type: "text",
      parentSelector: cssPath(parent),
      snippet,
      node,
      parent,
      length: snippet.length,
    });
  }

  if (state.includeAttrs) {
    const candidates = Array.from(doc.querySelectorAll("[title], [alt], [aria-label]"));
    for (const el of candidates) {
      const attrs = ["title", "alt", "aria-label"];
      for (const key of attrs) {
        const v = el.getAttribute(key);
        if (!v) continue;
        const val = v.replace(/\s+/g, " ").trim();
        if (!val) continue;
        if (!isEffectivelyVisible(el)) continue;
        if (state.hideShort && val.length < 3) continue;
        nodes.push({
          id: ++id,
          type: "attr",
          key,
          parentSelector: cssPath(el),
          snippet: val,
          node: el,
          parent: el,
          length: val.length,
        });
      }
    }
  }
  return nodes;
}

async function rescanAllOrActive() {
  if (state.allMode) {
    for (const f of state.files) f.nodes = scanDoc(f.doc);
    renderListAll();
  } else {
    await rescanActive();
  }
}

function cssPath(el) {
  if (!el || el.nodeType !== 1) return "";
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 6) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += "#" + el.id;
      parts.unshift(selector);
      break;
    } else {
      let sib = el;
      let nth = 1;
      while ((sib = sib.previousElementSibling)) {
        if (sib.nodeName === el.nodeName) nth++;
      }
      selector += `:nth-of-type(${nth})`;
    }
    parts.unshift(selector);
    el = el.parentElement;
  }
  return parts.join(" > ");
}

// ---- Render: All Mode ----
function renderListAll() {
  const term = state.searchTerm?.toLowerCase() || "";
  if (!listEl) return;
  listEl.innerHTML = "";

  if (state.files.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <h2>Nenhum arquivo aberto</h2>
        <p>Abra arquivos HTML ou um arquivo ZIP para começar a editar textos de forma rápida e eficiente.</p>
        <div class="actions">
          <button class="btn btn-primary" onclick="document.getElementById('openBtn').click()">Abrir HTML(s)</button>
          <button class="btn" onclick="document.getElementById('openZipBtn').click()">Abrir arquivo ZIP</button>
        </div>
      </div>
    `;
    return;
  }

  state.files.forEach((file, idx) => {
    const rows = file.nodes.filter((n) => !term || n.snippet.toLowerCase().includes(term));
    const group = document.createElement("div");
    group.className = "group" + (idx === state.activeIndex ? " active" : "");

    const head = document.createElement("div");
    head.className = "groupHead";
    head.innerHTML = `
      <div class="name">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>${idx + 1}. ${file.name}</span>
        ${file.dirty ? '<span class="dirty-dot" style="width:8px;height:8px;"></span>' : ""}
      </div>
      <div class="chips">
        <span class="chip">${rows.length} textos</span>
        ${file.dirty ? '<span class="chip warning">editado</span>' : ""}
      </div>
    `;
    head.addEventListener("click", (e) => {
      if (e.target.closest(".chips")) setActive(idx);
      else group.classList.toggle("collapsed");
    });
    group.appendChild(head);

    const body = document.createElement("div");
    body.className = "groupBody";

    rows.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "card";

      const cardHeader = document.createElement("div");
      cardHeader.className = "cardHeader";
      cardHeader.innerHTML = `
        <span class="badge badge-id">#${entry.id}</span>
        <span class="badge ${entry.type === "text" ? "badge-text" : "badge-attr"}">${entry.type === "text" ? "texto" : `attr:${entry.key}`
        }</span>
      `;
      card.appendChild(cardHeader);

      const ta = document.createElement("textarea");
      ta.value = entry.snippet;
      ta.placeholder = "Edite aqui…";
      ta.addEventListener("input", () => onEditFromAll(file, entry, ta.value));
      card.appendChild(ta);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = entry.parentSelector || "(sem seletor)";
      card.appendChild(meta);

      body.appendChild(card);
    });

    group.appendChild(body);
    listEl.appendChild(group);
  });
}

// ---- Render: Single Mode ----
function renderList() {
  const file = state.files[state.activeIndex];
  if (!listEl) return;
  if (!file) {
    listEl.innerHTML = "";
    return;
  }

  const term = state.searchTerm?.toLowerCase() || "";
  const rows = file.nodes.filter((n) => !term || n.snippet.toLowerCase().includes(term));
  listEl.innerHTML = "";

  const group = document.createElement("div");
  group.className = "group active";

  const head = document.createElement("div");
  head.className = "groupHead";
  head.innerHTML = `
    <div class="name">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${file.name}</span>
      ${file.dirty ? '<span class="dirty-dot" style="width:8px;height:8px;"></span>' : ""}
    </div>
    <div class="chips">
      <span class="chip">${rows.length} textos</span>
    </div>
  `;
  group.appendChild(head);

  const body = document.createElement("div");
  body.className = "groupBody";

  rows.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "card";

    const cardHeader = document.createElement("div");
    cardHeader.className = "cardHeader";
    cardHeader.innerHTML = `
      <span class="badge badge-id">#${entry.id}</span>
      <span class="badge ${entry.type === "text" ? "badge-text" : "badge-attr"}">${entry.type === "text" ? "texto" : `attr:${entry.key}`
      }</span>
    `;
    card.appendChild(cardHeader);

    const ta = document.createElement("textarea");
    ta.value = entry.snippet;
    ta.placeholder = "Edite aqui…";
    ta.addEventListener("input", () => onEdit(entry, ta.value));
    card.appendChild(ta);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = entry.parentSelector || "(sem seletor)";
    card.appendChild(meta);

    body.appendChild(card);
  });

  group.appendChild(body);
  listEl.appendChild(group);
}

// ---- Editing ----
function onEdit(entry, newVal) {
  const file = state.files[state.activeIndex];
  if (!file) return;

  if (entry.type === "text") entry.node.nodeValue = newVal;
  else if (entry.type === "attr") entry.node.setAttribute(entry.key, newVal);

  entry.snippet = newVal;
  entry.length = newVal.length;
  file.dirty = true;
  updateDirty();
}

function onEditFromAll(file, entry, newVal) {
  if (entry.type === "text") entry.node.nodeValue = newVal;
  else if (entry.type === "attr") entry.node.setAttribute(entry.key, newVal);

  entry.snippet = newVal;
  entry.length = newVal.length;
  file.dirty = true;
  updateDirty();
}

// ---- Replace All ----
if (replaceAllBtn) {
  replaceAllBtn.addEventListener("click", () => {
    const file = state.files[state.activeIndex];
    if (!file) return;

    const find = (findInput?.value || "").toString();
    const repl = (replaceInput?.value || "").toString();
    if (!find) {
      alert("Informe um termo para buscar.");
      return;
    }

    let count = 0;
    file.nodes.forEach((entry) => {
      if (entry.snippet.includes(find)) {
        const newVal = entry.snippet.split(find).join(repl);
        if (newVal !== entry.snippet) {
          if (entry.type === "text") entry.node.nodeValue = newVal;
          else if (entry.type === "attr") entry.node.setAttribute(entry.key, newVal);
          entry.snippet = newVal;
          entry.length = newVal.length;
          count++;
        }
      }
    });

    if (count > 0) {
      file.dirty = true;
      updateDirty();
      state.allMode ? renderListAll() : renderList();
    }
    toast(`${count} substituições aplicadas`);
  });
}

// ---- Save ----
function serializeWithDoctype(doc) {
  const dt = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ""}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ""
    }>`
    : "";
  return dt + doc.documentElement.outerHTML;
}

async function saveFile(file) {
  stripLiteralBackslashN(file.doc);
  const html = serializeWithDoctype(file.doc);

  if (hasFS && file.handle) {
    try {
      const writable = await file.handle.createWritable();
      await writable.write(html);
      await writable.close();
      file.dirty = false;
      updateDirty();
      toast("✅ Salvo: " + file.name);
      return true;
    } catch (e) {
      alert("Falha ao salvar: " + e.message);
      return false;
    }
  } else {
    downloadAs(html, file.name);
    return true;
  }
}

if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    const f = state.files[state.activeIndex];
    if (!f) {
      toast("Selecione um arquivo primeiro");
      return;
    }
    await saveFile(f);
  });
}

if (saveAllBtn) {
  saveAllBtn.addEventListener("click", async () => {
    for (const f of state.files) if (f.dirty) await saveFile(f);
  });
}

if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    const f = state.files[state.activeIndex];
    if (!f) return;
    stripLiteralBackslashN(f.doc);
    const html = serializeWithDoctype(f.doc);
    downloadAs(html, f.name);
  });
}

// ---- Export ZIP ----
if (exportZipBtn) {
  exportZipBtn.addEventListener("click", async () => {
    if (!window.JSZip) {
      alert("JSZip não carregou.");
      return;
    }
    if (!state.files.length) {
      alert("Nenhum arquivo aberto.");
      return;
    }

    const fromBundles = state.files.filter((f) => f.zipBundleId);
    const standalone = state.files.filter((f) => !f.zipBundleId);
    const bundleIds = [...new Set(fromBundles.map((f) => f.zipBundleId))].filter(Boolean);

    for (const id of bundleIds) {
      const bundle = zipBundles.find((z) => z.id === id);
      if (!bundle) continue;

      const { zip, name } = bundle;
      const filesInBundle = fromBundles.filter((f) => f.zipBundleId === id);

      for (const f of filesInBundle) {
        stripLiteralBackslashN(f.doc);
        const html = serializeWithDoctype(f.doc);
        const pathInZip = f.zipPath || f.name || "index.html";
        zip.file(pathInZip, html);
      }

      const blob = await zip.generateAsync({ type: "blob" });

      let zipName = name || "edited.zip";
      if (!zipName.toLowerCase().endsWith(".zip")) zipName += ".zip";
      const dot = zipName.lastIndexOf(".");
      if (dot > 0) zipName = zipName.slice(0, dot) + "-edited" + zipName.slice(dot);

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: zipName,
            types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast("✅ ZIP salvo: " + (handle.name || zipName));
        } catch (err) {
          downloadBlobAs(blob, zipName);
          toast("⬇️ ZIP exportado: " + zipName);
        }
      } else {
        downloadBlobAs(blob, zipName);
        toast("⬇️ ZIP exportado: " + zipName);
      }
    }

    if (standalone.length && bundleIds.length === 0) {
      const zip = new JSZip();
      for (const f of standalone) {
        stripLiteralBackslashN(f.doc);
        const html = serializeWithDoctype(f.doc);
        const fname = (f.name || "file.html").replace(/[\/\\]/g, "_");
        zip.file(fname, html);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const zipName = "edited-htmls.zip";

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: zipName,
            types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast("✅ ZIP salvo: " + (handle.name || zipName));
        } catch (err) {
          downloadBlobAs(blob, zipName);
          toast("⬇️ ZIP exportado: " + zipName);
        }
      } else {
        downloadBlobAs(blob, zipName);
        toast("⬇️ ZIP exportado: " + zipName);
      }
    }
  });
}

function downloadAs(content, filename) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  downloadBlobAs(blob, filename || "edited.html");
}

function downloadBlobAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---- Filters ----
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    state.allMode ? renderListAll() : renderList();
  });
}
if (shortToggle) {
  shortToggle.addEventListener("change", (e) => {
    state.hideShort = e.target.checked;
    rescanAllOrActive();
  });
}
if (attrsToggle) {
  attrsToggle.addEventListener("change", (e) => {
    state.includeAttrs = e.target.checked;
    rescanAllOrActive();
  });
}
if (rescanBtn) rescanBtn.addEventListener("click", rescanAllOrActive);
if (allModeToggle) {
  allModeToggle.addEventListener("change", (e) => {
    state.allMode = e.target.checked;
    rescanAllOrActive();
  });
}

// ==========================
// ✅ TRANSLATE (FIX APPLY + TIMEOUT + BETTER ERRORS)
// ==========================
// ==========================
// ✅ TRANSLATE (FAST: translates only scanned nodes)
// ==========================
function setTranslatingUI(on) {
  state.translating = !!on;

  if (translateCurrentBtn) {
    translateCurrentBtn.disabled = on;
    if (on) translateCurrentBtn.dataset._old = translateCurrentBtn.textContent;
    translateCurrentBtn.textContent = on ? "Traduzindo..." : (translateCurrentBtn.dataset._old || "Traduzir atual");
  }

  if (translateAllBtn) {
    translateAllBtn.disabled = on;
    if (on) translateAllBtn.dataset._old = translateAllBtn.textContent;
    translateAllBtn.textContent = on ? "Traduzindo..." : (translateAllBtn.dataset._old || "Traduzir todos");
  }

  if (langSelect) langSelect.disabled = on;
}

function getSelectedLang() {
  if (!langSelect) return "Inglês";
  return (langSelect.value || langSelect.options?.[langSelect.selectedIndex]?.text || "Inglês").trim();
}

// ✅ traduz SOMENTE os snippets (cards) — muito mais rápido e não trava
async function translateNodes(file, targetLang) {
  // garante que existe scan atualizado
  if (!file.nodes || !file.nodes.length) {
    file.nodes = scanDoc(file.doc);
  }

  // pega só os textos atuais do editor
  const texts = file.nodes.map((n) => n.snippet);

  // nada pra traduzir
  if (!texts.length) return;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);

  let data;
  try {
    const r = await fetch("/api/translate", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, targetLang }),
    });

    data = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg = data?.error ? String(data.error) : "Falha ao traduzir";
      throw new Error(msg);
    }
  } finally {
    clearTimeout(t);
  }

  if (!Array.isArray(data?.texts)) {
    throw new Error("Resposta inválida da API (sem texts[]).");
  }
  if (data.texts.length !== texts.length) {
    throw new Error(`Quantidade de traduções não bate. Esperado ${texts.length}, veio ${data.texts.length}.`);
  }

  // aplica de volta nos NODES do DOM (sem mexer em HTML inteiro)
  for (let i = 0; i < file.nodes.length; i++) {
    const entry = file.nodes[i];
    const newVal = (data.texts[i] == null ? "" : String(data.texts[i]));

    if (entry.type === "text") entry.node.nodeValue = newVal;
    else if (entry.type === "attr") entry.node.setAttribute(entry.key, newVal);

    entry.snippet = newVal;
    entry.length = newVal.length;
  }

  file.dirty = true;
}

if (translateCurrentBtn) {
  translateCurrentBtn.addEventListener("click", async () => {
    const f = state.files[state.activeIndex];
    if (!f) {
      toast("Abra um arquivo primeiro.");
      return;
    }

    const lang = getSelectedLang();
    try {
      setTranslatingUI(true);

      // ✅ importante: rescan antes (pega o texto atualizado do editor)
      f.nodes = scanDoc(f.doc);

      await translateNodes(f, lang);

      updateDirty();
      await rescanAllOrActive();
      toast(`✅ Traduzido: ${f.name} → ${lang}`);
    } catch (e) {
      console.error(e);
      toast("❌ " + (e?.message || "Erro ao traduzir"));
      alert("Erro ao traduzir:\n" + (e?.message || e));
    } finally {
      setTranslatingUI(false);
    }
  });
}

if (translateAllBtn) {
  translateAllBtn.addEventListener("click", async () => {
    if (!state.files.length) {
      toast("Abra arquivos primeiro.");
      return;
    }

    const lang = getSelectedLang();
    try {
      setTranslatingUI(true);

      for (let i = 0; i < state.files.length; i++) {
        const f = state.files[i];

        // ✅ rescan por arquivo antes de traduzir
        f.nodes = scanDoc(f.doc);

        await translateNodes(f, lang);
      }

      updateDirty();
      await rescanAllOrActive();
      toast(`✅ Traduzido tudo → ${lang}`);
    } catch (e) {
      console.error(e);
      toast("❌ " + (e?.message || "Erro ao traduzir"));
      alert("Erro ao traduzir:\n" + (e?.message || e));
    } finally {
      setTranslatingUI(false);
    }
  });
}
