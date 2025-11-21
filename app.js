// Fast HTML Editor v7.1 – All-in-one responsivo, com grid adaptável + densidade e tamanho de fonte.

const state = {
  files: [], // { name, handle, doc, nodes: NodeEntry[], dirty:false, openedOrder:number }
  activeIndex: -1,
  includeAttrs: false,
  hideShort: true,
  searchTerm: '',
  openCounter: 0,
  allMode: true,
};

// ---- Helpers ----
const $ = (s) => document.querySelector(s);
const tabsEl = $('#tabs');
const listEl = $('#textList');
const dirtyText = $('#dirtyText');
const fileInfo = $('#fileInfo');

// Controles de UI
const densitySelect = $('#densitySelect');
const fontSizeRange = $('#fontSizeRange');
const fontSizeLabel = $('#fontSizeLabel');
const expandAllBtn = $('#expandAllBtn');
const collapseAllBtn = $('#collapseAllBtn');

const hasFS = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

// ---- UI Density & Font size ----
document.body.dataset.density = densitySelect.value;
densitySelect.addEventListener('change', () => {
  document.body.dataset.density = densitySelect.value;
});
fontSizeRange.addEventListener('input', () => {
  const v = fontSizeRange.value;
  fontSizeLabel.textContent = v + 'px';
  document.documentElement.style.setProperty('--base-font', v + 'px');
  // aplica nos textareas via inline para refletir imediatamente
  document.querySelectorAll('.card textarea').forEach(ta => ta.style.fontSize = v + 'px');
});

// Expandir/Recolher grupos (apenas alterna classe 'collapsed')
expandAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.group').forEach(g => g.classList.remove('collapsed'));
});
collapseAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.group').forEach(g => g.classList.add('collapsed'));
});

// ---- Sanitização ----
function normalizeHTML(src) {
  if (!src) return src;
  let s = src.replace(/^\uFEFF/, '');
  s = s.replace(/^(\s*\\n)+/, '').replace(/^\s*\n+/, '');
  return s;
}
function stripLiteralBackslashN(doc) {
  if (!doc || !doc.body) return;
  while (doc.body.firstChild && doc.body.firstChild.nodeType === 3 && /^(\\s*\\n)+\\s*$/.test(doc.body.firstChild.nodeValue)) {
    doc.body.removeChild(doc.body.firstChild);
  }
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(t => t.nodeValue = t.nodeValue.replace(/\\n+/g, ''));
}

// ---- Abrir e recarregar arquivos ----
$('#openBtn').addEventListener('click', async () => {
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      excludeAcceptAllOption: true,
      types: [{ description: 'Arquivos HTML', accept: { 'text/html': ['.html', '.htm'] } }]
    });
    if (!handles?.length) return;
    for (const handle of handles.slice(0, 5)) await openOne(handle);
    if (state.activeIndex === -1 && state.files.length > 0) setActive(0);
  } catch (e) {
    if (e.name !== 'AbortError') alert('Não foi possível abrir: ' + e.message);
  }
});

$('#reloadBtn').addEventListener('click', async () => {
  const f = state.files[state.activeIndex]; if (!f) return;
  await reloadFromDisk(f);
  await rescanAllOrActive();
});

async function openOne(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const doc = parseToDoc(text);
  const entry = { name: handle.name || file.name, handle, doc, nodes: [], dirty: false, openedOrder: ++state.openCounter };
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
  const doc = parser.parseFromString(html, 'text/html');
  stripLiteralBackslashN(doc);
  return doc;
}

function buildTabs() {
  tabsEl.innerHTML = '';
  state.files.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'tab' + (i === state.activeIndex ? ' active' : '');
    el.textContent = `${i + 1}. ${f.name}${f.dirty ? ' •' : ''}`;
    el.title = f.name;
    el.addEventListener('click', () => setActive(i));
    tabsEl.appendChild(el);
  });
}

async function setActive(i) {
  state.activeIndex = i;
  buildTabs();
  const f = state.files[i];
  if (!f) return;
  fileInfo.textContent = f.name + ' • ' + (f.dirty ? 'alterado' : 'sem alterações');
  await rescanAllOrActive();
}

function updateDirty() {
  const anyDirty = state.files.some(f => f.dirty);
  dirtyText.textContent = anyDirty ? 'Há alterações não salvas.' : 'Nenhuma alteração.';
  buildTabs();
  const f = state.files[state.activeIndex];
  if (f) fileInfo.textContent = f.name + ' • ' + (f.dirty ? 'alterado' : 'sem alterações');
}

// ---- Visibilidade (DOMParser) ----
function isHiddenByInline(el) {
  if (!el || el.nodeType !== 1) return false;
  const style = (el.getAttribute('style') || '').toLowerCase();
  if (style.includes('display:none') || style.includes('visibility:hidden')) return true;
  if (el.hasAttribute('hidden')) return true;
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

// ---- Scanner de textos ----
async function rescanActive() {
  const file = state.files[state.activeIndex]; if (!file) return;
  file.nodes = scanDoc(file.doc);
  renderList();
}

function scanDoc(doc) {
  const nodes = [];
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node) return NodeFilter.FILTER_REJECT;
      const raw = node.nodeValue || '';
      const txt = raw.replace(/\s+/g, ' ').trim();
      if (!txt) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'noscript', 'template', 'head'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (!isEffectivelyVisible(parent)) return NodeFilter.FILTER_REJECT;
      if (state.hideShort && txt.length < 3) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let id = 1;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const snippet = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    nodes.push({ id: id++, type: 'text', parentSelector: cssPath(parent), snippet, node, parent, length: snippet.length });
  }

  if (state.includeAttrs) {
    const candidates = Array.from(doc.querySelectorAll('[title], [alt], [aria-label]'));
    for (const el of candidates) {
      const attrs = ['title', 'alt', 'aria-label'];
      for (const key of attrs) {
        const v = el.getAttribute(key);
        if (!v) continue;
        const val = v.replace(/\s+/g, ' ').trim();
        if (!val) continue;
        if (!isEffectivelyVisible(el)) continue;
        if (state.hideShort && val.length < 3) continue;
        nodes.push({ id: ++id, type: 'attr', key, parentSelector: cssPath(el), snippet: val, node: el, parent: el, length: val.length });
      }
    }
  }
  return nodes;
}

async function rescanAllOrActive() {
  if (state.allMode) {
    for (const f of state.files) { f.nodes = scanDoc(f.doc); }
    renderListAll();
  } else {
    await rescanActive();
  }
}

function cssPath(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 6) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) { selector += '#' + el.id; parts.unshift(selector); break; }
    else {
      let sib = el; let nth = 1;
      while (sib = sib.previousElementSibling) { if (sib.nodeName === el.nodeName) nth++; }
      selector += `:nth-of-type(${nth})`;
    }
    parts.unshift(selector);
    el = el.parentElement;
  }
  return parts.join(' > ');
}

// ---- Render: todos juntos (responsivo em grid) ----
function renderListAll() {
  const term = state.searchTerm?.toLowerCase() || '';
  listEl.innerHTML = '';

  state.files.forEach((file, idx) => {
    const rows = file.nodes.filter(n => !term || n.snippet.toLowerCase().includes(term));
    const group = document.createElement('div');
    group.className = 'group';

    const head = document.createElement('div');
    head.className = 'groupHead';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = `${idx + 1}. ${file.name}${file.dirty ? ' •' : ''}`;
    name.title = 'Clique para focar este arquivo (Salvar atual agirá sobre ele)';
    name.addEventListener('click', () => setActive(idx));
    const chips = document.createElement('div'); chips.className = 'chips';
    const chipCount = document.createElement('span'); chipCount.className = 'chip'; chipCount.textContent = `${rows.length} textos`;
    chips.appendChild(chipCount);
    head.appendChild(name); head.appendChild(chips);
    group.appendChild(head);

    const body = document.createElement('div');
    body.className = 'groupBody';

    rows.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'cardHeader';
      cardHeader.innerHTML = `<span class="badge">#${entry.id}</span><span class="badge">${entry.type === 'text' ? 'texto' : `attr:${entry.key}`}</span>`;
      card.appendChild(cardHeader);

      const ta = document.createElement('textarea');
      ta.value = entry.snippet;
      ta.placeholder = 'Edite aqui…';
      ta.addEventListener('input', () => onEditFromAll(file, entry, ta.value));
      card.appendChild(ta);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = entry.parentSelector || '(sem seletor)';
      card.appendChild(meta);

      body.appendChild(card);
    });

    group.appendChild(body);
    listEl.appendChild(group);
  });
}

// ---- Render: modo um por vez ----
function renderList() {
  const file = state.files[state.activeIndex];
  if (!file) { listEl.innerHTML = ''; return; }
  const term = state.searchTerm?.toLowerCase() || '';
  const rows = file.nodes.filter(n => !term || n.snippet.toLowerCase().includes(term));
  listEl.innerHTML = '';

  const group = document.createElement('div');
  group.className = 'group';

  const head = document.createElement('div');
  head.className = 'groupHead';
  const name = document.createElement('div');
  name.className = 'name'; name.textContent = file.name + (file.dirty ? ' •' : '');
  head.appendChild(name);

  const body = document.createElement('div');
  body.className = 'groupBody';

  rows.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'card';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'cardHeader';
    cardHeader.innerHTML = `<span class="badge">#${entry.id}</span><span class="badge">${entry.type === 'text' ? 'texto' : `attr:${entry.key}`}</span>`;
    card.appendChild(cardHeader);

    const ta = document.createElement('textarea');
    ta.value = entry.snippet;
    ta.placeholder = 'Edite aqui…';
    ta.addEventListener('input', () => onEdit(entry, ta.value));
    card.appendChild(ta);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = entry.parentSelector || '(sem seletor)';
    card.appendChild(meta);

    body.appendChild(card);
  });

  group.appendChild(head);
  group.appendChild(body);
  listEl.appendChild(group);
}

// ---- Edição ----
function onEdit(entry, newVal) {
  const file = state.files[state.activeIndex]; if (!file) return;
  if (entry.type === 'text') {
    entry.node.nodeValue = newVal;
  } else if (entry.type === 'attr') {
    entry.node.setAttribute(entry.key, newVal);
  }
  entry.snippet = newVal;
  entry.length = newVal.length;
  file.dirty = true;
  updateDirty();
}

function onEditFromAll(file, entry, newVal) {
  if (entry.type === 'text') {
    entry.node.nodeValue = newVal;
  } else if (entry.type === 'attr') {
    entry.node.setAttribute(entry.key, newVal);
  }
  entry.snippet = newVal;
  entry.length = newVal.length;
  file.dirty = true;
  updateDirty();
}

// ---- Replace all ----
$('#replaceAllBtn').addEventListener('click', () => {
  const file = state.files[state.activeIndex]; if (!file) return;
  const find = $('#findInput').value;
  const repl = $('#replaceInput').value;
  if (!find) { alert('Informe um termo para buscar.'); return; }

  let count = 0;
  file.nodes.forEach(entry => {
    if (entry.snippet.includes(find)) {
      const newVal = entry.snippet.split(find).join(repl);
      if (newVal !== entry.snippet) {
        if (entry.type === 'text') { entry.node.nodeValue = newVal; }
        else if (entry.type === 'attr') { entry.node.setAttribute(entry.key, newVal); }
        entry.snippet = newVal; entry.length = newVal.length; count++;
      }
    }
  });
  if (count > 0) { file.dirty = true; updateDirty(); state.allMode ? renderListAll() : renderList(); }
  alert(`Substituições aplicadas: ${count}`);
});

// ---- Salvar ----
function serializeWithDoctype(doc) {
  const dt = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>`
    : '';
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
      file.dirty = false; updateDirty();
      toast('✅ Salvo em ' + file.name);
      return true;
    } catch (e) {
      alert('Falha ao salvar: ' + e.message);
      return false;
    }
  } else {
    downloadAs(html, file.name);
    return true;
  }
}

$('#saveBtn').addEventListener('click', async () => {
  const f = state.files[state.activeIndex]; if (!f) { alert('Selecione um arquivo (clique no nome do grupo).'); return; }
  await saveFile(f);
});

$('#saveAllBtn').addEventListener('click', async () => {
  for (const f of state.files) { if (f.dirty) await saveFile(f); }
});

$('#downloadBtn').addEventListener('click', () => {
  const f = state.files[state.activeIndex]; if (!f) return;
  stripLiteralBackslashN(f.doc);
  const html = serializeWithDoctype(f.doc);
  downloadAs(html, f.name);
});

// ---- Exportar ZIP ----
document.getElementById('exportZipBtn').addEventListener('click', async () => {
  if (!window.JSZip) {
    alert('JSZip não carregou. Verifique a tag <script> do JSZip no index.html.');
    return;
  }
  if (!state.files.length) {
    alert('Nenhum arquivo aberto.');
    return;
  }

  const suggested = 'edited-htmls.zip';
  let zipName = prompt('Nome do arquivo ZIP:', suggested);
  if (!zipName) zipName = suggested;
  if (!zipName.toLowerCase().endsWith('.zip')) zipName += '.zip';

  const zip = new JSZip();
  for (const f of state.files) {
    stripLiteralBackslashN(f.doc);
    const html = serializeWithDoctype(f.doc);
    const fname = (f.name || 'file.html').replace(/[\/\\]/g, '_');
    zip.file(fname, html);
  }

  try {
    const blob = await zip.generateAsync({ type: 'blob' });
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: zipName,
          types: [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast('✅ ZIP salvo: ' + (handle.name || zipName));
        return;
      } catch (err) {
        console.warn('SaveFilePicker cancelado/falhou. Usando download.', err);
      }
    }
    downloadBlobAs(blob, zipName);
    toast('⬇️ ZIP exportado: ' + zipName);
  } catch (e) {
    console.error(e);
    alert('Falha ao gerar ZIP: ' + e.message);
  }
});

function downloadAs(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  downloadBlobAs(blob, filename || 'edited.html');
}
function downloadBlobAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '14px', right: '14px',
    background: '#0b1325', border: '1px solid #23304a',
    padding: '10px 12px', borderRadius: '10px', color: '#cbd5e1',
    zIndex: 9999, boxShadow: '0 6px 24px rgba(0,0,0,.35)'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1600);
}

// ---- Filtros UI ----
$('#search').addEventListener('input', (e) => { state.searchTerm = e.target.value; state.allMode ? renderListAll() : renderList(); });
$('#shortToggle').addEventListener('change', (e) => { state.hideShort = e.target.checked; rescanAllOrActive(); });
$('#attrsToggle').addEventListener('change', (e) => { state.includeAttrs = e.target.checked; rescanAllOrActive(); });
$('#rescanBtn').addEventListener('click', rescanAllOrActive);
$('#allModeToggle').addEventListener('change', (e) => { state.allMode = e.target.checked; rescanAllOrActive(); });
