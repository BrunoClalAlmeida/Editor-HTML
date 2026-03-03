// Fast HTML Editor v11 — UX simplificada (SEM API KEY NO FRONT)

const state = { files: [], activeIndex: -1, openCounter: 0 };
const zipBundles = [];
let zipBundleCounter = 0;

const $ = s => document.querySelector(s);
const listEl = $('#textList');
const emptyState = $('#emptyState');
const fileCountEl = $('#fileCount');
const dirtyText = $('#dirtyText');
const mainActionBtn = $('#mainActionBtn');
const mainActionLabel = $('#mainActionLabel');
const iconTranslate = mainActionBtn.querySelector('.iconTranslate');
const iconDownload = mainActionBtn.querySelector('.iconDownload');
const translateProgress = $('#translateProgress');
const progressFill = $('#progressFill');
const progressLabel = $('#progressLabel');
const translateStatus = $('#translateStatus');
const contextInput = $('#contextInput');
const langDisplay = $('#langDisplay');
const langDropdown = $('#langDropdown');
const zipNameInput = $('#zipNameInput');

let btnMode = 'translate'; // 'translate' | 'download'
let translationOutputs = [];

function setBtnTranslate() {
  btnMode = 'translate';
  mainActionBtn.className = 'btn translate';
  mainActionBtn.disabled = !state.files.length || !selectedLangs.length;
  mainActionLabel.textContent = 'Traduzir';
  iconTranslate.classList.remove('hidden');
  iconDownload.classList.add('hidden');
}
function setBtnDownload() {
  btnMode = 'download';
  mainActionBtn.className = 'btn download';
  mainActionBtn.disabled = false;
  mainActionLabel.textContent = 'Baixar traduções';
  iconTranslate.classList.add('hidden');
  iconDownload.classList.remove('hidden');
}
function setBtnLoading() {
  mainActionBtn.disabled = true;
  mainActionLabel.textContent = 'Traduzindo…';
  mainActionBtn.querySelector('.iconTranslate')?.classList.add('hidden');
  mainActionBtn.querySelector('.iconDownload')?.classList.add('hidden');
  if (!mainActionBtn.querySelector('.spinner')) {
    const sp = document.createElement('span'); sp.className = 'spinner';
    mainActionBtn.insertBefore(sp, mainActionLabel);
  }
}
function removeBtnSpinner() {
  const sp = mainActionBtn.querySelector('.spinner');
  if (sp) sp.remove();
}

// ======================================================================
//  DETECÇÃO DE FORMATO: AMP vs HTML5
// ======================================================================
function detectFormat(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') return 'html5';
  const sample = htmlString.substring(0, 3000).toLowerCase();
  if (/<html[^>]*[\s]⚡/.test(sample)) return 'amp';
  if (/<html[^>]*[\s]amp[\s>]/.test(sample)) return 'amp';
  if (/<html[^>]*[\s]amp4ads[\s>]/.test(sample)) return 'amp';
  if (/<html[^>]*[\s]⚡4ads[\s>]/.test(sample)) return 'amp';
  if (sample.includes('cdn.ampproject.org')) return 'amp';
  if (/<amp-(img|anim|video|ad|layout|fit-text|font|carousel|lightbox|story)[\s>]/.test(sample)) return 'amp';
  return 'html5';
}

// ---- Sanitização ----
function normalizeHTML(src) {
  if (!src) return src;
  return src.replace(/^\uFEFF/, '').replace(/^(\s*\\n)+/, '').replace(/^\s*\n+/, '');
}
function stripLiteralBackslashN(doc) {
  if (!doc?.body) return;
  while (doc.body.firstChild?.nodeType === 3 && /^(\\s*\\n)+\\s*$/.test(doc.body.firstChild.nodeValue))
    doc.body.removeChild(doc.body.firstChild);
  const w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach(t => t.nodeValue = t.nodeValue.replace(/\\n+/g, ''));
}
function parseToDoc(text) {
  const doc = new DOMParser().parseFromString(normalizeHTML(text), 'text/html');
  stripLiteralBackslashN(doc); return doc;
}

// ---- Visibilidade ----
function isHiddenByInline(el) {
  if (!el || el.nodeType !== 1) return false;
  const s = (el.getAttribute('style') || '').toLowerCase();
  return s.includes('display:none') || s.includes('visibility:hidden') || el.hasAttribute('hidden');
}
function isEffectivelyVisible(el) {
  let c = el; while (c && c.nodeType === 1) { if (isHiddenByInline(c)) return false; c = c.parentElement; } return true;
}

// ---- Scanner ----
function scanDoc(doc) {
  const nodes = [];
  const walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const txt = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length < 3) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
      const tag = p.tagName?.toLowerCase();
      if (['script', 'style', 'noscript', 'template', 'head'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (!isEffectivelyVisible(p)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let id = 1;
  while (walker.nextNode()) {
    const node = walker.currentNode, parent = node.parentElement;
    const snippet = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
    nodes.push({ id: id++, type: 'text', parentSelector: cssPath(parent), snippet, node, parent, length: snippet.length });
  }
  return nodes;
}
function cssPath(el) {
  if (!el || el.nodeType !== 1) return '';
  const parts = [];
  while (el && el.nodeType === 1 && parts.length < 5) {
    let s = el.nodeName.toLowerCase();
    if (el.id) { s += '#' + el.id; parts.unshift(s); break; }
    let sib = el, nth = 1; while (sib = sib.previousElementSibling) if (sib.nodeName === el.nodeName) nth++;
    s += `:nth-of-type(${nth})`; parts.unshift(s); el = el.parentElement;
  }
  return parts.join(' > ');
}

// ---- Abrir HTML ----
$('#openBtn').addEventListener('click', async () => {
  try {
    const handles = await window.showOpenFilePicker({
      multiple: true, excludeAcceptAllOption: true,
      types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }]
    });
    if (!handles?.length) return;
    for (const h of handles.slice(0, 10)) await openOne(h);
    refreshUI();
  } catch (e) { if (e.name !== 'AbortError') alert('Erro: ' + e.message); }
});
async function openOne(handle) {
  const file = await handle.getFile();
  const text = await file.text();
  const doc = parseToDoc(text);
  const format = detectFormat(text);
  state.files.push({
    name: handle.name || file.name,
    handle,
    doc,
    nodes: [],
    dirty: false,
    openedOrder: ++state.openCounter,
    zipBundleId: null,
    zipPath: null,
    format,
    originalText: text
  });
}

// ---- Abrir ZIP ----
$('#openZipBtn').addEventListener('click', async () => {
  try {
    if (!window.JSZip) { alert('JSZip não carregado.'); return; }
    const handles = await window.showOpenFilePicker({
      multiple: true, excludeAcceptAllOption: true,
      types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }]
    });
    if (!handles?.length) return;
    const limited = handles.slice(0, 10); let total = 0;
    for (const handle of limited) {
      const file = await handle.getFile(), buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const bundleId = ++zipBundleCounter;
      zipBundles.push({ id: bundleId, name: file.name, zip });
      const htmlEntries = [];
      zip.forEach((rp, ze) => { if (!ze.dir && /\.html?$/i.test(rp)) htmlEntries.push(ze); });
      for (const entry of htmlEntries) {
        const text = await entry.async('text');
        const doc = parseToDoc(text);
        const format = detectFormat(text);
        state.files.push({
          name: entry.name.split('/').pop() || 'arquivo.html',
          handle: null,
          doc,
          nodes: [],
          dirty: false,
          openedOrder: ++state.openCounter,
          zipBundleId: bundleId,
          zipPath: entry.name,
          format,
          originalText: text
        });
        total++;
      }
    }
    if (!total) { alert('Nenhum HTML encontrado.'); return; }
    refreshUI(); toast(`${total} HTML(s) carregado(s)`);
  } catch (e) { if (e.name !== 'AbortError') { console.error(e); alert('Erro: ' + e.message); } }
});

// ---- UI ----
function refreshUI() {
  for (const f of state.files) f.nodes = scanDoc(f.doc);
  renderList(); updateCounts();
  translationOutputs = [];
  setBtnTranslate();
}
function updateCounts() {
  const n = state.files.length;
  if (n) {
    const ampCount = state.files.filter(f => f.format === 'amp').length;
    const htmlCount = state.files.filter(f => f.format === 'html5').length;
    let label = `${n} arquivo${n > 1 ? 's' : ''}`;
    const parts = [];
    if (htmlCount) parts.push(`${htmlCount} HTML5`);
    if (ampCount) parts.push(`${ampCount} AMP`);
    if (parts.length) label += ` · ${parts.join(' · ')}`;
    fileCountEl.textContent = label;
  } else {
    fileCountEl.textContent = '';
  }
  fileCountEl.classList.toggle('hidden', !n);

  const anyDirty = state.files.some(f => f.dirty);
  dirtyText.textContent = anyDirty ? 'Alterações não salvas' : '';
  dirtyText.classList.toggle('hidden', !anyDirty);

  if (btnMode === 'translate') mainActionBtn.disabled = !state.files.length || !selectedLangs.length;
}
function renderList() {
  listEl.innerHTML = '';
  if (!state.files.length) {
    listEl.appendChild(emptyState);
    emptyState.style.display = '';
    return;
  }
  state.files.forEach((file, idx) => {
    const group = document.createElement('div');
    group.className = 'group';

    const head = document.createElement('div');
    head.className = 'groupHead';

    const name = document.createElement('div');
    name.className = 'name';

    const num = document.createElement('span');
    num.className = 'fileNum';
    num.textContent = idx + 1;

    const nameText = document.createElement('span');
    nameText.textContent = file.name;

    name.appendChild(num);
    name.appendChild(nameText);

    const badge = document.createElement('span');
    badge.className = 'format-badge ' + (file.format || 'html5');
    badge.textContent = (file.format === 'amp') ? '⚡ AMP' : '🌐 HTML5';
    badge.title = (file.format === 'amp')
      ? 'Formato AMP (amp4ads)'
      : 'Formato HTML5 padrão';
    name.appendChild(badge);

    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${file.nodes.length} textos`;

    head.appendChild(name);
    head.appendChild(chip);
    group.appendChild(head);

    const body = document.createElement('div');
    body.className = 'groupBody';
    file.nodes.forEach(entry => {
      const card = document.createElement('div');
      card.className = 'card';

      const ch = document.createElement('div');
      ch.className = 'cardHeader';
      ch.innerHTML = `<span class="badge">#${entry.id}</span>`;
      card.appendChild(ch);

      const ta = document.createElement('textarea');
      ta.value = entry.snippet;
      ta.placeholder = 'Edite aqui…';
      ta.addEventListener('input', () => {
        entry.node.nodeValue = ta.value;
        entry.snippet = ta.value;
        entry.length = ta.value.length;
        file.dirty = true;
        updateCounts();
      });
      card.appendChild(ta);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = entry.parentSelector || '';
      card.appendChild(meta);

      body.appendChild(card);
    });
    group.appendChild(body);
    listEl.appendChild(group);
  });
}

// ---- Helpers ----
function downloadBlobAs(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function toast(msg) {
  const t = document.createElement('div'); t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '16px', right: '16px',
    background: '#141a24', border: '1px solid #252d40',
    padding: '10px 16px', borderRadius: '10px', color: '#e2e5eb',
    zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,.4)', fontSize: '13px', fontWeight: '600'
  });
  document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
}

// ======================================================================
//  IDIOMAS
// ======================================================================
const LANGUAGES = [
  {
    group: 'Mais usados', items: [
      { value: 'English', label: 'Inglês' }, { value: 'Spanish', label: 'Espanhol' },
      { value: 'Portuguese (Brazil)', label: 'Português (Brasil)' }, { value: 'Portuguese (Portugal)', label: 'Português (Portugal)' },
      { value: 'French', label: 'Francês' }, { value: 'German', label: 'Alemão' }, { value: 'Italian', label: 'Italiano' },
      { value: 'Chinese (Simplified)', label: 'Chinês (Simplificado)' }, { value: 'Chinese (Traditional)', label: 'Chinês (Tradicional)' },
      { value: 'Japanese', label: 'Japonês' }, { value: 'Korean', label: 'Coreano' },
      { value: 'Russian', label: 'Russo' }, { value: 'Arabic', label: 'Árabe' },
    ]
  },
  {
    group: 'Europeus', items: [
      { value: 'Dutch', label: 'Holandês' }, { value: 'Polish', label: 'Polonês' },
      { value: 'Swedish', label: 'Sueco' }, { value: 'Danish', label: 'Dinamarquês' },
      { value: 'Norwegian', label: 'Norueguês' }, { value: 'Finnish', label: 'Finlandês' },
      { value: 'Czech', label: 'Tcheco' }, { value: 'Romanian', label: 'Romeno' },
      { value: 'Hungarian', label: 'Húngaro' }, { value: 'Greek', label: 'Grego' },
      { value: 'Bulgarian', label: 'Búlgaro' }, { value: 'Croatian', label: 'Croata' },
      { value: 'Slovak', label: 'Eslovaco' }, { value: 'Slovenian', label: 'Esloveno' },
      { value: 'Lithuanian', label: 'Lituano' }, { value: 'Latvian', label: 'Letão' },
      { value: 'Estonian', label: 'Estoniano' }, { value: 'Serbian', label: 'Sérvio' },
      { value: 'Ukrainian', label: 'Ucraniano' }, { value: 'Catalan', label: 'Catalão' },
      { value: 'Basque', label: 'Basco' }, { value: 'Galician', label: 'Galego' },
      { value: 'Irish', label: 'Irlandês' }, { value: 'Icelandic', label: 'Islandês' },
      { value: 'Albanian', label: 'Albanês' }, { value: 'Macedonian', label: 'Macedônio' },
      { value: 'Bosnian', label: 'Bósnio' }, { value: 'Maltese', label: 'Maltês' },
    ]
  },
  {
    group: 'Ásia e Oceania', items: [
      { value: 'Hindi', label: 'Hindi' }, { value: 'Bengali', label: 'Bengali' },
      { value: 'Thai', label: 'Tailandês' }, { value: 'Vietnamese', label: 'Vietnamita' },
      { value: 'Indonesian', label: 'Indonésio' }, { value: 'Malay', label: 'Malaio' },
      { value: 'Tagalog (Filipino)', label: 'Tagalo (Filipino)' },
      { value: 'Tamil', label: 'Tâmil' }, { value: 'Telugu', label: 'Télugo' },
      { value: 'Marathi', label: 'Marati' }, { value: 'Urdu', label: 'Urdu' },
      { value: 'Gujarati', label: 'Guzerate' }, { value: 'Kannada', label: 'Canarês' },
      { value: 'Malayalam', label: 'Malaiala' }, { value: 'Punjabi', label: 'Punjabi' },
      { value: 'Nepali', label: 'Nepalês' }, { value: 'Sinhala', label: 'Cingalês' },
      { value: 'Burmese', label: 'Birmanês' }, { value: 'Khmer', label: 'Khmer' },
      { value: 'Lao', label: 'Laosiano' }, { value: 'Mongolian', label: 'Mongol' },
    ]
  },
  {
    group: 'Oriente Médio e África', items: [
      { value: 'Turkish', label: 'Turco' }, { value: 'Hebrew', label: 'Hebraico' },
      { value: 'Persian (Farsi)', label: 'Persa (Farsi)' }, { value: 'Swahili', label: 'Suaíli' },
      { value: 'Amharic', label: 'Amárico' }, { value: 'Hausa', label: 'Hauçá' },
      { value: 'Yoruba', label: 'Iorubá' }, { value: 'Zulu', label: 'Zulu' },
      { value: 'Afrikaans', label: 'Africâner' },
    ]
  },
  {
    group: 'Américas', items: [
      { value: 'Haitian Creole', label: 'Crioulo Haitiano' },
    ]
  },
];

const STORAGE_LANGS = 'fhe_target_langs';
let selectedLangs = JSON.parse(localStorage.getItem(STORAGE_LANGS) || '[]');

// ---- Multi-select ----
function buildLangDropdown() {
  langDropdown.innerHTML = '';
  const search = document.createElement('input'); search.className = 'msSearch';
  search.placeholder = 'Buscar idioma…'; search.type = 'text';
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    langDropdown.querySelectorAll('.msItem').forEach(item => {
      const l = item.getAttribute('data-label') || '', v = item.getAttribute('data-value') || '';
      item.style.display = (l.toLowerCase().includes(q) || v.toLowerCase().includes(q)) ? 'flex' : 'none';
    });
    langDropdown.querySelectorAll('.msGroup').forEach(g => {
      g.style.display = Array.from(g.querySelectorAll('.msItem')).some(i => i.style.display !== 'none') ? 'block' : 'none';
    });
  });
  search.addEventListener('click', e => e.stopPropagation());
  langDropdown.appendChild(search);

  const selAll = document.createElement('div'); selAll.className = 'msSelectAll';
  const selAllCb = document.createElement('input'); selAllCb.type = 'checkbox'; selAllCb.id = 'msToggleAll';
  const selAllLbl = document.createElement('span'); selAllLbl.textContent = 'Selecionar / Limpar todos';
  selAll.appendChild(selAllCb); selAll.appendChild(selAllLbl);
  selAll.addEventListener('click', e => { if (e.target === selAllCb) return; selAllCb.checked = !selAllCb.checked; selAllCb.dispatchEvent(new Event('change')); });
  selAllCb.addEventListener('change', () => {
    selectedLangs = selAllCb.checked ? LANGUAGES.flatMap(g => g.items.map(i => i.value)) : [];
    syncLangUI();
  });
  langDropdown.appendChild(selAll);

  for (const group of LANGUAGES) {
    const gDiv = document.createElement('div'); gDiv.className = 'msGroup';
    const gLbl = document.createElement('div'); gLbl.className = 'msGroupLabel'; gLbl.textContent = group.group;
    gDiv.appendChild(gLbl);
    for (const lang of group.items) {
      const item = document.createElement('div'); item.className = 'msItem';
      item.setAttribute('data-value', lang.value); item.setAttribute('data-label', lang.label);
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = lang.value;
      cb.checked = selectedLangs.includes(lang.value);
      const lbl = document.createElement('span'); lbl.textContent = lang.label;
      item.appendChild(cb); item.appendChild(lbl);
      item.addEventListener('click', e => { if (e.target === cb) return; cb.checked = !cb.checked; toggleLang(lang.value, cb.checked); });
      cb.addEventListener('change', () => toggleLang(lang.value, cb.checked));
      gDiv.appendChild(item);
    }
    langDropdown.appendChild(gDiv);
  }
}
function toggleLang(v, c) {
  if (c && !selectedLangs.includes(v)) selectedLangs.push(v);
  else if (!c) selectedLangs = selectedLangs.filter(x => x !== v);
  syncLangUI();
}
function syncLangUI() {
  localStorage.setItem(STORAGE_LANGS, JSON.stringify(selectedLangs));
  langDropdown.querySelectorAll('.msItem').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]'); if (!cb) return;
    const on = selectedLangs.includes(cb.value); cb.checked = on; item.classList.toggle('checked', on);
  });
  const ta = langDropdown.querySelector('#msToggleAll');
  if (ta) ta.checked = selectedLangs.length === LANGUAGES.flatMap(g => g.items.map(i => i.value)).length;

  langDisplay.innerHTML = '';
  if (!selectedLangs.length) {
    const ph = document.createElement('span'); ph.className = 'placeholder';
    ph.textContent = 'Selecione idiomas…'; langDisplay.appendChild(ph);
    if (btnMode === 'translate') mainActionBtn.disabled = true;
    return;
  }
  const labelMap = {}; LANGUAGES.forEach(g => g.items.forEach(i => { labelMap[i.value] = i.label; }));
  if (selectedLangs.length > 5) {
    const chip = document.createElement('span'); chip.className = 'tagChip';
    const t = document.createElement('span'); t.textContent = `${selectedLangs.length} idiomas selecionados`;
    const x = document.createElement('span'); x.className = 'removeTag'; x.textContent = '×';
    x.addEventListener('click', e => { e.stopPropagation(); selectedLangs = []; syncLangUI(); });
    chip.appendChild(t); chip.appendChild(x); langDisplay.appendChild(chip);
  } else {
    selectedLangs.forEach(val => {
      const chip = document.createElement('span'); chip.className = 'tagChip';
      const t = document.createElement('span'); t.textContent = labelMap[val] || val;
      const x = document.createElement('span'); x.className = 'removeTag'; x.textContent = '×';
      x.addEventListener('click', e => { e.stopPropagation(); selectedLangs = selectedLangs.filter(v => v !== val); syncLangUI(); });
      chip.appendChild(t); chip.appendChild(x); langDisplay.appendChild(chip);
    });
  }
  if (btnMode === 'translate') mainActionBtn.disabled = !state.files.length;
}
langDisplay.addEventListener('click', e => {
  e.stopPropagation(); langDropdown.classList.toggle('hidden');
  if (!langDropdown.classList.contains('hidden')) { const s = langDropdown.querySelector('.msSearch'); if (s) setTimeout(() => s.focus(), 50); }
});
document.addEventListener('click', e => { if (!langDropdown.contains(e.target) && e.target !== langDisplay) langDropdown.classList.add('hidden'); });
langDropdown.addEventListener('click', e => e.stopPropagation());

buildLangDropdown(); syncLangUI();

// ======================================================================
//  MOTOR DE TRADUÇÃO (chama /api/translate no Vercel)
// ======================================================================
const delayMs = ms => new Promise(r => setTimeout(r, ms));

function extractJSON(raw) {
  let s = (raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch (e) { }
  const m = s.match(/\[[\s\S]*\]/); if (m) try { return JSON.parse(m[0]); } catch (e) { }
  return null;
}

async function callTranslateAPI(texts, lang, context, attempt = 1) {
  try {
    const resp = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, lang, context })
    });

    if (resp.status === 429) {
      if (attempt >= 3) throw new Error('Rate limit após 3 tentativas.');
      await delayMs(attempt * 2500);
      return callTranslateAPI(texts, lang, context, attempt + 1);
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return data.content || '';
  } catch (e) {
    if (attempt < 3) { await delayMs(attempt * 2000); return callTranslateAPI(texts, lang, context, attempt + 1); }
    throw e;
  }
}

async function translateBatch(items, lang, context, retry = 0) {
  const payload = items.map(x => x.t);
  const raw = await callTranslateAPI(payload, lang, context);
  const parsed = extractJSON(raw);

  if (!parsed || !Array.isArray(parsed)) {
    if (retry < 2) { await delayMs(800); return translateBatch(items, lang, context, retry + 1); }
    throw new Error('Resposta inválida da API.');
  }

  const map = new Map();
  for (const item of parsed) if (typeof item.i === 'number' && typeof item.t === 'string') map.set(item.i, item.t);

  const missing = items.filter(x => !map.has(x.i));
  if (missing.length && retry < 2) {
    await delayMs(600);
    const r = await translateBatch(missing, lang, context, retry + 1);
    for (const [k, v] of r) map.set(k, v);
  }
  return map;
}

async function translateAllTexts(texts, lang, context, onProgress) {
  const batches = []; let batch = [], chars = 0;
  for (let i = 0; i < texts.length; i++) {
    if (batch.length >= 50 || (chars + texts[i].length > 4000 && batch.length)) { batches.push(batch); batch = []; chars = 0; }
    batch.push({ i, t: texts[i] }); chars += texts[i].length;
  }
  if (batch.length) batches.push(batch);

  const full = new Map();
  for (let b = 0; b < batches.length; b++) {
    if (b > 0) await delayMs(400);
    const r = await translateBatch(batches[b], lang, context);
    for (const [k, v] of r) full.set(k, v);
    if (onProgress) onProgress(full.size, texts.length, b + 1, batches.length);
  }
  return texts.map((_, i) => full.get(i) || texts[i]);
}

// ======================================================================
//  BOTÃO PRINCIPAL — traduzir ou baixar
// ======================================================================
mainActionBtn.addEventListener('click', async () => {
  if (btnMode === 'download') {
    await downloadAllTranslations();
    return;
  }

  if (!state.files.length) { alert('Abra arquivos primeiro.'); return; }
  if (!selectedLangs.length) { alert('Selecione ao menos um idioma.'); return; }

  const context = contextInput.value.trim();
  for (const f of state.files) f.nodes = scanDoc(f.doc);

  const allEntries = [];
  for (const file of state.files) for (const entry of file.nodes) allEntries.push({ file, entry, originalSnippet: entry.snippet });
  if (!allEntries.length) { alert('Nenhum texto encontrado.'); return; }

  const uniqueTexts = [...new Set(allEntries.map(e => e.originalSnippet))];
  const labelMap = {}; LANGUAGES.forEach(g => g.items.forEach(i => { labelMap[i.value] = i.label; }));

  setBtnLoading();
  translateProgress.classList.remove('hidden');
  translateStatus.textContent = '';
  translationOutputs = [];

  const totalLangs = selectedLangs.length;
  let completed = 0; const failed = [];

  for (const lang of selectedLangs) {
    const langLabel = labelMap[lang] || lang;
    progressLabel.textContent = `[${completed + 1}/${totalLangs}] ${langLabel}…`;
    progressFill.style.width = (completed / totalLangs * 100) + '%';
    translateStatus.textContent = langLabel;

    try {
      const translations = await translateAllTexts(uniqueTexts, lang, context, (done, total) => {
        const pct = (completed + (done / total)) / totalLangs * 100;
        progressFill.style.width = pct + '%';
        translateStatus.textContent = `${langLabel}: ${done}/${total} textos`;
      });

      const transMap = new Map();
      for (let i = 0; i < uniqueTexts.length; i++) transMap.set(uniqueTexts[i], translations[i]);

      const filesHtml = [];
      for (const file of state.files) {
        const cloneDoc = document.implementation.createHTMLDocument('');
        cloneDoc.documentElement.innerHTML = file.doc.documentElement.innerHTML;
        const cloneNodes = scanDoc(cloneDoc);
        for (const cn of cloneNodes) {
          const tr = transMap.get(cn.snippet);
          if (tr && tr !== cn.snippet) { cn.node.nodeValue = tr; }
        }
        stripLiteralBackslashN(cloneDoc);
        const dt = file.doc.doctype ? `<!DOCTYPE ${file.doc.doctype.name}${file.doc.doctype.publicId ? ` PUBLIC "${file.doc.doctype.publicId}"` : ``}${file.doc.doctype.systemId ? ` "${file.doc.doctype.systemId}"` : ``}>` : '';
        filesHtml.push({ name: file.name, html: dt + cloneDoc.documentElement.outerHTML, zipPath: file.zipPath });
      }

      translationOutputs.push({ langValue: lang, langLabel, filesHtml });
      completed++;
    } catch (e) {
      console.error(`Falha ${lang}:`, e);
      failed.push({ langLabel: labelMap[lang] || lang, error: e.message });
      completed++;
    }
    if (completed < totalLangs) await delayMs(600);
  }

  removeBtnSpinner();
  progressFill.style.width = '100%';

  if (failed.length) {
    translateStatus.textContent = `${translationOutputs.length} OK · ${failed.length} falhou: ${failed.map(f => f.langLabel).join(', ')}`;
    toast(`${failed.length} idioma(s) falharam`);
  } else {
    translateStatus.textContent = `${translationOutputs.length} idioma(s) traduzido(s)!`;
    toast('Tradução concluída!');
  }

  if (translationOutputs.length) {
    setBtnDownload();
  } else {
    setBtnTranslate();
  }
  setTimeout(() => translateProgress.classList.add('hidden'), 3000);
});

// ======================================================================
//  DOWNLOAD (igual ao seu)
// ======================================================================
async function getNonHtmlAssets(bundleId) {
  const bundle = zipBundles.find(z => z.id === bundleId); if (!bundle) return [];
  const assets = [], entries = [];
  bundle.zip.forEach((rp, ze) => { if (!ze.dir && !/\.html?$/i.test(rp)) entries.push({ path: rp, entry: ze }); });
  for (const { path, entry } of entries) assets.push({ path, data: await entry.async('uint8array') });
  return assets;
}
function groupFilesByBundle(filesHtml) {
  const fromZip = [], standalone = [];
  for (const fh of filesHtml) {
    const orig = state.files.find(f => f.name === fh.name && f.zipPath === fh.zipPath);
    if (orig?.zipBundleId) fromZip.push({ ...fh, zipBundleId: orig.zipBundleId });
    else standalone.push(fh);
  }
  const groups = {};
  for (const f of fromZip) { if (!groups[f.zipBundleId]) groups[f.zipBundleId] = []; groups[f.zipBundleId].push(f); }
  return { bundleGroups: groups, standalone };
}

async function downloadAllTranslations() {
  if (!window.JSZip || !translationOutputs.length) return;

  mainActionBtn.disabled = true;
  mainActionLabel.textContent = 'Gerando ZIP…';

  let zipName = (zipNameInput ? zipNameInput.value.trim() : '') || 'traducoes';
  zipName = zipName.replace(/\.zip$/i, '');

  const master = new JSZip();
  const folderHTML5 = master.folder('HTML5');
  const folderAMP = master.folder('AMP');

  for (const output of translationOutputs) {
    const safeLang = (output.langLabel || output.langValue)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // remove acentos
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/+/g, '')
      .replace(/^|$/g, '')
      .toLowerCase();
    const { bundleGroups, standalone } = groupFilesByBundle(output.filesHtml);

    for (const bid of Object.keys(bundleGroups).map(Number)) {
      const bundle = zipBundles.find(z => z.id === bid);
      if (!bundle) continue;
      const files = bundleGroups[bid];
      const assets = await getNonHtmlAssets(bid);

      const ampFiles = files.filter(f => {
        const orig = state.files.find(sf => sf.name === f.name && sf.zipPath === f.zipPath);
        return orig?.format === 'amp';
      });
      const htmlFiles = files.filter(f => {
        const orig = state.files.find(sf => sf.name === f.name && sf.zipPath === f.zipPath);
        return orig?.format !== 'amp';
      });

      if (htmlFiles.length) {
        const cZip = new JSZip();
        for (const f of htmlFiles) cZip.file(f.zipPath || f.name || 'index.html', f.html);
        for (const a of assets) cZip.file(a.path, a.data);
        let zn = bundle.name || `criativo-${bid}.zip`;
        if (!zn.toLowerCase().endsWith('.zip')) zn += '.zip';
        folderHTML5.folder(safeLang).file(zn, await cZip.generateAsync({ type: 'uint8array' }));
      }

      if (ampFiles.length) {
        const cZip = new JSZip();
        for (const f of ampFiles) cZip.file(f.zipPath || f.name || 'index.html', f.html);
        for (const a of assets) cZip.file(a.path, a.data);
        let zn = bundle.name || `criativo-${bid}.zip`;
        if (!zn.toLowerCase().endsWith('.zip')) zn += '.zip';
        folderAMP.folder(safeLang).file(zn, await cZip.generateAsync({ type: 'uint8array' }));
      }
    }

    if (standalone.length) {
      const ampStandalone = standalone.filter(s => {
        const orig = state.files.find(sf => sf.name === s.name && !sf.zipBundleId);
        return orig?.format === 'amp';
      });
      const htmlStandalone = standalone.filter(s => {
        const orig = state.files.find(sf => sf.name === s.name && !sf.zipBundleId);
        return orig?.format !== 'amp';
      });

      if (htmlStandalone.length) {
        const langFolder = folderHTML5.folder(safeLang);
        for (const s of htmlStandalone)
          langFolder.file((s.name || 'file.html').replace(/[\/\\]/g, '_'), s.html);
      }
      if (ampStandalone.length) {
        const langFolder = folderAMP.folder(safeLang);
        for (const s of ampStandalone)
          langFolder.file((s.name || 'file.html').replace(/[\/\\]/g, '_'), s.html);
      }
    }
  }

  const blob = await master.generateAsync({ type: 'blob' });
  downloadBlobAs(blob, `${zipName}.zip`);
  toast('Download concluído!');

  mainActionBtn.disabled = false;
  mainActionLabel.textContent = 'Baixar traduções';
}

// Expor variáveis para o Builder acessar
window.selectedLangs = selectedLangs;
window.LANGUAGES = LANGUAGES;

// Manter sincronizado quando mudar seleção
var _origSyncLangUI = syncLangUI;
syncLangUI = function () {
  _origSyncLangUI();
  window.selectedLangs = selectedLangs;
};