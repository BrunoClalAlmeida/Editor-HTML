// Fast HTML Editor – v9 (UI simplificada + Tradução via API no Vercel)

const state = {
  files: [],
  activeIndex: -1,
  includeAttrs: false,
  hideShort: true,
  searchTerm: '',
  openCounter: 0,
  allMode: true, // fica sempre "ver todos juntos" (sem a barra que você não quer)
};

const zipBundles = [];
let zipBundleCounter = 0;

// ---- Helpers ----
const $ = (s) => document.querySelector(s);

const tabsEl = $('#tabs');
const listEl = $('#textList');
const dirtyText = $('#dirtyText');
const fileInfo = $('#fileInfo');

const langSelect = $('#langSelect');
const translateActiveBtn = $('#translateActiveBtn');
const translateAllBtn = $('#translateAllBtn');

const hasFS = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;

// ---- Sanitização ----
function normalizeHTML(src) {
  if (!src) return src;
  let s = src.replace(/^\uFEFF/, '');
  s = s.replace(/^(\s*\\n)+/, '').replace(/^\s*\n+/, '');
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
  nodes.forEach((t) => (t.nodeValue = t.nodeValue.replace(/\\n+/g, '')));
}

// ---- Open Files ----
$('#openBtn').addEventListener('click', async () => {
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      excludeAcceptAllOption: true,
      types: [{ description: 'Arquivos HTML', accept: { 'text/html': ['.html', '.htm'] } }],
    });
    if (!handles?.length) return;
    for (const handle of handles.slice(0, 10)) await openOne(handle);
    if (state.activeIndex === -1 && state.files.length > 0) setActive(0);
  } catch (e) {
    if (e.name !== 'AbortError') alert('Não foi possível abrir: ' + e.message);
  }
});

// ---- Open ZIP ----
const openZipBtn = $('#openZipBtn');
if (openZipBtn) {
  openZipBtn.addEventListener('click', async () => {
    try {
      if (!window.JSZip) return alert('JSZip não carregado.');
      if (!window.showOpenFilePicker) return alert('Navegador não suporta showOpenFilePicker.');

      const handles = await window.showOpenFilePicker({
        multiple: true,
        excludeAcceptAllOption: true,
        types: [{ description: 'Arquivos ZIP', accept: { 'application/zip': ['.zip'] } }],
      });
      if (!handles?.length) return;

      const limited = handles.slice(0, 10);
      if (handles.length > 10) alert('Só os 10 primeiros ZIPs serão abertos.');

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
          const text = await entry.async('text');
          const doc = parseToDoc(text);
          const nameInZip = entry.name.split('/').pop() || 'arquivo.html';

          state.files.push({
            name: nameInZip,
            handle: null,
            doc,
            nodes: [],
            dirty: false,
            openedOrder: ++state.openCounter,
            zipBundleId: bundleId,
            zipPath: entry.name,
          });
          totalHtmls++;
        }
      }

      if (totalHtmls === 0) return alert('Nenhum arquivo HTML encontrado nos ZIPs.');

      buildTabs();
      if (state.activeIndex === -1 && state.files.length > 0) setActive(0);
      else await rescanAllOrActive();

      toast(`✅ Carregado(s) ${totalHtmls} HTML(s) de ${limited.length} ZIP(s).`);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error(e);
        alert('Falha ao abrir ZIP(s): ' + e.message);
      }
    }
  });
}

$('#reloadBtn').addEventListener('click', async () => {
  const f = state.files[state.activeIndex];
  if (!f) return;
  await reloadFromDisk(f);
  await rescanAllOrActive();
});

async function openOne(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const doc = parseToDoc(text);

  state.files.push({
    name: handle.name || file.name,
    handle,
    doc,
    nodes: [],
    dirty: false,
    openedOrder: ++state.openCounter,
    zipBundleId: null,
    zipPath: null,
  });

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
    el.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span>${i + 1}. ${escapeHtml(f.name)}</span>
      ${f.dirty ? '<span class="dirty-dot"></span>' : ''}
    `;
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
  const anyDirty = state.files.some((f) => f.dirty);
  dirtyText.textContent = anyDirty ? 'Há alterações não salvas.' : 'Nenhuma alteração.';
  dirtyText.className = 'status-badge' + (anyDirty ? ' dirty' : '');
  buildTabs();
  const f = state.files[state.activeIndex];
  if (f) fileInfo.textContent = f.name + ' • ' + (f.dirty ? 'alterado' : 'sem alterações');
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- Visibility ----
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

// ---- Scanner ----
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
    },
  });

  let id = 1;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    const snippet = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    nodes.push({
      id: id++,
      type: 'text',
      parentSelector: cssPath(parent),
      snippet,
      node,
      parent,
      length: snippet.length,
    });
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

        nodes.push({
          id: ++id,
          type: 'attr',
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
  // sempre no modo "todos juntos" (sem aquele bloco que você não quer)
  for (const f of state.files) f.nodes = scanDoc(f.doc);
  renderListAll();
}

function cssPath(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 6) {
    let selector = el.nodeName.toLowerCase();
    if (el.id) {
      selector += '#' + el.id;
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
  return parts.join(' > ');
}

// ---- Render: All Mode ----
function renderListAll() {
  const term = state.searchTerm?.toLowerCase() || '';
  listEl.innerHTML = '';

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
          <button class="btn btn-primary" type="button" onclick="document.getElementById('openBtn').click()">
            Abrir HTML(s)
          </button>
          <button class="btn" type="button" onclick="document.getElementById('openZipBtn').click()">
            Abrir arquivo ZIP
          </button>
        </div>
      </div>
    `;
    fileInfo.textContent = '';
    return;
  }

  state.files.forEach((file, idx) => {
    const rows = file.nodes.filter((n) => !term || n.snippet.toLowerCase().includes(term));
    const group = document.createElement('div');
    group.className = 'group' + (idx === state.activeIndex ? ' active' : '');

    const head = document.createElement('div');
    head.className = 'groupHead';
    head.innerHTML = `
      <div class="name">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>${idx + 1}. ${escapeHtml(file.name)}</span>
        ${file.dirty ? '<span class="dirty-dot" style="width:8px;height:8px;background:var(--warning);border-radius:50%;"></span>' : ''}
      </div>
      <div class="chips">
        <span class="chip">${rows.length} textos</span>
        ${file.dirty ? '<span class="chip warning">editado</span>' : ''}
      </div>
    `;

    head.addEventListener('click', (e) => {
      if (e.target.closest('.chips')) {
        setActive(idx);
      } else {
        group.classList.toggle('collapsed');
      }
    });

    group.appendChild(head);

    const body = document.createElement('div');
    body.className = 'groupBody';

    rows.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'cardHeader';
      cardHeader.innerHTML = `
        <span class="badge badge-id">#${entry.id}</span>
        <span class="badge ${entry.type === 'text' ? 'badge-text' : 'badge-attr'}">
          ${entry.type === 'text' ? 'texto' : `attr:${entry.key}`}
        </span>
      `;
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

  // file info
  const f = state.files[state.activeIndex] || state.files[0];
  if (state.activeIndex === -1 && state.files.length) state.activeIndex = 0;
  if (f) fileInfo.textContent = f.name + ' • ' + (f.dirty ? 'alterado' : 'sem alterações');
}

// ---- Editing ----
function onEditFromAll(file, entry, newVal) {
  if (entry.type === 'text') entry.node.nodeValue = newVal;
  else if (entry.type === 'attr') entry.node.setAttribute(entry.key, newVal);

  entry.snippet = newVal;
  entry.length = newVal.length;
  file.dirty = true;
  updateDirty();
}

// ---- Replace All ----
$('#replaceAllBtn').addEventListener('click', () => {
  const file = state.files[state.activeIndex];
  if (!file) return;

  const find = $('#findInput').value;
  const repl = $('#replaceInput').value;
  if (!find) return alert('Informe um termo para buscar.');

  let count = 0;
  file.nodes.forEach((entry) => {
    if (entry.snippet.includes(find)) {
      const newVal = entry.snippet.split(find).join(repl);
      if (newVal !== entry.snippet) {
        if (entry.type === 'text') entry.node.nodeValue = newVal;
        else if (entry.type === 'attr') entry.node.setAttribute(entry.key, newVal);
        entry.snippet = newVal;
        entry.length = newVal.length;
        count++;
      }
    }
  });

  if (count > 0) {
    file.dirty = true;
    updateDirty();
    renderListAll();
  }

  toast(`${count} substituições aplicadas`);
});

// ---- Save ----
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
      file.dirty = false;
      updateDirty();
      toast('✅ Salvo: ' + file.name);
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
  const f = state.files[state.activeIndex];
  if (!f) return toast('Selecione um arquivo primeiro');
  await saveFile(f);
});

$('#saveAllBtn').addEventListener('click', async () => {
  for (const f of state.files) if (f.dirty) await saveFile(f);
});

$('#downloadBtn').addEventListener('click', () => {
  const f = state.files[state.activeIndex];
  if (!f) return;
  stripLiteralBackslashN(f.doc);
  const html = serializeWithDoctype(f.doc);
  downloadAs(html, f.name);
});

// ---- Export ZIP ----
document.getElementById('exportZipBtn').addEventListener('click', async () => {
  if (!window.JSZip) return alert('JSZip não carregou.');
  if (!state.files.length) return alert('Nenhum arquivo aberto.');

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
      const pathInZip = f.zipPath || f.name || 'index.html';
      zip.file(pathInZip, html);
    }

    try {
      const blob = await zip.generateAsync({ type: 'blob' });

      let zipName = name || 'edited.zip';
      if (!zipName.toLowerCase().endsWith('.zip')) zipName += '.zip';
      const dot = zipName.lastIndexOf('.');
      if (dot > 0) zipName = zipName.slice(0, dot) + '-edited' + zipName.slice(dot);

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: zipName,
            types: [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast('✅ ZIP salvo: ' + (handle.name || zipName));
        } catch (err) {
          downloadBlobAs(blob, zipName);
          toast('⬇️ ZIP exportado: ' + zipName);
        }
      } else {
        downloadBlobAs(blob, zipName);
        toast('⬇️ ZIP exportado: ' + zipName);
      }
    } catch (e) {
      console.error(e);
      alert('Falha ao gerar ZIP: ' + e.message);
    }
  }

  if (standalone.length && bundleIds.length === 0) {
    const zip = new JSZip();
    for (const f of standalone) {
      stripLiteralBackslashN(f.doc);
      const html = serializeWithDoctype(f.doc);
      const fname = (f.name || 'file.html').replace(/[\/\\]/g, '_');
      zip.file(fname, html);
    }

    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      const zipName = 'edited-htmls.zip';

      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: zipName,
            types: [{ description: 'Arquivo ZIP', accept: { 'application/zip': ['.zip'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast('✅ ZIP salvo: ' + (handle.name || zipName));
        } catch (err) {
          downloadBlobAs(blob, zipName);
          toast('⬇️ ZIP exportado: ' + zipName);
        }
      } else {
        downloadBlobAs(blob, zipName);
        toast('⬇️ ZIP exportado: ' + zipName);
      }
    } catch (e) {
      console.error(e);
      alert('Falha ao gerar ZIP: ' + e.message);
    }
  }
});

function downloadAs(content, filename) {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
  downloadBlobAs(blob, filename || 'edited.html');
}

function downloadBlobAs(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---- Filters ----
$('#search').addEventListener('input', (e) => {
  state.searchTerm = e.target.value;
  renderListAll();
});
$('#shortToggle').addEventListener('change', (e) => {
  state.hideShort = e.target.checked;
  rescanAllOrActive();
});
$('#attrsToggle').addEventListener('change', (e) => {
  state.includeAttrs = e.target.checked;
  rescanAllOrActive();
});
$('#rescanBtn').addEventListener('click', rescanAllOrActive);

// ---- Tradução via API ----
translateActiveBtn.addEventListener('click', async () => {
  const file = state.files[state.activeIndex];
  if (!file) return toast('Abra um arquivo primeiro.');
  await translateFile(file, langSelect.value);
});

translateAllBtn.addEventListener('click', async () => {
  if (!state.files.length) return toast('Abra arquivo(s) primeiro.');
  const lang = langSelect.value;

  // traduz 1 por 1 (mais seguro)
  for (const f of state.files) {
    await translateFile(f, lang);
  }
});

async function translateFile(file, lang) {
  const nodes = file.nodes || [];
  if (!nodes.length) {
    file.nodes = scanDoc(file.doc);
  }

  // pega todos snippets em ordem
  const entries = file.nodes;

  // evita chamadas gigantes: chunk de 40 itens
  const chunkSize = 40;

  toast(`🌍 Traduzindo: ${file.name}...`);

  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const texts = chunk.map((e) => e.snippet);

    const translated = await callTranslateAPI(texts, lang);

    if (!Array.isArray(translated) || translated.length !== chunk.length) {
      throw new Error('Resposta da tradução inválida.');
    }

    // aplica traduções no DOM
    for (let k = 0; k < chunk.length; k++) {
      const entry = chunk[k];
      const newVal = translated[k];

      if (entry.type === 'text') entry.node.nodeValue = newVal;
      else if (entry.type === 'attr') entry.node.setAttribute(entry.key, newVal);

      entry.snippet = newVal;
      entry.length = newVal.length;
    }
  }

  file.dirty = true;
  updateDirty();
  await rescanAllOrActive();

  toast(`✅ Tradução aplicada: ${file.name}`);
}

async function callTranslateAPI(texts, targetLang) {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLang, texts }),
  });

  if (!res.ok) {
    const msg = await safeReadText(res);
    throw new Error(`Erro na API (${res.status}): ${msg || 'sem detalhes'}`);
  }

  const data = await res.json();
  return data.translations;
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return ''; }
}

// Initial render
renderListAll();
