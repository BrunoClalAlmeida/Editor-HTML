(function () {
    'use strict';

    // ==========================================================
    //  STATE
    // ==========================================================
    var state = {
        pages: [],
        currentPageIndex: 0,
        elements: [],
        selectedId: null,
        zoom: 100,
        tool: 'select',
        nextId: 1,
        exportFormat: 'html5',
        undoStack: [],
        redoStack: [],
        canvasW: 600,
        canvasH: 800,
        clipboard: null
    };

    state.pages.push({
        id: 'page-1',
        name: 'Página 1',
        canvasW: 600,
        canvasH: 800,
        elements: [],
        nextId: 1
    });

    // ==========================================================
    //  LANGUAGE DATA (local ao Builder — independente do Tradutor)
    // ==========================================================
    var BUILDER_LANGUAGES = [
        {group:'Mais usados',items:[
            {value:'English',label:'Inglês'},{value:'Spanish',label:'Espanhol'},
            {value:'Portuguese (Brazil)',label:'Português (Brasil)'},{value:'Portuguese (Portugal)',label:'Português (Portugal)'},
            {value:'French',label:'Francês'},{value:'German',label:'Alemão'},{value:'Italian',label:'Italiano'},
            {value:'Chinese (Simplified)',label:'Chinês (Simplificado)'},{value:'Chinese (Traditional)',label:'Chinês (Tradicional)'},
            {value:'Japanese',label:'Japonês'},{value:'Korean',label:'Coreano'},
            {value:'Russian',label:'Russo'},{value:'Arabic',label:'Árabe'},
        ]},
        {group:'Europeus',items:[
            {value:'Dutch',label:'Holandês'},{value:'Polish',label:'Polonês'},
            {value:'Swedish',label:'Sueco'},{value:'Danish',label:'Dinamarquês'},
            {value:'Norwegian',label:'Norueguês'},{value:'Finnish',label:'Finlandês'},
            {value:'Czech',label:'Tcheco'},{value:'Romanian',label:'Romeno'},
            {value:'Hungarian',label:'Húngaro'},{value:'Greek',label:'Grego'},
            {value:'Bulgarian',label:'Búlgaro'},{value:'Croatian',label:'Croata'},
            {value:'Slovak',label:'Eslovaco'},{value:'Slovenian',label:'Esloveno'},
            {value:'Lithuanian',label:'Lituano'},{value:'Latvian',label:'Letão'},
            {value:'Estonian',label:'Estoniano'},{value:'Serbian',label:'Sérvio'},
            {value:'Ukrainian',label:'Ucraniano'},{value:'Catalan',label:'Catalão'},
            {value:'Basque',label:'Basco'},{value:'Galician',label:'Galego'},
            {value:'Irish',label:'Irlandês'},{value:'Icelandic',label:'Islandês'},
            {value:'Albanian',label:'Albanês'},{value:'Macedonian',label:'Macedônio'},
            {value:'Bosnian',label:'Bósnio'},{value:'Maltese',label:'Maltês'},
        ]},
        {group:'Ásia e Oceania',items:[
            {value:'Hindi',label:'Hindi'},{value:'Bengali',label:'Bengali'},
            {value:'Thai',label:'Tailandês'},{value:'Vietnamese',label:'Vietnamita'},
            {value:'Indonesian',label:'Indonésio'},{value:'Malay',label:'Malaio'},
            {value:'Tagalog (Filipino)',label:'Tagalo (Filipino)'},
            {value:'Tamil',label:'Tâmil'},{value:'Telugu',label:'Télugo'},
            {value:'Marathi',label:'Marati'},{value:'Urdu',label:'Urdu'},
            {value:'Gujarati',label:'Guzerate'},{value:'Kannada',label:'Canarês'},
            {value:'Malayalam',label:'Malaiala'},{value:'Punjabi',label:'Punjabi'},
            {value:'Nepali',label:'Nepalês'},{value:'Sinhala',label:'Cingalês'},
            {value:'Burmese',label:'Birmanês'},{value:'Khmer',label:'Khmer'},
            {value:'Lao',label:'Laosiano'},{value:'Mongolian',label:'Mongol'},
        ]},
        {group:'Oriente Médio e África',items:[
            {value:'Turkish',label:'Turco'},{value:'Hebrew',label:'Hebraico'},
            {value:'Persian (Farsi)',label:'Persa (Farsi)'},{value:'Swahili',label:'Suaíli'},
            {value:'Amharic',label:'Amárico'},{value:'Hausa',label:'Hauçá'},
            {value:'Yoruba',label:'Iorubá'},{value:'Zulu',label:'Zulu'},
            {value:'Afrikaans',label:'Africâner'},
        ]},
        {group:'Américas',items:[
            {value:'Haitian Creole',label:'Crioulo Haitiano'},
        ]},
    ];

    var STORAGE_EXPORT_LANGS = 'fhe_export_langs';
    var builderSelectedLangs = JSON.parse(localStorage.getItem(STORAGE_EXPORT_LANGS) || '[]');

    // ==========================================================
    //  DOM REFS
    // ==========================================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const canvas        = $('#canvas');
    const canvasArea    = $('#canvasArea');
    const canvasWrapper = $('#canvasWrapper');
    const propsContent  = $('#propsContent');
    const layersList    = $('#layersList');
    const toastContainer = $('#toastContainer');
    const contextMenu   = $('#contextMenu');
    const exportModal   = $('#exportModal');
    const previewModal  = $('#previewModal');
    const previewFrame  = $('#previewFrame');

    // ==========================================================
    //  UTILS
    // ==========================================================
    function toast(msg, type) {
        type = type || 'info';
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        toastContainer.appendChild(el);
        setTimeout(function () { el.remove(); }, 2500);
    }

    function escapeHtml(text) {
        var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, function (m) { return map[m]; });
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    // ==========================================================
    //  UNDO / REDO
    // ==========================================================
    function saveState() {
        state.undoStack.push(JSON.stringify(state.elements));
        if (state.undoStack.length > 50) state.undoStack.shift();
        state.redoStack = [];
    }

    function undo() {
        if (state.undoStack.length === 0) return;
        state.redoStack.push(JSON.stringify(state.elements));
        state.elements = JSON.parse(state.undoStack.pop());
        state.selectedId = null;
        renderAll();
        showProps();
        updateLayers();
        toast('Desfazer aplicado', 'info');
    }

    function redo() {
        if (state.redoStack.length === 0) return;
        state.undoStack.push(JSON.stringify(state.elements));
        state.elements = JSON.parse(state.redoStack.pop());
        state.selectedId = null;
        renderAll();
        showProps();
        updateLayers();
        toast('Refazer aplicado', 'info');
    }

    // ==========================================================
    //  ELEMENT FACTORY (same as before — abbreviated for brevity)
    // ==========================================================
    function createElement(type, x, y) {
        var id = 'el-' + state.nextId++;
        var base = {
            id: id, type: type, x: x, y: y,
            zIndex: state.elements.length + 1,
            locked: false, opacity: 100
        };

        switch (type) {
            case 'heading':
                return Object.assign({}, base, {
                    w: 300, h: 50, text: 'Seu Título Aqui',
                    fontSize: 32, fontWeight: '700', fontFamily: 'Arial, sans-serif',
                    color: '#222222', textAlign: 'left', bgColor: 'transparent',
                    borderRadius: 0, lineHeight: 1.2, letterSpacing: 0,
                    paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 12
                });
            case 'paragraph':
                return Object.assign({}, base, {
                    w: 280, h: 80,
                    text: 'Seu texto de parágrafo aqui. Edite conforme necessário.',
                    fontSize: 16, fontWeight: '400', fontFamily: 'Arial, sans-serif',
                    color: '#555555', textAlign: 'left', bgColor: 'transparent',
                    borderRadius: 0, lineHeight: 1.5, letterSpacing: 0,
                    paddingTop: 8, paddingRight: 12, paddingBottom: 8, paddingLeft: 12
                });
            case 'cta':
                return Object.assign({}, base, {
                    w: 220, h: 52, text: 'SAIBA MAIS',
                    fontSize: 16, fontWeight: '700', fontFamily: 'Arial, sans-serif',
                    color: '#ffffff', textAlign: 'center',
                    bgColor: '#6c5ce7', bgGradient: 'linear-gradient(135deg, #6c5ce7, #a855f7)',
                    borderRadius: 8, link: 'https://exemplo.com', lineHeight: 1,
                    paddingTop: 12, paddingRight: 32, paddingBottom: 12, paddingLeft: 32,
                    shadowX: 0, shadowY: 4, shadowBlur: 15,
                    shadowColor: 'rgba(108,92,231,0.4)', pulse: false, pulseDuration: 1.5
                });
            case 'cta-pill':
                return Object.assign({}, base, {
                    w: 200, h: 46, text: 'CLIQUE AQUI',
                    fontSize: 14, fontWeight: '700', fontFamily: 'Arial, sans-serif',
                    color: '#ffffff', textAlign: 'center',
                    bgColor: '#e74c5c', bgGradient: '',
                    borderRadius: 50, link: 'https://exemplo.com', lineHeight: 1,
                    paddingTop: 12, paddingRight: 28, paddingBottom: 12, paddingLeft: 28,
                    shadowX: 0, shadowY: 2, shadowBlur: 10,
                    shadowColor: 'rgba(231,76,92,0.3)', pulse: false, pulseDuration: 1.5
                });
            case 'rect':
                return Object.assign({}, base, {
                    w: 200, h: 150, bgColor: '#6c5ce7', borderRadius: 0,
                    borderWidth: 0, borderColor: '#333333'
                });
            case 'circle':
                return Object.assign({}, base, {
                    w: 150, h: 150, bgColor: '#a855f7', borderRadius: 999,
                    borderWidth: 0, borderColor: '#333333'
                });
            case 'image':
                return Object.assign({}, base, {
                    w: 250, h: 200, src: '', bgColor: 'transparent',
                    borderRadius: 0, objectFit: 'cover'
                });
            case 'divider':
                return Object.assign({}, base, {
                    w: 300, h: 20, dividerColor: '#cccccc',
                    dividerHeight: 2, dividerStyle: 'solid'
                });
            default:
                return base;
        }
    }

    // ==========================================================
    //  RENDER (same as original)
    // ==========================================================
    function renderAll() {
        canvas.innerHTML = '';
        var sorted = state.elements.slice().sort(function (a, b) { return a.zIndex - b.zIndex; });
        sorted.forEach(function (el) { renderElement(el); });
    }

    function renderElement(el) {
        var div = document.createElement('div');
        div.id = el.id;
        div.className = 'ce' + (el.id === state.selectedId ? ' selected' : '');
        div.style.left = el.x + 'px';
        div.style.top = el.y + 'px';
        div.style.width = el.w + 'px';
        div.style.height = el.h + 'px';
        div.style.zIndex = el.zIndex;
        div.style.opacity = (el.opacity != null ? el.opacity : 100) / 100;
        if (el.locked) div.style.pointerEvents = 'none';

        switch (el.type) {
            case 'heading':
            case 'paragraph':
                div.classList.add('ce-text');
                div.textContent = el.text;
                div.style.fontSize = el.fontSize + 'px';
                div.style.fontWeight = el.fontWeight;
                div.style.fontFamily = el.fontFamily;
                div.style.color = el.color;
                div.style.textAlign = el.textAlign;
                div.style.background = el.bgColor;
                div.style.borderRadius = el.borderRadius + 'px';
                div.style.lineHeight = el.lineHeight;
                div.style.letterSpacing = el.letterSpacing + 'px';
                div.style.paddingTop = (el.paddingTop || 8) + 'px';
                div.style.paddingRight = (el.paddingRight || 12) + 'px';
                div.style.paddingBottom = (el.paddingBottom || 8) + 'px';
                div.style.paddingLeft = (el.paddingLeft || 12) + 'px';
                break;
            case 'cta':
            case 'cta-pill':
                div.classList.add('ce-cta');
                div.textContent = el.text;
                div.style.fontSize = el.fontSize + 'px';
                div.style.fontWeight = el.fontWeight;
                div.style.fontFamily = el.fontFamily;
                div.style.color = el.color;
                div.style.background = el.bgGradient || el.bgColor;
                div.style.borderRadius = el.borderRadius + 'px';
                div.style.paddingTop = (el.paddingTop || 12) + 'px';
                div.style.paddingRight = (el.paddingRight || 32) + 'px';
                div.style.paddingBottom = (el.paddingBottom || 12) + 'px';
                div.style.paddingLeft = (el.paddingLeft || 32) + 'px';
                if (el.shadowBlur) {
                    div.style.boxShadow = (el.shadowX||0)+'px '+(el.shadowY||0)+'px '+(el.shadowBlur||0)+'px '+(el.shadowColor||'rgba(0,0,0,0.2)');
                }
                if (el.pulse) div.style.animation = 'pulse '+(el.pulseDuration||1.5)+'s infinite';
                break;
            case 'rect':
            case 'circle':
                div.classList.add('ce-shape');
                div.style.background = el.bgColor;
                div.style.borderRadius = el.borderRadius + 'px';
                if (el.borderWidth) div.style.border = el.borderWidth+'px solid '+el.borderColor;
                break;
            case 'image':
                div.classList.add('ce-image');
                div.style.borderRadius = el.borderRadius + 'px';
                if (el.src) {
                    var img = document.createElement('img');
                    img.src = el.src;
                    img.style.objectFit = el.objectFit || 'cover';
                    div.appendChild(img);
                } else {
                    div.classList.add('empty');
                    div.textContent = '🖼 Duplo-clique para imagem';
                }
                break;
            case 'divider':
                div.classList.add('ce-divider');
                var line = document.createElement('div');
                line.className = 'divider-line';
                line.style.width = '100%';
                line.style.height = '0';
                line.style.borderTop = (el.dividerHeight||2)+'px '+(el.dividerStyle||'solid')+' '+(el.dividerColor||'#ccc');
                div.appendChild(line);
                break;
        }

        if (el.id === state.selectedId) {
            ['nw','ne','sw','se','n','s','w','e'].forEach(function(pos) {
                var handle = document.createElement('div');
                handle.className = 'resize-handle ' + pos;
                handle.dataset.handle = pos;
                div.appendChild(handle);
            });
        }

        canvas.appendChild(div);
        bindElementEvents(div, el);
    }

    // ==========================================================
    //  ELEMENT MOUSE EVENTS
    // ==========================================================
    function bindElementEvents(div, el) {
        div.addEventListener('mousedown', function (e) {
            if (el.locked) return;
            var handleEl = e.target.closest('.resize-handle');
            if (handleEl) { e.stopPropagation(); e.preventDefault(); startResize(el, handleEl.dataset.handle, e); return; }
            if (div.getAttribute('contenteditable') === 'true') return;
            if (multiSelected.length > 1 && multiSelected.indexOf(el.id) !== -1) {
                e.stopPropagation(); startGroupDrag(el, e); return;
            }
            multiSelected = [];
            selectElement(el.id);
            e.stopPropagation();
            var freshDiv = document.getElementById(el.id);
            startDrag(el, freshDiv, e);
        });

        if (['heading','paragraph','cta','cta-pill'].indexOf(el.type) !== -1) {
            div.addEventListener('dblclick', function (e) {
                if (el.locked) return; e.stopPropagation(); enterTextEdit(div, el);
            });
        }
        if (el.type === 'image') {
            div.addEventListener('dblclick', function () { if (el.locked) return; promptImageUpload(el); });
        }
        div.addEventListener('contextmenu', function (e) {
            e.preventDefault(); selectElement(el.id); showContextMenu(e.clientX, e.clientY);
        });
    }

    function startDrag(el, div, e) {
        saveState();
        var startX = e.clientX, startY = e.clientY, origX = el.x, origY = el.y;
        function onMove(ev) {
            var scale = state.zoom / 100;
            el.x = Math.round(origX + (ev.clientX - startX) / scale);
            el.y = Math.round(origY + (ev.clientY - startY) / scale);
            snapElement(el);
            var current = document.getElementById(el.id);
            if (current) { current.style.left = el.x+'px'; current.style.top = el.y+'px'; }
        }
        function onUp() { clearGuides(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); showProps(); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startGroupDrag(anchorEl, e) {
        saveState();
        var startX = e.clientX, startY = e.clientY;
        var origPositions = {};
        multiSelected.forEach(function (id) {
            var mel = state.elements.find(function (el) { return el.id === id; });
            if (mel) origPositions[id] = { x: mel.x, y: mel.y };
        });
        function onMove(ev) {
            var scale = state.zoom / 100;
            var dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
            multiSelected.forEach(function (id) {
                var mel = state.elements.find(function (el) { return el.id === id; });
                if (mel && origPositions[id]) {
                    mel.x = Math.round(origPositions[id].x + dx);
                    mel.y = Math.round(origPositions[id].y + dy);
                    var domEl = document.getElementById(id);
                    if (domEl) { domEl.style.left = mel.x+'px'; domEl.style.top = mel.y+'px'; }
                }
            });
            var oldX = anchorEl.x, oldY = anchorEl.y;
            snapElement(anchorEl);
            var snapDx = anchorEl.x - oldX, snapDy = anchorEl.y - oldY;
            if (snapDx !== 0 || snapDy !== 0) {
                multiSelected.forEach(function (id) {
                    if (id === anchorEl.id) return;
                    var mel = state.elements.find(function (el) { return el.id === id; });
                    if (mel) { mel.x += snapDx; mel.y += snapDy; var domEl = document.getElementById(id); if (domEl) { domEl.style.left = mel.x+'px'; domEl.style.top = mel.y+'px'; } }
                });
            }
            showProps();
        }
        function onUp() { clearGuides(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function startResize(el, dir, e) {
        saveState();
        var startX = e.clientX, startY = e.clientY;
        var origX = el.x, origY = el.y, origW = el.w, origH = el.h, MIN = 20;
        function onMove(ev) {
            var scale = state.zoom / 100;
            var dx = (ev.clientX - startX) / scale, dy = (ev.clientY - startY) / scale;
            switch (dir) {
                case 'se': el.w = Math.max(MIN, origW+dx); el.h = Math.max(MIN, origH+dy); break;
                case 'sw': el.x = origX+dx; el.w = Math.max(MIN, origW-dx); el.h = Math.max(MIN, origH+dy); break;
                case 'ne': el.w = Math.max(MIN, origW+dx); el.y = origY+dy; el.h = Math.max(MIN, origH-dy); break;
                case 'nw': el.x = origX+dx; el.y = origY+dy; el.w = Math.max(MIN, origW-dx); el.h = Math.max(MIN, origH-dy); break;
                case 'n': el.y = origY+dy; el.h = Math.max(MIN, origH-dy); break;
                case 's': el.h = Math.max(MIN, origH+dy); break;
                case 'w': el.x = origX+dx; el.w = Math.max(MIN, origW-dx); break;
                case 'e': el.w = Math.max(MIN, origW+dx); break;
            }
            el.x=Math.round(el.x); el.y=Math.round(el.y); el.w=Math.round(el.w); el.h=Math.round(el.h);
            renderAll(); showProps();
        }
        function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function enterTextEdit(div, el) {
        div.contentEditable = 'true'; div.focus(); div.style.cursor = 'text';
        var range = document.createRange(); range.selectNodeContents(div);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        function onBlur() {
            var text = '';
            div.childNodes.forEach(function (n) {
                if (n.nodeType === 3) text += n.textContent;
                else if (!n.classList || !n.classList.contains('resize-handle')) text += n.textContent;
            });
            el.text = text.trim() || el.text;
            div.contentEditable = 'false'; div.style.cursor = 'move';
            renderAll(); showProps(); div.removeEventListener('blur', onBlur);
        }
        div.addEventListener('blur', onBlur);
    }

    function removeImageBackground(dataUrl, callback) {
        var img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = function () {
            var c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
            var imageData = ctx.getImageData(0, 0, c.width, c.height); var data = imageData.data;
            var corners = [getPixel(data,c.width,0,0),getPixel(data,c.width,c.width-1,0),getPixel(data,c.width,0,c.height-1),getPixel(data,c.width,c.width-1,c.height-1)];
            var bgColor = mostCommonColor(corners);
            if (bgColor.a < 10) { callback(dataUrl); return; }
            var tolerance = 35;
            for (var i = 0; i < data.length; i += 4) {
                var dr = Math.abs(data[i]-bgColor.r), dg = Math.abs(data[i+1]-bgColor.g), db = Math.abs(data[i+2]-bgColor.b);
                if (dr < tolerance && dg < tolerance && db < tolerance) data[i+3] = 0;
                else if (dr < tolerance*1.5 && dg < tolerance*1.5 && db < tolerance*1.5) {
                    var maxDiff = Math.max(dr,dg,db);
                    data[i+3] = Math.min(data[i+3], Math.round((maxDiff/(tolerance*1.5))*data[i+3]));
                }
            }
            ctx.putImageData(imageData,0,0); callback(c.toDataURL('image/png'));
        };
        img.src = dataUrl;
    }
    function getPixel(data,width,x,y){var idx=(y*width+x)*4;return{r:data[idx],g:data[idx+1],b:data[idx+2],a:data[idx+3]};}
    function mostCommonColor(pixels){var groups=[];pixels.forEach(function(px){var found=false;for(var i=0;i<groups.length;i++){var g=groups[i];if(Math.abs(g.r-px.r)<20&&Math.abs(g.g-px.g)<20&&Math.abs(g.b-px.b)<20){g.count++;found=true;break;}}if(!found)groups.push({r:px.r,g:px.g,b:px.b,a:px.a,count:1});});groups.sort(function(a,b){return b.count-a.count;});return groups[0];}

    function promptImageUpload(el) {
        var input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
        input.onchange = function (e) {
            var file = e.target.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                var rawDataUrl = ev.target.result;
                var isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
                if (isPng) {
                    toast('Removendo fundo...','info');
                    removeImageBackground(rawDataUrl, function(cleanDataUrl) {
                        saveState(); el.src = cleanDataUrl; renderAll(); showProps();
                        toast('Imagem adicionada (fundo removido)!','success');
                    });
                } else {
                    saveState(); el.src = rawDataUrl; renderAll(); showProps();
                    toast('Imagem adicionada!','success');
                }
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    // ==========================================================
    //  SNAPPING
    // ==========================================================
    function snapElement(el) {
        var threshold = 6, cx = el.x+el.w/2, cy = el.y+el.h/2;
        var canvasCX = state.canvasW/2, canvasCY = state.canvasH/2;
        clearGuides();
        if (Math.abs(cx-canvasCX)<threshold){el.x=canvasCX-el.w/2;showGuide('v',canvasCX);}
        if (Math.abs(cy-canvasCY)<threshold){el.y=canvasCY-el.h/2;showGuide('h',canvasCY);}
        if (Math.abs(el.x)<threshold){el.x=0;showGuide('v',0);}
        if (Math.abs(el.y)<threshold){el.y=0;showGuide('h',0);}
        if (Math.abs(el.x+el.w-state.canvasW)<threshold){el.x=state.canvasW-el.w;showGuide('v',state.canvasW);}
        if (Math.abs(el.y+el.h-state.canvasH)<threshold){el.y=state.canvasH-el.h;showGuide('h',state.canvasH);}
        state.elements.forEach(function(other){
            if(other.id===el.id)return;
            var otherCX=other.x+other.w/2,otherCY=other.y+other.h/2;
            if(Math.abs(cx-otherCX)<threshold){el.x=otherCX-el.w/2;showGuide('v',otherCX);}
            if(Math.abs(cy-otherCY)<threshold){el.y=otherCY-el.h/2;showGuide('h',otherCY);}
        });
    }
    function showGuide(type,pos){var guide=document.createElement('div');guide.className=(type==='h')?'guide-h':'guide-v';if(type==='h')guide.style.top=pos+'px';else guide.style.left=pos+'px';canvas.appendChild(guide);}
    function clearGuides(){canvas.querySelectorAll('.guide-h,.guide-v').forEach(function(g){g.remove();});}

    // ==========================================================
    //  SELECTION
    // ==========================================================
    function selectElement(id){state.selectedId=id;renderAll();showProps();updateLayers();}
    function deselectAll(){state.selectedId=null;renderAll();showProps();updateLayers();}
    function getSelectedElement(){return state.elements.find(function(e){return e.id===state.selectedId;})||null;}
    canvas.addEventListener('mousedown',function(e){if(e.target===canvas)deselectAll();});

    // ==========================================================
    //  PROPERTIES PANEL (same as original — keeping full code)
    // ==========================================================
    function showProps() {
        var el = getSelectedElement();
        if (!el) {
            propsContent.innerHTML = '<div class="empty-props"><div class="empty-props-icon">⬜</div><div class="empty-props-text">Selecione um elemento<br>para editar propriedades</div></div>';
            return;
        }

        var html = '';

        // Position & Size
        html += '<div class="props-section"><div class="props-section-title">Posição & Tamanho</div>' +
            '<div class="props-row"><span class="props-label">X</span><input class="props-input" type="number" data-prop="x" value="'+el.x+'"><span class="props-label">Y</span><input class="props-input" type="number" data-prop="y" value="'+el.y+'"></div>' +
            '<div class="props-row"><span class="props-label">W</span><input class="props-input" type="number" data-prop="w" value="'+el.w+'"><span class="props-label">H</span><input class="props-input" type="number" data-prop="h" value="'+el.h+'"></div>' +
            '<div class="props-row"><span class="props-label">🔒</span><label style="font-size:12px;color:var(--text-secondary);cursor:pointer;"><input type="checkbox" data-prop="locked" '+(el.locked?'checked':'')+'>Travado</label>' +
            '<span class="props-label" style="margin-left:auto">α</span><input class="props-input" type="number" data-prop="opacity" value="'+(el.opacity!=null?el.opacity:100)+'" min="0" max="100" style="width:55px"></div></div>';

        // Text
        if (['heading','paragraph','cta','cta-pill'].indexOf(el.type) !== -1) {
            html += '<div class="props-section"><div class="props-section-title">Texto</div>' +
                '<textarea class="props-input-full" rows="2" data-prop="text">'+escapeHtml(el.text)+'</textarea>' +
                '<div class="props-row"><span class="props-label">Aa</span><input class="props-input" type="number" data-prop="fontSize" value="'+el.fontSize+'" min="8" max="200">' +
                '<select class="props-input" data-prop="fontWeight">'+['300','400','500','600','700','900'].map(function(w){return '<option value="'+w+'"'+(el.fontWeight===w?' selected':'')+'>'+({300:'Light',400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',900:'Black'}[w])+'</option>';}).join('')+'</select></div>' +
                '<div class="props-row"><span class="props-label">Fn</span><select class="props-input" style="flex:1" data-prop="fontFamily">'+['Arial, sans-serif','Georgia, serif','Courier New, monospace','Verdana, sans-serif','Trebuchet MS, sans-serif','Impact, sans-serif','Times New Roman, serif','Tahoma, sans-serif'].map(function(f){return '<option value="'+f+'"'+(el.fontFamily===f?' selected':'')+'>'+f+'</option>';}).join('')+'</select></div>' +
                '<div class="props-row"><span class="props-label">🔤</span><div class="color-input-wrapper"><div class="color-preview"><input type="color" data-prop="color" value="'+el.color+'"></div><input class="props-input" data-prop="color" value="'+el.color+'"></div></div>' +
                '<div class="props-row"><div class="props-actions">'+['left','center','right'].map(function(a){return '<button class="props-action-btn'+(el.textAlign===a?' active':'')+'" data-prop="textAlign" data-val="'+a+'" title="'+a+'">☰</button>';}).join('')+'</div></div>' +
                '<div class="props-row"><span class="props-label">LH</span><input class="props-input" type="number" step="0.1" data-prop="lineHeight" value="'+el.lineHeight+'" min="0.5" max="3"><span class="props-label">LS</span><input class="props-input" type="number" step="0.5" data-prop="letterSpacing" value="'+(el.letterSpacing||0)+'"></div></div>';
        }

        // Fill
        if (['heading','paragraph','cta','cta-pill','rect','circle','image'].indexOf(el.type) !== -1) {
            var bgVal = (el.bgColor && el.bgColor !== 'transparent') ? el.bgColor : '#ffffff';
            html += '<div class="props-section"><div class="props-section-title">Preenchimento</div>' +
                '<div class="props-row"><span class="props-label">BG</span><div class="color-input-wrapper"><div class="color-preview"><input type="color" data-prop="bgColor" value="'+bgVal+'"></div><input class="props-input" data-prop="bgColor" value="'+el.bgColor+'" placeholder="transparent"></div></div>';
            if (el.bgGradient !== undefined) html += '<div class="props-row"><span class="props-label">∇</span><input class="props-input" style="flex:1" data-prop="bgGradient" value="'+(el.bgGradient||'')+'" placeholder="linear-gradient(...)"></div>';
            html += '<div class="props-row"><span class="props-label">R</span><input class="props-input" type="number" data-prop="borderRadius" value="'+el.borderRadius+'" min="0"></div></div>';
        }

        // Border (shapes)
        if (['rect','circle'].indexOf(el.type) !== -1) {
            html += '<div class="props-section"><div class="props-section-title">Borda</div>' +
                '<div class="props-row"><span class="props-label">W</span><input class="props-input" type="number" data-prop="borderWidth" value="'+(el.borderWidth||0)+'" min="0"><div class="color-input-wrapper"><div class="color-preview"><input type="color" data-prop="borderColor" value="'+(el.borderColor||'#333333')+'"></div></div></div></div>';
        }

        // CTA extras
        if (['cta','cta-pill'].indexOf(el.type) !== -1) {
            html += '<div class="props-section"><div class="props-section-title">Link (CTA)</div><input class="props-input-full" data-prop="link" value="'+(el.link||'')+'" placeholder="https://exemplo.com"></div>';
            html += '<div class="props-section"><div class="props-section-title">Borda</div><div class="props-row"><span class="props-label">R</span><input class="props-input" type="number" data-prop="borderRadius" value="'+el.borderRadius+'" min="0" max="999"><span style="font-size:11px;color:var(--text-muted)">px</span></div></div>';
            html += '<div class="props-section"><div class="props-section-title">Animação Pulse</div><div class="props-toggle-row"><label><input type="checkbox" data-prop="pulse" '+(el.pulse?'checked':'')+'>Ativar Pulse</label></div><div class="props-row"><span class="props-label">⏱</span><input class="props-input" type="number" step="0.1" data-prop="pulseDuration" value="'+(el.pulseDuration||1.5)+'" min="0.3" max="10"><span style="font-size:11px;color:var(--text-muted)">segundos</span></div></div>';
            html += '<div class="props-section"><div class="props-section-title">Sombra</div><div class="props-row"><span class="props-label">X</span><input class="props-input" type="number" data-prop="shadowX" value="'+(el.shadowX||0)+'"><span class="props-label">Y</span><input class="props-input" type="number" data-prop="shadowY" value="'+(el.shadowY||0)+'"></div><div class="props-row"><span class="props-label">Bl</span><input class="props-input" type="number" data-prop="shadowBlur" value="'+(el.shadowBlur||0)+'" min="0"><input class="props-input" data-prop="shadowColor" value="'+(el.shadowColor||'rgba(0,0,0,0.2)')+'"></div></div>';
            html += '<div class="props-section"><div class="props-section-title">Padding</div><div class="props-row"><span class="props-label">T</span><input class="props-input" type="number" data-prop="paddingTop" value="'+(el.paddingTop||0)+'" min="0"><span class="props-label">R</span><input class="props-input" type="number" data-prop="paddingRight" value="'+(el.paddingRight||0)+'" min="0"></div><div class="props-row"><span class="props-label">B</span><input class="props-input" type="number" data-prop="paddingBottom" value="'+(el.paddingBottom||0)+'" min="0"><span class="props-label">L</span><input class="props-input" type="number" data-prop="paddingLeft" value="'+(el.paddingLeft||0)+'" min="0"></div></div>';
        }

        // Image
        if (el.type === 'image') {
            html += '<div class="props-section"><div class="props-section-title">Imagem</div><input class="props-input-full" value="'+(el.src?'(imagem carregada)':'')+'" placeholder="Duplo-clique para upload" readonly><div class="props-row"><span class="props-label">Fit</span><select class="props-input" data-prop="objectFit"><option value="cover"'+(el.objectFit==='cover'?' selected':'')+'>Cover</option><option value="contain"'+(el.objectFit==='contain'?' selected':'')+'>Contain</option><option value="fill"'+(el.objectFit==='fill'?' selected':'')+'>Fill</option></select></div><button class="btn btn-ghost" style="width:100%;justify-content:center;margin-top:4px;" data-action="upload-image">📁 Trocar Imagem</button></div>';
        }

        // Divider
        if (el.type === 'divider') {
            html += '<div class="props-section"><div class="props-section-title">Divisor</div><div class="props-row"><span class="props-label">Cor</span><div class="color-input-wrapper"><div class="color-preview"><input type="color" data-prop="dividerColor" value="'+(el.dividerColor||'#cccccc')+'"></div><input class="props-input" data-prop="dividerColor" value="'+(el.dividerColor||'#cccccc')+'"></div></div><div class="props-row"><span class="props-label">Alt</span><input class="props-input" type="number" data-prop="dividerHeight" value="'+(el.dividerHeight||2)+'" min="1" max="20"><select class="props-input" data-prop="dividerStyle"><option value="solid"'+(el.dividerStyle==='solid'?' selected':'')+'>Sólido</option><option value="dashed"'+(el.dividerStyle==='dashed'?' selected':'')+'>Tracejado</option><option value="dotted"'+(el.dividerStyle==='dotted'?' selected':'')+'>Pontilhado</option></select></div></div>';
        }

        // Actions
        html += '<div class="props-section"><div class="props-section-title">Ações</div><div style="display:flex;gap:6px;flex-wrap:wrap;"><button class="btn btn-ghost" style="flex:1" data-action="duplicate">📋 Duplicar</button><button class="btn btn-ghost" style="flex:1;color:var(--danger);border-color:var(--danger);" data-action="delete">🗑 Excluir</button></div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;"><button class="btn btn-ghost" style="flex:1" data-action="bringForward">⬆ Frente</button><button class="btn btn-ghost" style="flex:1" data-action="sendBackward">⬇ Trás</button></div></div>';

        propsContent.innerHTML = html;
        bindPropsEvents(el);
    }

    function bindPropsEvents(el) {
        propsContent.querySelectorAll('[data-prop]').forEach(function (input) {
            var prop = input.dataset.prop;
            if (input.tagName === 'BUTTON') {
                input.addEventListener('click', function () { saveState(); el[prop] = input.dataset.val; renderAll(); showProps(); updateLayers(); });
                return;
            }
            var eventName = (input.tagName === 'SELECT') ? 'change' : 'input';
            input.addEventListener(eventName, function () {
                saveState();
                if (input.type === 'checkbox') el[prop] = input.checked;
                else if (input.type === 'number') el[prop] = +input.value;
                else el[prop] = input.value;
                renderAll();
            });
            input.addEventListener('blur', function () { showProps(); updateLayers(); });
        });
        propsContent.querySelectorAll('[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                switch (btn.dataset.action) {
                    case 'duplicate': duplicateSelected(); break;
                    case 'delete': deleteSelected(); break;
                    case 'bringForward': bringForward(); break;
                    case 'sendBackward': sendBackward(); break;
                    case 'upload-image': promptImageUpload(el); break;
                }
            });
        });
    }

    // ==========================================================
    //  LAYERS
    // ==========================================================
    function updateLayers() {
        var sorted = state.elements.slice().sort(function(a,b){return b.zIndex-a.zIndex;});
        var icons = {heading:'H',paragraph:'¶',cta:'▶','cta-pill':'💊',rect:'⬜',circle:'⭕',image:'🖼',divider:'—'};
        layersList.innerHTML = sorted.map(function(el){
            var name = el.text ? el.text.substring(0,20) : (({heading:'Título',paragraph:'Parágrafo',cta:'CTA','cta-pill':'CTA Pill',rect:'Retângulo',circle:'Círculo',image:'Imagem',divider:'Divisor'})[el.type]||el.type);
            return '<div class="layer-item'+(el.id===state.selectedId?' active':'')+'" data-layer-id="'+el.id+'"><span class="layer-icon">'+(icons[el.type]||'?')+'</span><span class="layer-name">'+escapeHtml(name)+(el.locked?' 🔒':'')+'</span><div class="layer-actions"><button class="layer-action-btn" data-layer-delete="'+el.id+'" title="Excluir">✕</button></div></div>';
        }).join('');
        layersList.querySelectorAll('.layer-item').forEach(function(item){
            item.addEventListener('click',function(e){if(e.target.closest('[data-layer-delete]'))return;selectElement(item.dataset.layerId);});
        });
        layersList.querySelectorAll('[data-layer-delete]').forEach(function(btn){
            btn.addEventListener('click',function(e){e.stopPropagation();var id=btn.dataset.layerDelete;saveState();state.elements=state.elements.filter(function(el){return el.id!==id;});if(state.selectedId===id)state.selectedId=null;renderAll();showProps();updateLayers();});
        });
    }

    // ==========================================================
    //  ELEMENT OPERATIONS
    // ==========================================================
    function duplicateSelected(){var el=getSelectedElement();if(!el)return;saveState();var clone=JSON.parse(JSON.stringify(el));clone.id='el-'+state.nextId++;clone.x+=20;clone.y+=20;clone.zIndex=state.elements.length+1;state.elements.push(clone);selectElement(clone.id);hideContextMenu();toast('Elemento duplicado','success');}
    function deleteSelected(){
        if(multiSelected.length>1){saveState();state.elements=state.elements.filter(function(e){return multiSelected.indexOf(e.id)===-1;});state.selectedId=null;var count=multiSelected.length;multiSelected=[];renderAll();showProps();updateLayers();hideContextMenu();toast(count+' elementos excluídos','info');return;}
        if(!state.selectedId)return;saveState();state.elements=state.elements.filter(function(e){return e.id!==state.selectedId;});state.selectedId=null;multiSelected=[];renderAll();showProps();updateLayers();hideContextMenu();toast('Elemento excluído','info');
    }
    function bringForward(){var el=getSelectedElement();if(!el)return;saveState();el.zIndex=Math.max.apply(null,state.elements.map(function(e){return e.zIndex;}))+1;renderAll();updateLayers();hideContextMenu();}
    function sendBackward(){var el=getSelectedElement();if(!el)return;saveState();el.zIndex=Math.min.apply(null,state.elements.map(function(e){return e.zIndex;}))-1;renderAll();updateLayers();hideContextMenu();}
    function lockElement(){var el=getSelectedElement();if(!el)return;saveState();el.locked=!el.locked;renderAll();showProps();updateLayers();hideContextMenu();toast(el.locked?'Elemento travado':'Elemento destravado','info');}

    // ==========================================================
    //  CONTEXT MENU
    // ==========================================================
    function showContextMenu(x,y){contextMenu.style.left=x+'px';contextMenu.style.top=y+'px';contextMenu.classList.add('show');}
    function hideContextMenu(){contextMenu.classList.remove('show');}
    document.addEventListener('click',hideContextMenu);
    contextMenu.querySelectorAll('[data-action]').forEach(function(item){item.addEventListener('click',function(){switch(item.dataset.action){case'duplicate':duplicateSelected();break;case'bringForward':bringForward();break;case'sendBackward':sendBackward();break;case'lock':lockElement();break;case'delete':deleteSelected();break;}});});

    // ==========================================================
    //  DRAG & DROP FROM SIDEBAR
    // ==========================================================
    var dragType = null;

    $$('.element-card[draggable]').forEach(function(card){
        card.addEventListener('dragstart',function(e){dragType=card.dataset.type;e.dataTransfer.effectAllowed='copy';});
        card.addEventListener('dragend',function(){dragType=null;});
    });
    canvas.addEventListener('dragover',function(e){e.preventDefault();canvas.classList.add('drag-over');});
    canvas.addEventListener('dragleave',function(){canvas.classList.remove('drag-over');});
    canvas.addEventListener('drop',function(e){
        e.preventDefault();canvas.classList.remove('drag-over');
        var files=e.dataTransfer&&e.dataTransfer.files;
        if(files&&files.length&&files[0].name.endsWith('.json')){loadProjectFile(files[0]);return;}
        if(!dragType)return;
        var rect=canvas.getBoundingClientRect(),scale=state.zoom/100;
        var x=(e.clientX-rect.left)/scale,y=(e.clientY-rect.top)/scale;
        saveState();var el=createElement(dragType,Math.round(x-50),Math.round(y-25));
        state.elements.push(el);selectElement(el.id);updateLayers();toast('Elemento adicionado!','success');dragType=null;
    });

    $$('.element-card').forEach(function(card){card.addEventListener('click',function(){
        var type=card.dataset.type;if(!type)return;saveState();
        var el=createElement(type,state.canvasW/2-100,state.canvasH/2-25);
        state.elements.push(el);selectElement(el.id);updateLayers();toast('Elemento adicionado!','success');
    });});

    // ==========================================================
    //  ZOOM
    // ==========================================================
    function setZoom(val){state.zoom=clamp(val,25,300);canvasWrapper.style.transform='scale('+(state.zoom/100)+')';$('#zoomLevel').textContent=state.zoom+'%';}
    $('#zoomOut').addEventListener('click',function(){setZoom(state.zoom-10);});
    $('#zoomIn').addEventListener('click',function(){setZoom(state.zoom+10);});
    $('#zoomReset').addEventListener('click',function(){setZoom(100);});
    canvasArea.addEventListener('wheel',function(e){if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(state.zoom+(e.deltaY>0?-5:5));}},{passive:false});

    // ==========================================================
    //  CANVAS SIZE
    // ==========================================================
    $('#canvasW').addEventListener('change',function(){state.canvasW=clamp(+this.value,100,2000);canvas.style.width=state.canvasW+'px';});
    $('#canvasH').addEventListener('change',function(){state.canvasH=clamp(+this.value,100,2000);canvas.style.height=state.canvasH+'px';});

    // ==========================================================
    //  SIDEBAR TABS
    // ==========================================================

    $$('.sidebar-tab').forEach(function(tab){tab.addEventListener('click',function(){

        $$('.sidebar-tab').forEach(function(t){t.classList.remove('active');});

        $$('.tab-panel').forEach(function(p){p.classList.remove('active');});
        tab.classList.add('active');$('#tab-'+tab.dataset.tab).classList.add('active');
        if(tab.dataset.tab==='layers')updateLayers();
    });});

    // ==========================================================
    //  TOOL SELECT
    // ==========================================================

    $$('.tool-btn[data-tool]').forEach(function(btn){btn.addEventListener('click',function(){

        $$('.tool-btn[data-tool]').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');state.tool=btn.dataset.tool;
        canvas.style.cursor=(state.tool==='hand')?'grab':'default';
    });});

    // ==========================================================
    //  KEYBOARD SHORTCUTS
    // ==========================================================
    document.addEventListener('keydown',function(e){
        var tag=e.target.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||e.target.contentEditable==='true')return;
        var el=getSelectedElement();
        if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();return;}
        if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();duplicateSelected();return;}
        if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}
        if((e.ctrlKey||e.metaKey)&&e.key==='y'){e.preventDefault();redo();return;}
        if((e.ctrlKey||e.metaKey)&&e.key==='c'&&el){state.clipboard=JSON.parse(JSON.stringify(el));return;}
        if((e.ctrlKey||e.metaKey)&&e.key==='v'&&state.clipboard){saveState();var clone=JSON.parse(JSON.stringify(state.clipboard));clone.id='el-'+state.nextId++;clone.x+=20;clone.y+=20;state.elements.push(clone);selectElement(clone.id);updateLayers();return;}
        if(e.key==='Escape'){deselectAll();return;}
        if(el&&!el.locked&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.key)!==-1){e.preventDefault();saveState();var step=e.shiftKey?10:1;if(e.key==='ArrowUp')el.y-=step;if(e.key==='ArrowDown')el.y+=step;if(e.key==='ArrowLeft')el.x-=step;if(e.key==='ArrowRight')el.x+=step;renderAll();showProps();return;}
        if(e.key==='v'||e.key==='V')$('[data-tool="select"]').click();
        if(e.key==='h'||e.key==='H')$('[data-tool="hand"]').click();
    });

    // ==========================================================
    //  EXPORT — HTML5 Generation
    // ==========================================================
    function generateElementHTML(el) {
        var style, s;
        switch (el.type) {
            case 'heading': case 'paragraph':
                s = 'position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;';
                s += 'font-size:'+el.fontSize+'px;font-weight:'+el.fontWeight+';font-family:'+el.fontFamily+';';
                s += 'color:'+el.color+';text-align:'+el.textAlign+';line-height:'+el.lineHeight+';';
                if(el.bgColor&&el.bgColor!=='transparent')s+='background:'+el.bgColor+';';
                if(el.borderRadius)s+='border-radius:'+el.borderRadius+'px;';
                if(el.letterSpacing)s+='letter-spacing:'+el.letterSpacing+'px;';
                s+='padding:'+(el.paddingTop||8)+'px '+(el.paddingRight||12)+'px '+(el.paddingBottom||8)+'px '+(el.paddingLeft||12)+'px;';
                s+='box-sizing:border-box;overflow:hidden;word-break:break-word;';
                if(el.opacity!=null&&el.opacity!==100)s+='opacity:'+(el.opacity/100)+';';
                return '<div style="'+s+'">'+escapeHtml(el.text)+'</div>';
            case 'cta': case 'cta-pill': return '';
            case 'rect': case 'circle':
                s='position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;';
                s+='background:'+el.bgColor+';border-radius:'+el.borderRadius+'px;';
                if(el.borderWidth)s+='border:'+el.borderWidth+'px solid '+el.borderColor+';';
                s+='box-sizing:border-box;';if(el.opacity!=null&&el.opacity!==100)s+='opacity:'+(el.opacity/100)+';';
                return '<div style="'+s+'"></div>';
            case 'image':
                s='position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;';
                s+='border-radius:'+el.borderRadius+'px;overflow:hidden;';
                if(el.opacity!=null&&el.opacity!==100)s+='opacity:'+(el.opacity/100)+';';
                if(el.src)return '<div style="'+s+'"><img src="'+el.src+'" style="width:100%;height:100%;object-fit:'+(el.objectFit||'cover')+';" alt=""></div>';
                return '<div style="'+s+'background:'+el.bgColor+';"></div>';
            case 'divider':
                s='position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;display:flex;align-items:center;';
                if(el.opacity!=null&&el.opacity!==100)s+='opacity:'+(el.opacity/100)+';';
                return '<div style="'+s+'"><div style="width:100%;border-top:'+(el.dividerHeight||2)+'px '+(el.dividerStyle||'solid')+' '+(el.dividerColor||'#ccc')+';"></div></div>';
            default: return '';
        }
    }

    function generateHTML5() {
        var sorted = state.elements.slice().sort(function(a,b){return a.zIndex-b.zIndex;});
        var pulseAnimations = {};
        sorted.forEach(function(el){if(el.pulse&&(el.type==='cta'||el.type==='cta-pill')){var dur=el.pulseDuration||1.5;var key=(dur+'').replace('.','_');pulseAnimations[key]=dur;}});
        var animCSS = '';
        if(Object.keys(pulseAnimations).length>0){
            animCSS+='\n    @keyframes pulse {\n      0%{transform:scale(1);opacity:1;}\n      50%{transform:scale(1.08);opacity:0.95;}\n      100%{transform:scale(1);opacity:1;}\n    }\n';
            Object.keys(pulseAnimations).forEach(function(key){animCSS+='    .pulse-'+key+'{animation:pulse '+pulseAnimations[key]+'s ease-in-out infinite;}\n';});
        }
        var elementsHTML = '';
        sorted.forEach(function(el){
            if(el.type==='cta'||el.type==='cta-pill'){
                var pulseKey=el.pulse?(el.pulseDuration||1.5):null;
                var pulseCls=pulseKey?' pulse-'+(pulseKey+'').replace('.','_'):'';
                var bgStyle='position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;';
                bgStyle+='background:'+(el.bgGradient||el.bgColor)+';border-radius:'+el.borderRadius+'px;';
                if(el.shadowBlur)bgStyle+='box-shadow:'+(el.shadowX||0)+'px '+(el.shadowY||0)+'px '+(el.shadowBlur||0)+'px '+(el.shadowColor||'rgba(0,0,0,0.2)')+';';
                if(el.opacity!=null&&el.opacity!==100)bgStyle+='opacity:'+(el.opacity/100)+';';
                elementsHTML+='    <div class="cta-bg'+pulseCls+'" style="'+bgStyle+'"></div>\n';
                var txtStyle='position:absolute;left:'+el.x+'px;top:'+el.y+'px;width:'+el.w+'px;height:'+el.h+'px;';
                txtStyle+='display:flex;align-items:center;justify-content:center;';
                txtStyle+='padding:'+(el.paddingTop||12)+'px '+(el.paddingRight||32)+'px '+(el.paddingBottom||12)+'px '+(el.paddingLeft||32)+'px;';
                txtStyle+='pointer-events:none;box-sizing:border-box;';
                var spanStyle='font-size:'+el.fontSize+'px;font-weight:'+el.fontWeight+';font-family:'+el.fontFamily+';color:'+el.color+';text-align:center;';
                elementsHTML+='    <div class="cta-txt'+pulseCls+'" style="'+txtStyle+'"><span style="'+spanStyle+'">'+escapeHtml(el.text)+'</span></div>\n';
            } else {
                var html=generateElementHTML(el);if(html)elementsHTML+='    '+html+'\n';
            }
        });
        var clickUrl='%%CLICK_URL_UNESC%%';
        sorted.forEach(function(el){if((el.type==='cta'||el.type==='cta-pill')&&el.link&&clickUrl==='%%CLICK_URL_UNESC%%')clickUrl=el.link;});
        return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <meta name="ad.size" content="width='+state.canvasW+',height='+state.canvasH+'">\n  <meta name="viewport" content="width='+state.canvasW+', height='+state.canvasH+'">\n  <title>Criativo HTML5</title>\n  <style>\n    html, body {\n      margin: 0;\n      padding: 0;\n      width: '+state.canvasW+'px;\n      height: '+state.canvasH+'px;\n      background: #ffffff;\n      overflow: hidden;\n      font-family: \'Inter\', Arial, sans-serif;\n    }\n    .clickable-area {\n      width: 100%;\n      height: 100%;\n      box-sizing: border-box;\n      position: relative;\n    }\n    .clicktag {\n      position: absolute;\n      top: 0; left: 0;\n      width: 100%; height: 100%;\n      z-index: 9999;\n      cursor: pointer;\n      text-decoration: none;\n    }\n'+animCSS+'  </style>\n</head>\n<body>\n  <div class="clickable-area">\n    <a href="'+clickUrl+'" target="_blank" class="clicktag" aria-label="Abrir anúncio"></a>\n\n'+elementsHTML+'  </div>\n</body>\n</html>';
    }

    // ==========================================================
    //  EXPORT — AMP Generation (100% Google Ads compatible)
    // ==========================================================
    function generateAMP() {
        var sorted = state.elements.slice().sort(function(a,b){return a.zIndex-b.zIndex;});
        var innerEls = '';
        var elCounter = 0;
        var pulseDurations = [];

        sorted.forEach(function(el) {
            elCounter++;
            var elId = 'eh_' + elCounter;
            var ehBase = 'width:'+el.w+'px;height:'+el.h+'px;top:'+el.y+'px;left:'+el.x+'px';
            if (el.opacity != null && el.opacity !== 100) ehBase += ';opacity:'+(el.opacity/100);

            switch (el.type) {
                case 'heading':
                case 'paragraph':
                    var textStyle = 'display:flex;align-items:center;justify-content:'+getFlexJustify(el.textAlign)+';';
                    textStyle += 'padding:'+(el.paddingTop||8)+'px '+(el.paddingRight||12)+'px '+(el.paddingBottom||8)+'px '+(el.paddingLeft||12)+'px;';
                    if (el.bgColor && el.bgColor !== 'transparent') textStyle += 'background:'+el.bgColor+';';
                    if (el.borderRadius) textStyle += 'border-radius:'+el.borderRadius+'px;';
                    var spanStyle = 'font-size:'+el.fontSize+'px;font-weight:'+el.fontWeight+';color:'+el.color+';font-family:'+el.fontFamily+';';
                    spanStyle += 'line-height:'+el.lineHeight+';text-align:'+el.textAlign+';';
                    if (el.letterSpacing) spanStyle += 'letter-spacing:'+el.letterSpacing+'px;';
                    innerEls += '        <div id="'+elId+'" class="eh" style="'+ehBase+'">\n';
                    innerEls += '          <div class="element"><div class="e" style="'+textStyle+'"><div class="text" style="'+spanStyle+'"><span>'+escapeHtml(el.text)+'</span></div></div></div>\n';
                    innerEls += '        </div>\n\n';
                    break;

                case 'cta':
                case 'cta-pill':
                    var hasPulse = el.pulse;
                    if (hasPulse) {
                        var dur = el.pulseDuration || 1.5;
                        if (pulseDurations.indexOf(dur) === -1) pulseDurations.push(dur);
                    }
                    var pulseClass = hasPulse ? ' pulse' : '';
                    // Background layer
                    var bgStyle = 'background:'+(el.bgGradient||el.bgColor)+';border-radius:'+el.borderRadius+'px;';
                    if (el.shadowBlur) bgStyle += 'box-shadow:'+(el.shadowX||0)+'px '+(el.shadowY||0)+'px '+(el.shadowBlur||0)+'px '+(el.shadowColor||'rgba(0,0,0,0.2)')+';';
                    innerEls += '        <div id="'+elId+'_bg" class="eh'+pulseClass+'" style="'+ehBase+'">\n';
                    innerEls += '          <div class="element"><div class="e" style="'+bgStyle+'"></div></div>\n';
                    innerEls += '        </div>\n\n';
                    // Text layer
                    var btnTextStyle = 'display:flex;align-items:center;justify-content:center;';
                    btnTextStyle += 'padding:'+(el.paddingTop||12)+'px '+(el.paddingRight||32)+'px '+(el.paddingBottom||12)+'px '+(el.paddingLeft||32)+'px;';
                    var ctaSpanStyle = 'text-align:center;font-size:'+el.fontSize+'px;font-weight:'+el.fontWeight+';color:'+el.color+';font-family:'+el.fontFamily+';';
                    innerEls += '        <div id="'+elId+'_txt" class="eh'+pulseClass+'" style="'+ehBase+';pointer-events:none">\n';
                    innerEls += '          <div class="element"><div class="e" style="'+btnTextStyle+'"><div class="text" style="'+ctaSpanStyle+'"><span>'+escapeHtml(el.text)+'</span></div></div></div>\n';
                    innerEls += '        </div>\n\n';
                    break;

                case 'rect':
                case 'circle':
                    var shapeStyle = 'background:'+el.bgColor+';border-radius:'+el.borderRadius+'px;';
                    if (el.borderWidth) shapeStyle += 'border:'+el.borderWidth+'px solid '+el.borderColor+';';
                    shapeStyle += 'box-sizing:border-box;';
                    innerEls += '        <div id="'+elId+'" class="eh" style="'+ehBase+'">\n';
                    innerEls += '          <div class="element"><div class="e" style="'+shapeStyle+'"></div></div>\n';
                    innerEls += '        </div>\n\n';
                    break;

                case 'image':
                    innerEls += '        <div id="'+elId+'" class="eh" style="'+ehBase+'">\n';
                    if (el.src) {
                        innerEls += '          <div class="element"><div class="e" style="border-radius:'+el.borderRadius+'px;overflow:hidden;"><amp-img src="'+el.src+'" width="'+el.w+'" height="'+el.h+'" layout="responsive" alt=""></amp-img></div></div>\n';
                    } else {
                        innerEls += '          <div class="element"><div class="e" style="background:'+(el.bgColor||'#eee')+';border-radius:'+el.borderRadius+'px;"></div></div>\n';
                    }
                    innerEls += '        </div>\n\n';
                    break;

                case 'divider':
                    innerEls += '        <div id="'+elId+'" class="eh" style="'+ehBase+'">\n';
                    innerEls += '          <div class="element"><div class="e" style="display:flex;align-items:center;"><div style="width:100%;border-top:'+(el.dividerHeight||2)+'px '+(el.dividerStyle||'solid')+' '+(el.dividerColor||'#ccc')+';"></div></div></div>\n';
                    innerEls += '        </div>\n\n';
                    break;
            }
        });

        // Pulse animations CSS
        var customAnimations = '';
        if (pulseDurations.length > 0) {
            customAnimations += '\n    @keyframes pulse {\n      0% { transform: scale(1); }\n      50% { transform: scale(1.08); }\n      100% { transform: scale(1); }\n    }\n';
            customAnimations += '    .pulse { animation: pulse '+(pulseDurations[0]||1.5)+'s infinite; }\n';
        }

        return '<!doctype html>\n' +
            '<html \u26A14ads>\n' +
            '<head>\n' +
            '  <meta charset="utf-8">\n' +
            '  <meta name="viewport" content="width=device-width,minimum-scale=1">\n' +
            '  <meta name="ad.size" content="width='+state.canvasW+',height='+state.canvasH+'">\n' +
            '  <style amp4ads-boilerplate>body{visibility:hidden}</style>\n' +
            '  <script async src="https://cdn.ampproject.org/amp4ads-v0.js"><\/script>\n' +
            '  <style amp-custom>\n' +
            '    body { margin:0; background-color:#ffffff }\n' +
            '    * { box-sizing:border-box }\n' +
            '    html { -moz-osx-font-smoothing:grayscale; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility }\n' +
            '    .eh,.sh,.slide { width:100%; height:100%; position:absolute; left:0; top:0 }\n' +
            '    .element,.slide { -webkit-backface-visibility:hidden; backface-visibility:hidden }\n' +
            '    .eh,.sh { perspective-origin:center; -webkit-perspective-origin:center; transform-style:preserve-3d }\n' +
            '    .sh { perspective:'+state.canvasW+'px }\n' +
            '    .element { position:absolute }\n' +
            '    .e,.element { width:100%; height:100% }\n' +
            '    .element .text { white-space:pre-line; word-break:normal; word-wrap:break-word }\n' +
            '    #bs { overflow:hidden }\n' +
            customAnimations +
            '  </style>\n' +
            '</head>\n' +
            '<body>\n' +
            '  <div id="bs" style="width:'+state.canvasW+'px;height:'+state.canvasH+'px;position:relative">\n' +
            '    <div id="sh1" class="sh" style="z-index:0">\n' +
            '      <div id="s1" class="slide">\n\n' +
            innerEls +
            '      </div>\n' +
            '    </div>\n' +
            '  </div>\n' +
            '</body>\n' +
            '</html>';
    }

    function getFlexJustify(align){switch(align){case'left':return'flex-start';case'right':return'flex-end';case'center':return'center';default:return'flex-start';}}

    function getExportCode(){return(state.exportFormat==='amp')?generateAMP():generateHTML5();}

    // ==========================================================
    //  EXPORT MODAL — Language Selector (built-in)
    // ==========================================================
    function buildExportLangDropdown() {
        var dropdown = $('#exportLangDropdown');
        var display = $('#exportLangDisplay');
        if (!dropdown || !display) return;

        dropdown.innerHTML = '';

        // Search
        var search = document.createElement('input');
        search.className = 'msSearch';
        search.placeholder = 'Buscar idioma…';
        search.type = 'text';
        search.addEventListener('input', function () {
            var q = search.value.toLowerCase();
            dropdown.querySelectorAll('.msItem').forEach(function (item) {
                var l = item.getAttribute('data-label') || '', v = item.getAttribute('data-value') || '';
                item.style.display = (l.toLowerCase().includes(q) || v.toLowerCase().includes(q)) ? 'flex' : 'none';
            });
            dropdown.querySelectorAll('.msGroup').forEach(function (g) {
                g.style.display = Array.from(g.querySelectorAll('.msItem')).some(function (i) { return i.style.display !== 'none'; }) ? 'block' : 'none';
            });
        });
        search.addEventListener('click', function (e) { e.stopPropagation(); });
        dropdown.appendChild(search);

        // Select All
        var selAll = document.createElement('div');
        selAll.className = 'msSelectAll';
        var selAllCb = document.createElement('input');
        selAllCb.type = 'checkbox';
        selAllCb.id = 'exportMsToggleAll';
        var selAllLbl = document.createElement('span');
        selAllLbl.textContent = 'Selecionar / Limpar todos';
        selAll.appendChild(selAllCb);
        selAll.appendChild(selAllLbl);
        selAll.addEventListener('click', function (e) { if (e.target === selAllCb) return; selAllCb.checked = !selAllCb.checked; selAllCb.dispatchEvent(new Event('change')); });
        selAllCb.addEventListener('change', function () {
            builderSelectedLangs = selAllCb.checked ? BUILDER_LANGUAGES.flatMap(function (g) { return g.items.map(function (i) { return i.value; }); }) : [];
            syncExportLangUI();
        });
        dropdown.appendChild(selAll);

        // Groups + Items
        BUILDER_LANGUAGES.forEach(function (group) {
            var gDiv = document.createElement('div');
            gDiv.className = 'msGroup';
            var gLbl = document.createElement('div');
            gLbl.className = 'msGroupLabel';
            gLbl.textContent = group.group;
            gDiv.appendChild(gLbl);
            group.items.forEach(function (lang) {
                var item = document.createElement('div');
                item.className = 'msItem';
                item.setAttribute('data-value', lang.value);
                item.setAttribute('data-label', lang.label);
                var cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.value = lang.value;
                cb.checked = builderSelectedLangs.includes(lang.value);
                var lbl = document.createElement('span');
                lbl.textContent = lang.label;
                item.appendChild(cb);
                item.appendChild(lbl);
                item.addEventListener('click', function (e) { if (e.target === cb) return; cb.checked = !cb.checked; toggleExportLang(lang.value, cb.checked); });
                cb.addEventListener('change', function () { toggleExportLang(lang.value, cb.checked); });
                gDiv.appendChild(item);
            });
            dropdown.appendChild(gDiv);
        });

        // Toggle dropdown
        display.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                var s = dropdown.querySelector('.msSearch');
                if (s) setTimeout(function () { s.focus(); }, 50);
            }
        });

        document.addEventListener('click', function (e) {
            if (!dropdown.contains(e.target) && e.target !== display) dropdown.classList.add('hidden');
        });
        dropdown.addEventListener('click', function (e) { e.stopPropagation(); });

        syncExportLangUI();
    }

    function toggleExportLang(v, c) {
        if (c && !builderSelectedLangs.includes(v)) builderSelectedLangs.push(v);
        else if (!c) builderSelectedLangs = builderSelectedLangs.filter(function (x) { return x !== v; });
        syncExportLangUI();
    }

    function syncExportLangUI() {
        localStorage.setItem(STORAGE_EXPORT_LANGS, JSON.stringify(builderSelectedLangs));

        var dropdown = $('#exportLangDropdown');
        var display = $('#exportLangDisplay');
        if (!dropdown || !display) return;

        // Sync checkboxes
        dropdown.querySelectorAll('.msItem').forEach(function (item) {
            var cb = item.querySelector('input[type="checkbox"]');
            if (!cb) return;
            var on = builderSelectedLangs.includes(cb.value);
            cb.checked = on;
            item.classList.toggle('checked', on);
        });
        var ta = dropdown.querySelector('#exportMsToggleAll');
        if (ta) ta.checked = builderSelectedLangs.length === BUILDER_LANGUAGES.flatMap(function (g) { return g.items.map(function (i) { return i.value; }); }).length;

        // Update display
        display.innerHTML = '';
        if (!builderSelectedLangs.length) {
            var ph = document.createElement('span');
            ph.className = 'placeholder';
            ph.textContent = 'Selecione idiomas…';
            display.appendChild(ph);
            return;
        }

        var labelMap = {};
        BUILDER_LANGUAGES.forEach(function (g) { g.items.forEach(function (i) { labelMap[i.value] = i.label; }); });

        if (builderSelectedLangs.length > 5) {
            var chip = document.createElement('span');
            chip.className = 'tagChip';
            var t = document.createElement('span');
            t.textContent = builderSelectedLangs.length + ' idiomas selecionados';
            var x = document.createElement('span');
            x.className = 'removeTag';
            x.textContent = '×';
            x.addEventListener('click', function (e) { e.stopPropagation(); builderSelectedLangs = []; syncExportLangUI(); });
            chip.appendChild(t);
            chip.appendChild(x);
            display.appendChild(chip);
        } else {
            builderSelectedLangs.forEach(function (val) {
                var chip = document.createElement('span');
                chip.className = 'tagChip';
                var t = document.createElement('span');
                t.textContent = labelMap[val] || val;
                var x = document.createElement('span');
                x.className = 'removeTag';
                x.textContent = '×';
                x.addEventListener('click', function (e) { e.stopPropagation(); builderSelectedLangs = builderSelectedLangs.filter(function (v) { return v !== val; }); syncExportLangUI(); });
                chip.appendChild(t);
                chip.appendChild(x);
                display.appendChild(chip);
            });
        }

        // Also sync to window for translator compatibility
        window.selectedLangs = builderSelectedLangs;
    }

    // Build on init
    buildExportLangDropdown();

    // ==========================================================
    //  EXPORT — UI
    // ==========================================================
    function openExportModal() { exportModal.classList.add('show'); }
    function closeExportModal() { exportModal.classList.remove('show'); }

    $('#btnExport').addEventListener('click', openExportModal);
    $('#exportModalClose').addEventListener('click', closeExportModal);
    $('#exportCancel').addEventListener('click', closeExportModal);


    $$('.export-option').forEach(function (opt) {
        opt.addEventListener('click', function () {
            var fmt = opt.dataset.format;
            if (!fmt) return;

            if (fmt === 'translate') {
                var isSelected = opt.classList.contains('selected');

                $$('.export-option').forEach(function (o) { if (o.dataset.format !== 'translate') o.classList.remove('selected'); });
                opt.classList.toggle('selected', !isSelected);
                var config = $('#exportTranslateConfig');
                var translateBtn = $('#exportTranslateBtn');
                var normalBtns = [$('#exportDownload'), $('#exportCopy')];
                if (!isSelected) {
                    config.style.display = 'block';
                    translateBtn.style.display = '';
                    normalBtns.forEach(function (b) { b.style.display = 'none'; });
                } else {
                    config.style.display = 'none';
                    translateBtn.style.display = 'none';
                    normalBtns.forEach(function (b) { b.style.display = ''; });

                    $$('.export-option[data-format="html5"]')[0].classList.add('selected');
                    state.exportFormat = 'html5';
                }
            } else {
                state.exportFormat = fmt;

                $$('.export-option').forEach(function (o) { o.classList.toggle('selected', o.dataset.format === fmt); });
                var config = $('#exportTranslateConfig');
                if (config) config.style.display = 'none';
                var translateBtn = $('#exportTranslateBtn');
                if (translateBtn) translateBtn.style.display = 'none';
                [$('#exportDownload'), $('#exportCopy')].forEach(function (b) { b.style.display = ''; });
            }
        });
    });

    // Download
    $('#exportDownload').addEventListener('click', function () {
        saveCurrentPageState();
        var code = getExportCode();
        var ext = (state.exportFormat === 'amp') ? 'amp.html' : 'html';
        var blob = new Blob([code], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = 'criativo.' + ext; a.click();
        URL.revokeObjectURL(url); closeExportModal(); toast('Download iniciado!', 'success');
    });

    // Copy
    $('#exportCopy').addEventListener('click', function () {
        saveCurrentPageState();
        var code = getExportCode();
        navigator.clipboard.writeText(code).then(function () { closeExportModal(); toast('Código copiado!', 'success'); }).catch(function () {
            var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); closeExportModal(); toast('Código copiado!', 'success');
        });
    });

    // ==========================================================
    //  EXPORT + TRANSLATE (usa idiomas do builder, não do tradutor)
    // ==========================================================
    $('#exportTranslateBtn').addEventListener('click', async function () {
        var langs = builderSelectedLangs;
        if (!langs.length) { toast('Selecione idiomas primeiro', 'error'); return; }

        var apiKey = '';
        try { var keyInput = document.getElementById('apiKeyInput'); apiKey = keyInput ? keyInput.value.trim() : ''; if (!apiKey && window.FIXED_API_KEY) apiKey = window.FIXED_API_KEY; } catch (e) {}
        if (!apiKey || apiKey === 'SUA-API-KEY-AQUI') { toast('Configure a API Key no Tradutor', 'error'); return; }

        var context = ($('#exportContextInput') || {}).value || '';
        context = context.trim();
        saveCurrentPageState();

        var pagesHTML = [];
        var originalPageIndex = state.currentPageIndex;
        for (var p = 0; p < state.pages.length; p++) {
            var page = state.pages[p];
            state.elements = JSON.parse(JSON.stringify(page.elements));
            state.canvasW = page.canvasW; state.canvasH = page.canvasH;
            state.nextId = page.nextId || state.elements.length + 1;
            var html = (state.exportFormat === 'amp') ? generateAMP() : generateHTML5();
            var pageName = (page.name || ('Pagina-' + (p + 1))).replace(/[^a-zA-Z0-9À-ÿ_\- ]/g, '').replace(/\s+/g, '-');
            pagesHTML.push({ name: pageName + ((state.exportFormat === 'amp') ? '.amp.html' : '.html'), html: html });
        }
        loadPage(originalPageIndex);

        var allTexts = new Set();
        pagesHTML.forEach(function (page) { extractTextsFromHTML(page.html).forEach(function (t) { allTexts.add(t); }); });
        var uniqueTexts = Array.from(allTexts);
        if (!uniqueTexts.length) { toast('Nenhum texto encontrado', 'error'); return; }

        var labelMap = {};
        BUILDER_LANGUAGES.forEach(function (g) { g.items.forEach(function (i) { labelMap[i.value] = i.label; }); });

        var btn = $('#exportTranslateBtn'); btn.disabled = true; btn.textContent = '⏳ Traduzindo…';
        var progress = $('#exportTranslateProgress'), fill = $('#exportProgressFill'), label = $('#exportProgressLabel');
        progress.style.display = 'flex'; fill.style.width = '0%';

        var totalLangs = langs.length, completed = 0, translatedPages = {}, failed = [];

        for (var l = 0; l < langs.length; l++) {
            var lang = langs[l], langLabel = labelMap[lang] || lang;
            label.textContent = '[' + (completed + 1) + '/' + totalLangs + '] ' + langLabel + '…';
            fill.style.width = (completed / totalLangs * 100) + '%';
            try {
                var translations = await translateAllTextsForBuilder(apiKey, uniqueTexts, lang, context, function (done, total) {
                    var pct = (completed + (done / total)) / totalLangs * 100;
                    fill.style.width = pct + '%'; label.textContent = langLabel + ': ' + done + '/' + total + ' textos';
                });
                var transMap = {};
                for (var i = 0; i < uniqueTexts.length; i++) { if (translations[i] && translations[i] !== uniqueTexts[i]) transMap[uniqueTexts[i]] = translations[i]; }
                var translatedFiles = [];
                pagesHTML.forEach(function (page) { translatedFiles.push({ name: page.name, html: applyTranslationsToHTML(page.html, transMap) }); });
                translatedPages[lang] = translatedFiles; completed++;
            } catch (e) { console.error('Falha ' + langLabel + ':', e); failed.push(langLabel); completed++; }
            if (completed < totalLangs) await delayMs(500);
        }

        fill.style.width = '100%'; label.textContent = 'Gerando ZIP…';
        try {
            var masterZip = new JSZip();
            Object.keys(translatedPages).forEach(function (lang) {
                var safeLang = lang.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
                var folder = masterZip.folder(safeLang);
                translatedPages[lang].forEach(function (file) { folder.file(file.name, file.html); });
            });
            var blob = await masterZip.generateAsync({ type: 'blob' });
            var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'criativos-traduzidos.zip'; a.click(); URL.revokeObjectURL(url);
            toast('Download concluído! ' + Object.keys(translatedPages).length + ' idiomas', 'success');
        } catch (e) { console.error(e); toast('Erro ao gerar ZIP: ' + e.message, 'error'); }

        btn.disabled = false; btn.textContent = '🌍 Traduzir e Baixar';
        if (failed.length) label.textContent = completed + ' OK, ' + failed.length + ' falhou: ' + failed.join(', ');
        else label.textContent = 'Concluído!';
        setTimeout(function () { progress.style.display = 'none'; }, 4000);
        closeExportModal();
    });

    // ---- Helpers de tradução ----
    function extractTextsFromHTML(html) {
        var texts = [], parser = new DOMParser(), doc = parser.parseFromString(html, 'text/html');
        var walker = doc.createTreeWalker(doc.body || doc, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var txt = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
                if (!txt || txt.length < 2) return NodeFilter.FILTER_REJECT;
                var parent = node.parentElement; if (!parent) return NodeFilter.FILTER_REJECT;
                var tag = parent.tagName.toLowerCase();
                if (['script', 'style', 'noscript'].indexOf(tag) !== -1) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        while (walker.nextNode()) { var txt = (walker.currentNode.nodeValue || '').replace(/\s+/g, ' ').trim(); if (txt.length >= 2) texts.push(txt); }
        return texts;
    }

    function applyTranslationsToHTML(html, transMap) {
        var result = html;
        var keys = Object.keys(transMap).sort(function (a, b) { return b.length - a.length; });
        keys.forEach(function (original) {
            var translated = transMap[original];
            var escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            result = result.replace(new RegExp('(>\\s*)' + escaped + '(\\s*<)', 'g'), '$1' + translated + '$2');
            if (result.indexOf(translated) === -1) result = result.split(original).join(translated);
        });
        return result;
    }

    async function translateAllTextsForBuilder(apiKey, texts, lang, context, onProgress) {
        var batches = [], batch = [], chars = 0;
        for (var i = 0; i < texts.length; i++) {
            if (batch.length >= 50 || (chars + texts[i].length > 4000 && batch.length)) { batches.push(batch); batch = []; chars = 0; }
            batch.push({ i: i, t: texts[i] }); chars += texts[i].length;
        }
        if (batch.length) batches.push(batch);
        var full = new Map();
        for (var b = 0; b < batches.length; b++) {
            if (b > 0) await delayMs(500);
            var r = await translateBatchForBuilder(apiKey, batches[b], lang, context);
            for (var entry of r) full.set(entry[0], entry[1]);
            if (onProgress) onProgress(full.size, texts.length);
        }
        return texts.map(function (_, idx) { return full.get(idx) || texts[idx]; });
    }

    async function translateBatchForBuilder(apiKey, items, lang, context, retry) {
        retry = retry || 0;
        var payload = items.map(function (x) { return { i: x.i, t: x.t }; });
        var payloadStr = JSON.stringify(payload);
        var sys = 'Translate each text to ' + lang + '.' + (context ? ' Context: ' + context + '.' : '') +
            ' Keep same tone, length, style. Preserve HTML entities, numbers, brand names.' +
            ' Reply ONLY with JSON array: [{"i":<index>,"t":"<translated>"}]. No explanations. Return exactly ' + items.length + ' items.';
        var maxTokens = Math.min(Math.max(1500, Math.ceil(payloadStr.length * 2.5)), 16000);
        var resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
            body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.15, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: payloadStr }] })
        });
        if (resp.status === 429 && retry < 3) { await delayMs(Math.max(3000, retry * 3000)); return translateBatchForBuilder(apiKey, items, lang, context, retry + 1); }
        if (resp.status >= 500 && retry < 3) { await delayMs(retry * 2000); return translateBatchForBuilder(apiKey, items, lang, context, retry + 1); }
        if (!resp.ok) { var errBody = await resp.text(); var errMsg; try { errMsg = JSON.parse(errBody).error.message; } catch (e) {} throw new Error(errMsg || 'HTTP ' + resp.status); }
        var data = await resp.json(); var raw = (data.choices[0].message.content || '').trim();
        var fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) raw = fence[1].trim();
        var parsed; try { parsed = JSON.parse(raw); } catch (e) { var m = raw.match(/\[[\s\S]*\]/); if (m) parsed = JSON.parse(m[0]); }
        if (!parsed || !Array.isArray(parsed)) { if (retry < 2) { await delayMs(1000); return translateBatchForBuilder(apiKey, items, lang, context, retry + 1); } throw new Error('Resposta inválida da API'); }
        var map = []; parsed.forEach(function (item) { if (typeof item.i === 'number' && typeof item.t === 'string') map.push([item.i, item.t]); });
        var missing = items.filter(function (x) { return !map.some(function (m) { return m[0] === x.i; }); });
        if (missing.length && retry < 2) { await delayMs(800); var retryMap = await translateBatchForBuilder(apiKey, missing, lang, context, retry + 1); map = map.concat(retryMap); }
        return map;
    }

    function delayMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // ==========================================================
    //  PREVIEW
    // ==========================================================
    $('#btnPreview').addEventListener('click', function () {
        var code = generateHTML5();
        previewFrame.style.width = state.canvasW + 'px';
        previewFrame.style.height = Math.min(state.canvasH + 40, window.innerHeight * 0.7) + 'px';
        previewModal.classList.add('show'); previewFrame.srcdoc = code;
    });
    $('#previewModalClose').addEventListener('click', function () { previewModal.classList.remove('show'); });

    // ==========================================================
    //  SAVE / LOAD PROJECT
    // ==========================================================
    $('#btnSave').addEventListener('click', function () {
        saveCurrentPageState();
        var project = { version: 2, pages: state.pages, currentPageIndex: state.currentPageIndex };
        var blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'projeto-criativo.json'; a.click(); URL.revokeObjectURL(url);
        toast('Projeto salvo!', 'success');
    });

    function loadProjectFile(file) {
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var project = JSON.parse(ev.target.result);
                if (project.version === 2 && project.pages) {
                    state.pages = project.pages; state.currentPageIndex = project.currentPageIndex || 0;
                    pageCounter = state.pages.length; loadPage(state.currentPageIndex);
                    toast('Projeto carregado! (' + state.pages.length + ' páginas)', 'success');
                } else if (project.version === 1 && project.elements) {
                    state.pages = [{ id: 'page-1', name: 'Página 1', canvasW: project.canvasW || 600, canvasH: project.canvasH || 800, elements: project.elements, nextId: project.nextId || project.elements.length + 1 }];
                    state.currentPageIndex = 0; pageCounter = 1; loadPage(0);
                    toast('Projeto legado carregado!', 'success');
                }
            } catch (err) { toast('Erro ao carregar projeto', 'error'); }
        };
        reader.readAsText(file);
    }

    canvasArea.addEventListener('dragover', function (e) { e.preventDefault(); });
    canvasArea.addEventListener('drop', function (e) { var files = e.dataTransfer && e.dataTransfer.files; if (files && files.length && files[0].name.endsWith('.json')) { e.preventDefault(); loadProjectFile(files[0]); } });

    // ==========================================================
    //  TEMPLATES
    // ==========================================================

    $$('.template-card').forEach(function (card) { card.addEventListener('click', function () { loadTemplate(card.dataset.template); }); });

    function loadTemplate(name) {
        saveState(); state.elements = []; state.selectedId = null;
        switch (name) {
            case 'banner': state.canvasW = 600; state.canvasH = 400; addTemplateEl('rect', 0, 0, { w: 600, h: 400, bgColor: '#1a1a2e', borderRadius: 0 }); addTemplateEl('heading', 60, 60, { text: 'MEGA PROMOÇÃO', fontSize: 42, fontWeight: '900', color: '#ffffff', w: 480, h: 60 }); addTemplateEl('paragraph', 60, 140, { text: 'Até 70% OFF em todos os produtos. Oferta por tempo limitado!', fontSize: 18, color: '#b8b8d4', w: 400, h: 70 }); addTemplateEl('cta', 60, 250, { text: 'COMPRAR AGORA', w: 240, h: 55 }); break;
            case 'story': state.canvasW = 1080; state.canvasH = 1920; addTemplateEl('rect', 0, 0, { w: 1080, h: 1920, bgColor: '#0f0c29', borderRadius: 0 }); addTemplateEl('heading', 80, 600, { text: 'Sua História Começa Aqui', fontSize: 64, fontWeight: '900', color: '#ffffff', w: 920, h: 200 }); addTemplateEl('paragraph', 80, 840, { text: 'Arraste para cima e descubra mais', fontSize: 24, color: '#a0a0c0', w: 700, h: 50 }); addTemplateEl('cta', 300, 1400, { text: 'SAIBA MAIS ↑', w: 480, h: 80, fontSize: 24 }); break;
            case 'leaderboard': state.canvasW = 728; state.canvasH = 90; addTemplateEl('rect', 0, 0, { w: 728, h: 90, bgColor: '#2d3436', borderRadius: 0 }); addTemplateEl('heading', 20, 15, { text: 'Oferta Especial!', fontSize: 28, fontWeight: '700', color: '#ffffff', w: 300, h: 40 }); addTemplateEl('paragraph', 20, 52, { text: 'Economize até 50% hoje', fontSize: 14, color: '#b2bec3', w: 300, h: 25 }); addTemplateEl('cta', 540, 20, { text: 'VER OFERTA', w: 160, h: 50, fontSize: 14, borderRadius: 6 }); break;
            case 'medium-rect': state.canvasW = 300; state.canvasH = 250; addTemplateEl('rect', 0, 0, { w: 300, h: 250, bgColor: '#6c5ce7', borderRadius: 0 }); addTemplateEl('heading', 20, 30, { text: 'Novidade!', fontSize: 28, fontWeight: '700', color: '#ffffff', w: 260, h: 40 }); addTemplateEl('paragraph', 20, 80, { text: 'Confira os novos produtos com frete grátis.', fontSize: 14, color: '#dddddd', w: 260, h: 60 }); addTemplateEl('cta', 50, 175, { text: 'CONFERIR', w: 200, h: 48, fontSize: 14, bgGradient: 'linear-gradient(135deg, #fdcb6e, #e17055)', borderRadius: 8 }); break;
        }
        $('#canvasW').value = state.canvasW; $('#canvasH').value = state.canvasH;
        canvas.style.width = state.canvasW + 'px'; canvas.style.height = state.canvasH + 'px';
        autoFitZoom(); renderAll(); showProps(); updateLayers(); toast('Template carregado!', 'success');
    }

    function addTemplateEl(type, x, y, overrides) { var el = createElement(type, x, y); Object.assign(el, overrides || {}); state.elements.push(el); }

    // ==========================================================
    //  AUTO-FIT ZOOM
    // ==========================================================
    function autoFitZoom() {
        var area = canvasArea.getBoundingClientRect();
        var z = Math.min((area.width - 80) / state.canvasW * 100, (area.height - 80) / state.canvasH * 100, 100);
        setZoom(Math.round(z));
    }

    // ==========================================================
    //  TOPBAR BUTTONS
    // ==========================================================
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);

    // ==========================================================
    //  PAGES SYSTEM
    // ==========================================================
    var pageCounter = 1;

    function saveCurrentPageState() {
        var page = state.pages[state.currentPageIndex]; if (!page) return;
        page.elements = JSON.parse(JSON.stringify(state.elements));
        page.canvasW = state.canvasW; page.canvasH = state.canvasH; page.nextId = state.nextId;
    }

    function loadPage(index) {
        if (index < 0 || index >= state.pages.length) return;
        saveCurrentPageState();
        state.currentPageIndex = index; var page = state.pages[index];
        state.elements = JSON.parse(JSON.stringify(page.elements));
        state.canvasW = page.canvasW; state.canvasH = page.canvasH;
        state.nextId = page.nextId || state.elements.length + 1;
        state.selectedId = null; multiSelected = [];
        $('#canvasW').value = state.canvasW; $('#canvasH').value = state.canvasH;
        canvas.style.width = state.canvasW + 'px'; canvas.style.height = state.canvasH + 'px';
        var presetVal = state.canvasW + 'x' + state.canvasH;
        var presetSelect = $('#canvasPreset'); var matched = false;
        for (var i = 0; i < presetSelect.options.length; i++) { if (presetSelect.options[i].value === presetVal) { presetSelect.value = presetVal; matched = true; break; } }
        if (!matched) presetSelect.value = 'custom';
        autoFitZoom(); renderAll(); showProps(); updateLayers(); updatePagesList(); updateQuickActions();
    }

    function addPage(name, w, h, elements) {
        saveCurrentPageState(); pageCounter++;
        var newPage = { id: 'page-' + pageCounter, name: name || ('Página ' + pageCounter), canvasW: w || 600, canvasH: h || 800, elements: elements || [], nextId: (elements ? elements.length + 1 : 1) };
        state.pages.push(newPage); loadPage(state.pages.length - 1); toast('Nova página criada', 'success');
    }

    function duplicateCurrentPage() {
        saveCurrentPageState(); var current = state.pages[state.currentPageIndex]; pageCounter++;
        var clone = JSON.parse(JSON.stringify(current)); clone.id = 'page-' + pageCounter; clone.name = current.name + ' (cópia)';
        state.pages.push(clone); loadPage(state.pages.length - 1); toast('Página duplicada', 'success');
    }

    function deletePage(index) {
        if (state.pages.length <= 1) { toast('Deve haver ao menos 1 página', 'error'); return; }
        state.pages.splice(index, 1);
        if (state.currentPageIndex >= state.pages.length) state.currentPageIndex = state.pages.length - 1;
        loadPage(state.currentPageIndex); toast('Página excluída', 'info');
    }

    function renamePage(index) {
        var page = state.pages[index];
        var newName = prompt('Nome da página:', page.name);
        if (newName && newName.trim()) { page.name = newName.trim(); updatePagesList(); updateQuickActions(); }
    }

    function updatePagesList() {
        var list = $('#pagesList'); if (!list) return;
        list.innerHTML = state.pages.map(function (page, idx) {
            return '<div class="page-item' + (idx === state.currentPageIndex ? ' active' : '') + '" data-page-index="' + idx + '"><div class="page-item-thumb">' + (idx + 1) + '</div><div class="page-item-info"><div class="page-item-name">' + escapeHtml(page.name) + '</div><div class="page-item-size">' + page.canvasW + '×' + page.canvasH + '</div></div><div class="page-item-actions"><button class="page-action-btn" data-page-rename="' + idx + '">✏</button><button class="page-action-btn" data-page-delete="' + idx + '">✕</button></div></div>';
        }).join('');
        list.querySelectorAll('.page-item').forEach(function (item) {
            item.addEventListener('click', function (e) { if (e.target.closest('[data-page-rename]') || e.target.closest('[data-page-delete]')) return; loadPage(parseInt(item.dataset.pageIndex, 10)); });
        });
        list.querySelectorAll('[data-page-rename]').forEach(function (btn) { btn.addEventListener('click', function (e) { e.stopPropagation(); renamePage(parseInt(btn.dataset.pageRename, 10)); }); });
        list.querySelectorAll('[data-page-delete]').forEach(function (btn) { btn.addEventListener('click', function (e) { e.stopPropagation(); deletePage(parseInt(btn.dataset.pageDelete, 10)); }); });
    }

    // Sidebar page buttons
    var btnAddPage = $('#btnAddPage');
    if (btnAddPage) btnAddPage.addEventListener('click', function () { addPage(); });
    var btnDupPage = $('#btnDuplicatePage');
    if (btnDupPage) btnDupPage.addEventListener('click', function () { duplicateCurrentPage(); });

    // ==========================================================
    //  QUICK ACTIONS BAR (Páginas/Import visível no topo)
    // ==========================================================
    function updateQuickActions() {
        var indicator = $('#qaPageIndicator');
        if (indicator) {
            var page = state.pages[state.currentPageIndex];
            indicator.textContent = (page ? page.name : 'Página') + ' (' + (state.currentPageIndex + 1) + '/' + state.pages.length + ')';
        }
    }

    var qaPrev = $('#qaPrevPage');
    if (qaPrev) qaPrev.addEventListener('click', function () { if (state.currentPageIndex > 0) loadPage(state.currentPageIndex - 1); });

    var qaNext = $('#qaNextPage');
    if (qaNext) qaNext.addEventListener('click', function () { if (state.currentPageIndex < state.pages.length - 1) loadPage(state.currentPageIndex + 1); });

    var qaAdd = $('#qaAddPage');
    if (qaAdd) qaAdd.addEventListener('click', function () { addPage(); });

    var qaDup = $('#qaDuplicatePage');
    if (qaDup) qaDup.addEventListener('click', function () { duplicateCurrentPage(); });

    var qaRen = $('#qaRenamePage');
    if (qaRen) qaRen.addEventListener('click', function () { renamePage(state.currentPageIndex); });

    var qaDel = $('#qaDeletePage');
    if (qaDel) qaDel.addEventListener('click', function () { deletePage(state.currentPageIndex); });

    var qaImportHTML = $('#qaImportHTML');
    if (qaImportHTML) qaImportHTML.addEventListener('click', function () {
        var input = document.createElement('input'); input.type = 'file'; input.accept = '.html,.htm';
        input.onchange = function (e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function (ev) { importHTML(ev.target.result); }; reader.readAsText(file); };
        input.click();
    });

    var qaImportZip = $('#qaImportZip');
        if (qaImportZip) qaImportZip.addEventListener('click', async function () {
            if (!window.JSZip) { toast('JSZip não carregado', 'error'); return; }
            var input = document.createElement('input'); input.type = 'file'; input.accept = '.zip'; input.multiple = true;
            input.onchange = async function (e) {
                var files = e.target.files; if (!files || !files.length) return;
                var totalImported = 0;
                for (var f = 0; f < files.length; f++) {
                    try {
                        var buffer = await files[f].arrayBuffer();
                        var zip = await JSZip.loadAsync(buffer);
                        var assetMap = {}, assetNameMap = {}, zipEntries = [];
                        zip.forEach(function (rp, ze) { if (!ze.dir) zipEntries.push({ path: rp, entry: ze }); });
                        for (var a = 0; a < zipEntries.length; a++) {
                            var asset = zipEntries[a];
                            if (/\.html?$/i.test(asset.path)) continue;
                            var ext = asset.path.split('.').pop().toLowerCase();
                            var mimeMap = {
                                'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                                'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
                                'css': 'text/css', 'js': 'text/javascript',
                                'woff': 'font/woff', 'woff2': 'font/woff2',
                                'ttf': 'font/ttf', 'otf': 'font/otf',
                                'ico': 'image/x-icon', 'bmp': 'image/bmp',
                                'tif': 'image/tiff', 'tiff': 'image/tiff',
                                'avif': 'image/avif'
                            };
                            var mime = mimeMap[ext] || 'application/octet-stream';
                            var base64 = await asset.entry.async('base64');
                            var dataUri = 'data:' + mime + ';base64,' + base64;

                            // Mapear TODAS as variações possíveis do caminho
                            assetMap[asset.path] = dataUri;
                            assetMap['./' + asset.path] = dataUri;

                            var fileName = asset.path.split('/').pop();
                            assetNameMap[fileName] = dataUri;
                            assetNameMap[fileName.toLowerCase()] = dataUri;

                            // Sem extensão para fallback
                            var baseName = fileName.replace(/\.[^.]+$/, '');
                            if (!assetNameMap[baseName]) assetNameMap[baseName] = dataUri;

                            // Todas as sub-paths possíveis
                            var parts = asset.path.split('/');
                            for (var pp = 0; pp < parts.length; pp++) {
                                var sub = parts.slice(pp).join('/');
                                assetMap[sub] = dataUri;
                                assetMap['./' + sub] = dataUri;
                            }

                            // Com aspas (para CSS url('file.png') e url("file.png"))
                            assetNameMap["'" + fileName + "'"] = dataUri;
                            assetNameMap['"' + fileName + '"'] = dataUri;
                        }
                        var htmlEntries = [];
                        zip.forEach(function (rp, ze) { if (!ze.dir && /\.html?$/i.test(rp)) htmlEntries.push(ze); });
                        for (var h = 0; h < htmlEntries.length; h++) {
                            var htmlText = await htmlEntries[h].async('text');
                            htmlText = resolveAssetsInHTML(htmlText, assetMap, assetNameMap);
                            importHTML(htmlText); totalImported++;
                        }
                    } catch (err) { console.error('Erro ZIP:', err); toast('Erro no ZIP: ' + err.message, 'error'); }
                }
                if (!totalImported) toast('Nenhum HTML encontrado nos ZIPs', 'error');
                else if (totalImported > 1) toast(totalImported + ' criativos importados!', 'success');
            };
            input.click();
        });

    var qaAi = $('#qaBtnAiGenerate');
    if (qaAi) qaAi.addEventListener('click', function () {

        $$('.sidebar-tab').forEach(function (t) { t.classList.remove('active'); });

        $$('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
        var pagesTab = document.querySelector('.sidebar-tab[data-tab="pages"]');
        if (pagesTab) pagesTab.classList.add('active');
        $('#tab-pages').classList.add('active');
        var aiPanel = $('#aiPanel'); if (aiPanel) aiPanel.classList.remove('hidden');
    });

    // ==========================================================
    //  HTML IMPORT SYSTEM
    // ==========================================================
    var btnImportHTML = $('#btnImportHTML');
    if (btnImportHTML) btnImportHTML.addEventListener('click', function () {
        var input = document.createElement('input'); input.type = 'file'; input.accept = '.html,.htm';
        input.onchange = function (e) { var file = e.target.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = function (ev) { importHTML(ev.target.result); }; reader.readAsText(file); };
        input.click();
    });

    var btnImportZip = $('#btnImportZip');
    if (btnImportZip) btnImportZip.addEventListener('click', function () { if (qaImportZip) qaImportZip.click(); });

    // ---- Substituir a função resolveAssetsInHTML ----
    function resolveAssetsInHTML(html, assetMap, assetNameMap) {
        // 1. Resolver src, href, poster, srcset em atributos
        html = html.replace(/(src|href|poster|srcset)\s*=\s*(["'])([^"']*?)\2/gi, function (match, attr, quote, url) {
            if (/^(data:|https?:|javascript:|#|mailto:|about:)/i.test(url.trim())) return match;
            var resolved = resolveAssetRef(url.trim(), assetMap, assetNameMap);
            if (resolved) return attr + '=' + quote + resolved + quote;
            return match;
        });

        // 2. Resolver url() em QUALQUER lugar (style blocks, inline styles, etc.)
        // Suporta: url('file.png'), url("file.png"), url(file.png)
        html = html.replace(/url\(\s*(['"]?)([^'"\)]+?)\1\s*\)/gi, function (match, quote, url) {
            var trimmed = url.trim();
            if (/^(data:|https?:|about:|blob:)/i.test(trimmed)) return match;
            var resolved = resolveAssetRef(trimmed, assetMap, assetNameMap);
            if (resolved) return 'url(' + quote + resolved + quote + ')';
            return match;
        });

        return html;
    }

    // ---- Substituir a função resolveAssetRef ----
    function resolveAssetRef(url, assetMap, assetNameMap) {
        if (!url) return null;

        // Tentar exato
        if (assetMap[url]) return assetMap[url];

        // Remover ./ do início
        var cleaned = url.replace(/^\.\//, '');
        if (assetMap[cleaned]) return assetMap[cleaned];

        // Tentar com ./ prefixado
        if (assetMap['./' + cleaned]) return assetMap['./' + cleaned];

        // Extrair apenas o nome do arquivo (sem path, sem query, sem hash)
        var fileName = url.split('/').pop().split('?')[0].split('#')[0];

        // Tentar pelo nome do arquivo
        if (assetNameMap[fileName]) return assetNameMap[fileName];

        // Tentar lowercase
        var lower = fileName.toLowerCase();
        if (assetNameMap[lower]) return assetNameMap[lower];

        // Tentar decoded
        try {
            var decoded = decodeURIComponent(fileName);
            if (assetNameMap[decoded]) return assetNameMap[decoded];
            if (assetNameMap[decoded.toLowerCase()]) return assetNameMap[decoded.toLowerCase()];
        } catch (e) {}

        // Tentar sem extensão (caso tenha variações)
        var baseName = fileName.replace(/\.[^.]+$/, '');
        for (var key in assetNameMap) {
            if (key.replace(/\.[^.]+$/, '') === baseName) return assetNameMap[key];
            if (key.toLowerCase().replace(/\.[^.]+$/, '') === baseName.toLowerCase()) return assetNameMap[key];
        }

        return null;
    }


    function importHTML(htmlCode) {
        var iframe = document.createElement('iframe');
        
        // Detectar dimensões do criativo ANTES de criar o iframe
        var tempDoc = new DOMParser().parseFromString(htmlCode, 'text/html');
        var preCanvasW = 600, preCanvasH = 800;
        var metaAdSize = tempDoc.querySelector('meta[name="ad.size"]');
        if (metaAdSize) {
            var content = metaAdSize.getAttribute('content') || '';
            var wMatch = content.match(/width=(\d+)/);
            var hMatch = content.match(/height=(\d+)/);
            if (wMatch) preCanvasW = parseInt(wMatch[1], 10);
            if (hMatch) preCanvasH = parseInt(hMatch[1], 10);
        }
        
        // Criar iframe com dimensões EXATAS do criativo
        iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:' + preCanvasW + 'px;height:' + preCanvasH + 'px;visibility:hidden;border:none;overflow:hidden;';
        iframe.setAttribute('scrolling', 'no');
        document.body.appendChild(iframe);
        
        var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(htmlCode);
        iframeDoc.close();
        
        // Esperar mais tempo para imagens carregarem
        var checkCount = 0;
        var maxChecks = 20; // 20 x 100ms = 2s máximo
        
        function waitForImages() {
            var images = iframeDoc.querySelectorAll('img, amp-img');
            var allLoaded = true;
            images.forEach(function(img) {
                if (img.tagName === 'IMG' && !img.complete) allLoaded = false;
            });
            
            checkCount++;
            if (!allLoaded && checkCount < maxChecks) {
                setTimeout(waitForImages, 100);
                return;
            }
            
            // Dar tempo extra para layout estabilizar
            setTimeout(function() { processImport(); }, 200);
        }
        
        function processImport() {
            try {
                var canvasW = preCanvasW;
                var canvasH = preCanvasH;
                
                // Se não achou no meta, tentar pelo body
                if (!metaAdSize) {
                    var bodyStyle = iframe.contentWindow.getComputedStyle(iframeDoc.body);
                    var htmlStyle = iframe.contentWindow.getComputedStyle(iframeDoc.documentElement);
                    var bw = parseInt(bodyStyle.width, 10) || parseInt(htmlStyle.width, 10);
                    var bh = parseInt(bodyStyle.height, 10) || parseInt(htmlStyle.height, 10);
                    if (bw > 50 && bw < 3000) canvasW = bw;
                    if (bh > 50 && bh < 3000) canvasH = bh;
                }
                
                // Forçar dimensões corretas no body e html do iframe
                iframeDoc.documentElement.style.width = canvasW + 'px';
                iframeDoc.documentElement.style.height = canvasH + 'px';
                iframeDoc.documentElement.style.overflow = 'hidden';
                iframeDoc.body.style.width = canvasW + 'px';
                iframeDoc.body.style.height = canvasH + 'px';
                iframeDoc.body.style.overflow = 'hidden';
                iframeDoc.body.style.margin = '0';
                iframeDoc.body.style.padding = '0';
                
                var importedElements = [];
                var isAMP = !!iframeDoc.querySelector('html[\\⚡4ads],html[amp4ads],[amp4ads-boilerplate]');
                
                if (isAMP) {
                    importedElements = importAMP(iframeDoc, iframe.contentWindow, canvasW, canvasH);
                } else {
                    importedElements = importStandardHTML(iframeDoc, iframe.contentWindow, canvasW, canvasH);
                }
                
                if (importedElements.length > 0) {
                    // Corrigir posições: garantir que tudo está dentro do canvas
                    var minX = Infinity, minY = Infinity;
                    importedElements.forEach(function(el) {
                        if (el.x < minX) minX = el.x;
                        if (el.y < minY) minY = el.y;
                    });
                    
                    // Se elementos estão com offset negativo ou muito grande, ajustar
                    if (minX > 10 || minY > 10) {
                        // Verificar se é um offset consistente (container padding/margin)
                        var offsetX = 0, offsetY = 0;
                        
                        // Detectar se o primeiro container tem offset
                        var firstContainer = iframeDoc.body.firstElementChild;
                        if (firstContainer) {
                            var containerRect = firstContainer.getBoundingClientRect();
                            // Não compensar se é padding intencional do design
                        }
                    }
                    
                    importedElements.forEach(function (el, idx) { el.zIndex = idx + 1; });
                    addPage('Importado', canvasW, canvasH, importedElements);
                    toast(importedElements.length + ' elementos importados!', 'success');
                } else {
                    toast('Nenhum elemento visual encontrado', 'error');
                }
            } catch (err) {
                console.error('Import error:', err);
                toast('Erro ao importar: ' + err.message, 'error');
            }
            document.body.removeChild(iframe);
        }
        
        // Iniciar espera por imagens após um breve delay
        setTimeout(waitForImages, 300);
    }


    // ---- IMPORT AMP ----
    function importAMP(doc, win, canvasW, canvasH) {
        var elements = []; var ehDivs = doc.querySelectorAll('.eh');
        var positionMap = {}; var processedEhs = new Set();
        ehDivs.forEach(function (eh) { var ehStyle = eh.getAttribute('style') || ''; var pos = parseInlinePosition(ehStyle); var key = pos.top + '_' + pos.left; if (!positionMap[key]) positionMap[key] = []; positionMap[key].push({ eh: eh, pos: pos }); });

        // Detect CTA pairs
        Object.keys(positionMap).forEach(function (key) {
            var group = positionMap[key]; if (group.length < 2) return;
            var bgItem = null, txtItem = null;
            group.forEach(function (item) { var ehStyle = item.eh.getAttribute('style') || ''; if (ehStyle.indexOf('pointer-events') !== -1) txtItem = item; else { var eDiv = item.eh.querySelector('.e'); if (eDiv) { var eStyle = eDiv.getAttribute('style') || ''; if (eStyle.indexOf('background') !== -1) bgItem = item; } } });
            if (!bgItem && !txtItem && group.length === 2) { var id0 = group[0].eh.id || '', id1 = group[1].eh.id || ''; if (id0.indexOf('_bg') !== -1) { bgItem = group[0]; txtItem = group[1]; } else if (id1.indexOf('_bg') !== -1) { bgItem = group[1]; txtItem = group[0]; } else { var t0 = group[0].eh.innerText.trim(), t1 = group[1].eh.innerText.trim(); if (!t0 && t1) { bgItem = group[0]; txtItem = group[1]; } else if (t0 && !t1) { bgItem = group[1]; txtItem = group[0]; } } }
            if (bgItem && txtItem) {
                var pos = bgItem.pos; var ctaText = txtItem.eh.innerText.trim();
                var bgE = bgItem.eh.querySelector('.e'); var txtSpan = txtItem.eh.querySelector('.text span') || txtItem.eh.querySelector('.text') || txtItem.eh.querySelector('span');
                var ctaEl = createElement('cta', pos.left, pos.top); ctaEl.w = pos.width; ctaEl.h = pos.height; ctaEl.text = ctaText;
                if (bgE) {
                    var bgInline = bgE.getAttribute('style') || ''; var bgComputed = win.getComputedStyle(bgE);
                    ctaEl.bgColor = extractInlineValue(bgInline, 'background') || rgbToHex(bgComputed.backgroundColor) || '#6c5ce7';
                    if (ctaEl.bgColor.indexOf('gradient') !== -1) { ctaEl.bgGradient = ctaEl.bgColor; ctaEl.bgColor = '#6c5ce7'; } else ctaEl.bgGradient = '';
                    ctaEl.borderRadius = parseInt(extractInlineValue(bgInline, 'border-radius'), 10) || parseInt(bgComputed.borderRadius, 10) || 0;
                    var shadow = extractInlineValue(bgInline, 'box-shadow') || bgComputed.boxShadow;
                    if (shadow && shadow !== 'none') { var sp = parseBoxShadow(shadow); if (sp) { ctaEl.shadowX = sp.x; ctaEl.shadowY = sp.y; ctaEl.shadowBlur = sp.blur; ctaEl.shadowColor = sp.color; } }
                }
                if (txtSpan) { var txtComputed = win.getComputedStyle(txtSpan); ctaEl.fontSize = parseInt(txtComputed.fontSize, 10) || 14; ctaEl.fontWeight = normalizeFontWeight(txtComputed.fontWeight); ctaEl.fontFamily = txtComputed.fontFamily || 'Arial, sans-serif'; ctaEl.color = rgbToHex(txtComputed.color); }
                ctaEl.pulse = (bgItem.eh.className || '').indexOf('pulse') !== -1; ctaEl.pulseDuration = 1.5;
                ctaEl.textAlign = 'center'; ctaEl.link = '#';
                elements.push(ctaEl); processedEhs.add(bgItem.eh); processedEhs.add(txtItem.eh);
            }
        });

        // Process remaining elements
        ehDivs.forEach(function (eh) {
            if (processedEhs.has(eh)) return;
            var ehStyle = eh.getAttribute('style') || ''; var pos = parseInlinePosition(ehStyle);
            var text = eh.innerText.trim(); var eDiv = eh.querySelector('.e'); if (!eDiv) return;
            var eInline = eDiv.getAttribute('style') || ''; var eComputed = win.getComputedStyle(eDiv);
            var textDiv = eh.querySelector('.text');
            if (textDiv && text) {
                var spanEl = textDiv.querySelector('span') || textDiv; var spanComputed = win.getComputedStyle(spanEl);
                var fontSize = parseInt(spanComputed.fontSize, 10) || 16;
                var imported = createElement(fontSize >= 24 ? 'heading' : 'paragraph', pos.left, pos.top);
                imported.w = pos.width; imported.h = pos.height; imported.text = text; imported.fontSize = fontSize;
                imported.fontWeight = normalizeFontWeight(spanComputed.fontWeight); imported.fontFamily = spanComputed.fontFamily || 'Arial, sans-serif';
                imported.color = rgbToHex(spanComputed.color); var ta = spanComputed.textAlign; if (ta === 'start') ta = 'left'; imported.textAlign = ta || 'left';
                var lh = parseFloat(spanComputed.lineHeight); imported.lineHeight = isNaN(lh) ? 1.4 : Math.round((lh / fontSize) * 100) / 100;
                imported.letterSpacing = parseFloat(spanComputed.letterSpacing) || 0; if (isNaN(imported.letterSpacing)) imported.letterSpacing = 0;
                var bg = eComputed.backgroundColor; imported.bgColor = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? rgbToHex(bg) : 'transparent';
                imported.borderRadius = parseInt(eComputed.borderRadius, 10) || 0;
                elements.push(imported); return;
            }
            var hasBg = eComputed.backgroundColor !== 'rgba(0, 0, 0, 0)' && eComputed.backgroundColor !== 'transparent';
            var hasBgImage = eComputed.backgroundImage !== 'none';
            if (!text && (hasBg || hasBgImage)) {
                var shapeEl = createElement('rect', pos.left, pos.top); shapeEl.w = pos.width; shapeEl.h = pos.height;
                shapeEl.bgColor = hasBg ? rgbToHex(eComputed.backgroundColor) : '#cccccc';
                shapeEl.borderRadius = parseInt(eComputed.borderRadius, 10) || 0;
                elements.push(shapeEl); return;
            }
            var ampImg = eh.querySelector('amp-img');
            if (ampImg) { var imgEl = createElement('image', pos.left, pos.top); imgEl.w = pos.width; imgEl.h = pos.height; imgEl.src = ampImg.getAttribute('src') || ''; elements.push(imgEl); }
        });
        return elements;
    }

    // ---- IMPORT HTML5 STANDARD ----
    // ---- Substituir importStandardHTML inteira ----
    function importStandardHTML(doc, win, canvasW, canvasH) {
        var elements = [];
        var processedNodes = new Set();
        var allElements = doc.body.querySelectorAll('*');

        allElements.forEach(function (domEl) {
            if (processedNodes.has(domEl)) return;
            var tag = domEl.tagName.toLowerCase();
            if (['script', 'style', 'meta', 'link', 'head', 'html', 'body', 'br', 'noscript'].indexOf(tag) !== -1) return;

            // Skip full-size clicktag anchors
            if (tag === 'a') {
                var cls = (domEl.className || '').toLowerCase();
                if (cls.indexOf('clicktag') !== -1) return;
                var aRect = domEl.getBoundingClientRect();
                if (aRect.width >= canvasW * 0.9 && aRect.height >= canvasH * 0.9) return;
            }
            if (tag === 'div') {
                var divRect = domEl.getBoundingClientRect();
                var divStyle = win.getComputedStyle(domEl);
                var isFullSize = divRect.width >= canvasW * 0.9 && divRect.height >= canvasH * 0.9;
                var isFlexOrGrid = divStyle.display === 'flex' || divStyle.display === 'grid' || 
                                divStyle.display === 'inline-flex' || divStyle.display === 'inline-grid';
                var hasNoOwnVisual = divStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || 
                                    divStyle.backgroundColor === 'transparent';
                var noBgImage = !divStyle.backgroundImage || divStyle.backgroundImage === 'none';
                
                if (isFullSize && isFlexOrGrid && hasNoOwnVisual && noBgImage) {
                    return;
                }
            }
            
            var style = win.getComputedStyle(domEl);
            if (style.display === 'none' || style.visibility === 'hidden') return;

            var rect = domEl.getBoundingClientRect();
            if (rect.width < 2 || rect.height < 2) return;
            if (rect.left >= canvasW + 50 || rect.top >= canvasH + 50) return;
            if (rect.left + rect.width < -50 || rect.top + rect.height < -50) return;

            var hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
            var hasBgImage = style.backgroundImage && style.backgroundImage !== 'none';
            var isImg = tag === 'img';

            // Collect direct text
            var directText = '';
            domEl.childNodes.forEach(function (n) {
                if (n.nodeType === 3) directText += n.textContent;
            });
            directText = directText.trim();

            // Skip spans already processed by parent
            if (tag === 'span' && processedNodes.has(domEl.parentElement)) return;

            var elType = null, elData = {};

            // ---- IMG tag ----
            if (isImg) {
                elType = 'image';
                elData.src = domEl.getAttribute('src') || domEl.src || '';
                elData.borderRadius = parseInt(style.borderRadius, 10) || 0;
                elData.objectFit = style.objectFit || 'cover';
                markProcessed(domEl, processedNodes);
            }
            // ---- Element with background-image and NO text at all ----
            else if (hasBgImage && !domEl.innerText.trim()) {
                elType = 'image';
                elData.src = extractBgImageUrl(style.backgroundImage);
                elData.borderRadius = parseInt(style.borderRadius, 10) || 0;
                elData.objectFit = 'contain';
                markProcessed(domEl, processedNodes);
            }
            // ---- Small icon with background-image (like robux icon 30x30) ----
            else if (hasBgImage && !directText && rect.width <= 100 && rect.height <= 100) {
                elType = 'image';
                elData.src = extractBgImageUrl(style.backgroundImage);
                elData.borderRadius = parseInt(style.borderRadius, 10) || 0;
                elData.objectFit = 'contain';
                markProcessed(domEl, processedNodes);
            }
            // ---- Button-like (CTA) ----
            else if (isButtonLike(domEl, style, tag, domEl.innerText.trim())) {
                elType = 'cta';
                elData = extractCtaData(domEl, style, win, domEl.innerText.trim());
                markProcessed(domEl, processedNodes);
            }
            // ---- Text element ----
            else if (directText.length > 0) {
                var hasBlockChildren = false;
                domEl.querySelectorAll(':scope > div, :scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > a, :scope > button').forEach(function () {
                    hasBlockChildren = true;
                });
                if (!hasBlockChildren) {
                    var fontSize = parseInt(style.fontSize, 10) || 16;
                    elType = (fontSize >= 24) ? 'heading' : 'paragraph';
                    elData = extractTextData(domEl, style, win, directText);
                    markProcessed(domEl, processedNodes);
                }
            }
            // ---- Shape (bg color, no visual children) ----
            else if ((hasBg || parseInt(style.borderTopWidth, 10) > 0) && !hasVisualChildren(domEl, win)) {
                elType = 'rect';
                elData = extractShapeData(domEl, style);
                markProcessed(domEl, processedNodes);
            }

            if (!elType) return;

            var imported = createElement(elType, Math.round(rect.left), Math.round(rect.top));
            imported.w = Math.round(rect.width);
            imported.h = Math.round(rect.height);
            Object.keys(elData).forEach(function (key) { imported[key] = elData[key]; });

            // Capturar opacity
            var opacityVal = parseFloat(style.opacity);
            if (!isNaN(opacityVal) && opacityVal < 1) {
                imported.opacity = Math.round(opacityVal * 100);
            }

            elements.push(imported);
        });

        return elements;
    }


    // ---- Import helpers ----
    function parseInlinePosition(styleStr) {
        var result = { top: 0, left: 0, width: 100, height: 50 };
        var m; m = styleStr.match(/top:\s*(-?\d+)px/); if (m) result.top = parseInt(m[1], 10);
        m = styleStr.match(/left:\s*(-?\d+)px/); if (m) result.left = parseInt(m[1], 10);
        m = styleStr.match(/width:\s*(-?\d+)px/); if (m) result.width = parseInt(m[1], 10);
        m = styleStr.match(/height:\s*(-?\d+)px/); if (m) result.height = parseInt(m[1], 10);
        return result;
    }

    function extractInlineValue(styleStr, prop) { var regex = new RegExp(prop + ':\\s*([^;]+)'); var match = styleStr.match(regex); return match ? match[1].trim() : ''; }

    function markProcessed(domEl, processedNodes) { processedNodes.add(domEl); domEl.querySelectorAll('*').forEach(function (child) { processedNodes.add(child); }); }

    // ---- Substituir extractBgImageUrl ----
    function extractBgImageUrl(bgImage) {
        if (!bgImage || bgImage === 'none') return '';
        // Data URIs primeiro (podem ser muito longas)
        var dataMatch = bgImage.match(/url\(\s*["']?(data:[^"'\)]+)["']?\s*\)/);
        if (dataMatch) return dataMatch[1];
        // URLs normais
        var match = bgImage.match(/url\(\s*["']?([^"'\)]+?)["']?\s*\)/);
        return match ? match[1] : '';
    }


    function isButtonLike(domEl, style, tag, text) {
        if (!text || text.length === 0 || text.length > 50) return false;
        if (tag === 'button' || tag === 'input') return true;
        var hasBg = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
        var hasBgImage = style.backgroundImage !== 'none';
        if (tag === 'a' && (hasBg || hasBgImage)) return true;
        if ((hasBg || hasBgImage) && text.length < 40) { var rect = domEl.getBoundingClientRect(); if (rect.width < 20 || rect.height < 20) return false; if (rect.width / rect.height > 1 && rect.height < 120) return true; }
        var cls = (domEl.className || '').toLowerCase();
        if (cls.match(/btn|button|cta|claim|submit|action|banner/)) return true;
        return false;
    }

    function extractCtaData(domEl, style, win, text) {
        var data = {}; data.text = text || domEl.innerText.trim(); data.fontSize = parseInt(style.fontSize, 10) || 16;
        data.fontWeight = normalizeFontWeight(style.fontWeight); data.fontFamily = style.fontFamily || 'Arial, sans-serif';
        data.color = rgbToHex(style.color); data.textAlign = 'center'; data.link = domEl.getAttribute('href') || '#';
        var bg = style.backgroundColor; data.bgColor = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? rgbToHex(bg) : '#6c5ce7';
        data.bgGradient = (style.backgroundImage && style.backgroundImage !== 'none') ? style.backgroundImage : '';
        data.borderRadius = parseInt(style.borderRadius, 10) || 0;
        data.paddingTop = parseInt(style.paddingTop, 10) || 12; data.paddingRight = parseInt(style.paddingRight, 10) || 32;
        data.paddingBottom = parseInt(style.paddingBottom, 10) || 12; data.paddingLeft = parseInt(style.paddingLeft, 10) || 32;
        data.shadowX = 0; data.shadowY = 0; data.shadowBlur = 0; data.shadowColor = 'rgba(0,0,0,0.2)';
        if (style.boxShadow && style.boxShadow !== 'none') { var sp = parseBoxShadow(style.boxShadow); if (sp) { data.shadowX = sp.x; data.shadowY = sp.y; data.shadowBlur = sp.blur; data.shadowColor = sp.color; } }
        data.pulse = !!(style.animationName && style.animationName !== 'none'); data.pulseDuration = parseFloat(style.animationDuration) || 1.5;
        return data;
    }

    function extractTextData(domEl, style, win, text) {
        var data = {}; data.text = text || domEl.innerText.trim(); data.fontSize = parseInt(style.fontSize, 10) || 16;
        data.fontWeight = normalizeFontWeight(style.fontWeight); data.fontFamily = style.fontFamily || 'Arial, sans-serif';
        data.color = rgbToHex(style.color); var ta = style.textAlign; if (ta === 'start') ta = 'left'; if (ta === 'end') ta = 'right'; data.textAlign = ta || 'left';
        var lh = parseFloat(style.lineHeight); var fs = parseInt(style.fontSize, 10) || 16;
        data.lineHeight = isNaN(lh) ? 1.4 : Math.round((lh / fs) * 100) / 100;
        data.letterSpacing = parseFloat(style.letterSpacing) || 0; if (isNaN(data.letterSpacing)) data.letterSpacing = 0;
        var bg = style.backgroundColor; data.bgColor = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? rgbToHex(bg) : 'transparent';
        data.borderRadius = parseInt(style.borderRadius, 10) || 0;
        data.paddingTop = parseInt(style.paddingTop, 10) || 8; data.paddingRight = parseInt(style.paddingRight, 10) || 12;
        data.paddingBottom = parseInt(style.paddingBottom, 10) || 8; data.paddingLeft = parseInt(style.paddingLeft, 10) || 12;
        return data;
    }

    function extractShapeData(domEl, style) {
        var data = {}; var bg = style.backgroundColor;
        data.bgColor = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? rgbToHex(bg) : '#cccccc';
        data.borderRadius = parseInt(style.borderRadius, 10) || 0;
        data.borderWidth = parseInt(style.borderTopWidth, 10) || 0;
        if (data.borderWidth > 0) data.borderColor = rgbToHex(style.borderColor || style.borderTopColor);
        return data;
    }

    function hasVisualChildren(domEl, win) {
        var found = false;
        for (var i = 0; i < domEl.children.length; i++) {
            var child = domEl.children[i]; var tag = child.tagName.toLowerCase();
            if (['script', 'style', 'meta', 'link'].indexOf(tag) !== -1) continue;
            var cStyle = win.getComputedStyle(child);
            if (cStyle.display === 'none' || cStyle.visibility === 'hidden') continue;
            var cRect = child.getBoundingClientRect(); if (cRect.width < 2 || cRect.height < 2) continue;
            if (child.innerText && child.innerText.trim().length > 0) { found = true; break; }
            if (cStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && cStyle.backgroundColor !== 'transparent') { found = true; break; }
            if (cStyle.backgroundImage !== 'none') { found = true; break; }
            if (tag === 'img' || tag === 'amp-img') { found = true; break; }
        }
        return found;
    }

    function normalizeFontWeight(fw) { if (fw === 'bold') return '700'; if (fw === 'normal') return '400'; if (fw === 'lighter') return '300'; if (fw === 'bolder') return '800'; var num = parseInt(fw, 10); return !isNaN(num) ? String(num) : '400'; }

    function parseBoxShadow(shadow) {
        if (!shadow || shadow === 'none') return null;
        var parts = shadow.match(/(rgba?\([^)]+\))/); var color = parts ? parts[1] : 'rgba(0,0,0,0.2)';
        var numbers = shadow.replace(/(rgba?\([^)]+\))/g, '').match(/-?\d+(\.\d+)?/g);
        if (!numbers || numbers.length < 3) return null;
        return { x: parseInt(numbers[0], 10) || 0, y: parseInt(numbers[1], 10) || 0, blur: parseInt(numbers[2], 10) || 0, color: color };
    }

    function rgbToHex(rgb) {
        if (!rgb) return '#000000'; if (rgb.charAt(0) === '#') return rgb;
        var match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return '#000000';
        return '#' + ((1 << 24) + (parseInt(match[1], 10) << 16) + (parseInt(match[2], 10) << 8) + parseInt(match[3], 10)).toString(16).slice(1);
    }

    // ==========================================================
    //  INIT
    // ==========================================================
    updatePagesList();
    updateQuickActions();
    renderAll();
    showProps();
    setTimeout(autoFitZoom, 100);

    window.addEventListener('section-change', function () {
        var builderSection = document.getElementById('section-builder');
        if (builderSection && builderSection.classList.contains('active')) setTimeout(autoFitZoom, 50);
    });
    window.addEventListener('resize', autoFitZoom);

    // ==========================================================
    //  MULTI-SELECTION (Marquee / Lasso)
    // ==========================================================
    var multiSelected = [];
    var marqueeBox = $('#marqueeBox');
    var isMarquee = false;
    var marqueeStartX = 0, marqueeStartY = 0;

    canvas.addEventListener('mousedown', function (e) {
        if (e.target !== canvas) return;
        state.selectedId = null; multiSelected = []; renderAll(); showProps(); updateLayers();
        isMarquee = true;
        var canvasRect = canvas.getBoundingClientRect(); var scale = state.zoom / 100;
        marqueeStartX = (e.clientX - canvasRect.left) / scale; marqueeStartY = (e.clientY - canvasRect.top) / scale;
        marqueeBox.style.left = marqueeStartX + 'px'; marqueeBox.style.top = marqueeStartY + 'px';
        marqueeBox.style.width = '0px'; marqueeBox.style.height = '0px'; marqueeBox.classList.add('active');
        e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
        if (!isMarquee) return;
        var canvasRect = canvas.getBoundingClientRect(); var scale = state.zoom / 100;
        var currentX = (e.clientX - canvasRect.left) / scale, currentY = (e.clientY - canvasRect.top) / scale;
        marqueeBox.style.left = Math.min(marqueeStartX, currentX) + 'px';
        marqueeBox.style.top = Math.min(marqueeStartY, currentY) + 'px';
        marqueeBox.style.width = Math.abs(currentX - marqueeStartX) + 'px';
        marqueeBox.style.height = Math.abs(currentY - marqueeStartY) + 'px';
    });

    document.addEventListener('mouseup', function (e) {
        if (!isMarquee) return; isMarquee = false; marqueeBox.classList.remove('active');
        var canvasRect = canvas.getBoundingClientRect(); var scale = state.zoom / 100;
        var endX = (e.clientX - canvasRect.left) / scale, endY = (e.clientY - canvasRect.top) / scale;
        var selX1 = Math.min(marqueeStartX, endX), selY1 = Math.min(marqueeStartY, endY);
        var selX2 = Math.max(marqueeStartX, endX), selY2 = Math.max(marqueeStartY, endY);
        if (selX2 - selX1 < 5 && selY2 - selY1 < 5) { multiSelected = []; state.selectedId = null; renderAll(); showProps(); updateLayers(); return; }
        multiSelected = [];
        state.elements.forEach(function (el) {
            if (el.locked) return;
            var intersects = !(el.x + el.w < selX1 || el.x > selX2 || el.y + el.h < selY1 || el.y > selY2);
            if (intersects) multiSelected.push(el.id);
        });
        if (multiSelected.length > 0) state.selectedId = multiSelected[multiSelected.length - 1];
        renderAll(); renderMultiHighlight(); showProps(); updateLayers();
        if (multiSelected.length > 1) toast(multiSelected.length + ' elementos selecionados', 'info');
    });

    // Shift+Click for multi-select
    var _origBindElementEvents = bindElementEvents;
    bindElementEvents = function (div, el) {
        _origBindElementEvents(div, el);
        div.addEventListener('mousedown', function (e) {
            if (e.shiftKey && !el.locked) {
                e.stopPropagation(); e.preventDefault();
                var idx = multiSelected.indexOf(el.id);
                if (idx === -1) multiSelected.push(el.id); else multiSelected.splice(idx, 1);
                if (multiSelected.length > 0) state.selectedId = multiSelected[multiSelected.length - 1]; else state.selectedId = null;
                renderAll(); renderMultiHighlight(); showProps(); updateLayers();
            }
        });
    };

    function renderMultiHighlight() { multiSelected.forEach(function (id) { var domEl = document.getElementById(id); if (domEl) domEl.classList.add('multi-selected'); }); }

    var _origRenderAll = renderAll;
    renderAll = function () { _origRenderAll(); renderMultiHighlight(); };

    function getMultiSelectedElements() {
        if (multiSelected.length > 1) return state.elements.filter(function (e) { return multiSelected.indexOf(e.id) !== -1; });
        var sel = getSelectedElement(); return sel ? [sel] : [];
    }

    // ==========================================================
    //  ALIGNMENT FUNCTIONS
    // ==========================================================
    function alignElements(direction) {
        var els = getMultiSelectedElements(); if (els.length === 0) return; saveState();
        if (els.length === 1) {
            var el = els[0];
            switch (direction) { case 'left': el.x = 0; break; case 'centerH': el.x = Math.round((state.canvasW - el.w) / 2); break; case 'right': el.x = state.canvasW - el.w; break; case 'top': el.y = 0; break; case 'centerV': el.y = Math.round((state.canvasH - el.h) / 2); break; case 'bottom': el.y = state.canvasH - el.h; break; }
        } else {
            var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, totalCX = 0, totalCY = 0;
            els.forEach(function (el) { if (el.x < minX) minX = el.x; if (el.x + el.w > maxX) maxX = el.x + el.w; if (el.y < minY) minY = el.y; if (el.y + el.h > maxY) maxY = el.y + el.h; totalCX += el.x + el.w / 2; totalCY += el.y + el.h / 2; });
            var avgCX = totalCX / els.length, avgCY = totalCY / els.length;
            els.forEach(function (el) { switch (direction) { case 'left': el.x = minX; break; case 'centerH': el.x = Math.round(avgCX - el.w / 2); break; case 'right': el.x = maxX - el.w; break; case 'top': el.y = minY; break; case 'centerV': el.y = Math.round(avgCY - el.h / 2); break; case 'bottom': el.y = maxY - el.h; break; } });
        }
        renderAll(); showProps(); toast('Elementos alinhados', 'success');
    }

    function distributeElements(axis) {
        var els = getMultiSelectedElements(); if (els.length < 3) { toast('Selecione ao menos 3 elementos', 'info'); return; } saveState();
        if (axis === 'horizontal') {
            els.sort(function (a, b) { return a.x - b.x; });
            var firstX = els[0].x, lastX = els[els.length - 1].x + els[els.length - 1].w, totalW = 0;
            els.forEach(function (el) { totalW += el.w; });
            var gap = (lastX - firstX - totalW) / (els.length - 1), cx = firstX;
            els.forEach(function (el) { el.x = Math.round(cx); cx += el.w + gap; });
        } else {
            els.sort(function (a, b) { return a.y - b.y; });
            var firstY = els[0].y, lastY = els[els.length - 1].y + els[els.length - 1].h, totalH = 0;
            els.forEach(function (el) { totalH += el.h; });
            var gapV = (lastY - firstY - totalH) / (els.length - 1), cy = firstY;
            els.forEach(function (el) { el.y = Math.round(cy); cy += el.h + gapV; });
        }
        renderAll(); showProps(); toast('Elementos distribuídos', 'success');
    }

    $('#alignLeft').addEventListener('click', function () { alignElements('left'); });
    $('#alignCenterH').addEventListener('click', function () { alignElements('centerH'); });
    $('#alignRight').addEventListener('click', function () { alignElements('right'); });
    $('#alignTop').addEventListener('click', function () { alignElements('top'); });
    $('#alignCenterV').addEventListener('click', function () { alignElements('centerV'); });
    $('#alignBottom').addEventListener('click', function () { alignElements('bottom'); });
    $('#distH').addEventListener('click', function () { distributeElements('horizontal'); });
    $('#distV').addEventListener('click', function () { distributeElements('vertical'); });

    // ==========================================================
    //  CANVAS PRESET SIZES
    // ==========================================================
    $('#canvasPreset').addEventListener('change', function () {
        var val = this.value; if (val === 'custom') return;
        var parts = val.split('x'); var w = parseInt(parts[0], 10), h = parseInt(parts[1], 10);
        state.canvasW = w; state.canvasH = h;
        $('#canvasW').value = w; $('#canvasH').value = h;
        canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
        autoFitZoom(); renderAll(); toast('Canvas: ' + w + '×' + h + 'px', 'success');
    });
    $('#canvasW').addEventListener('change', function () { $('#canvasPreset').value = 'custom'; });
    $('#canvasH').addEventListener('change', function () { $('#canvasPreset').value = 'custom'; });

})();

// ====================================================================
// IA: GERAR CRIATIVO A PARTIR DE PRINT (v3 — GPT-5)
// ====================================================================
(function(){
    var btnAi = document.getElementById('btnAiGenerate');
    var aiPanel = document.getElementById('aiPanel');
    var aiSize = document.getElementById('aiSize');
    var aiFormat = document.getElementById('aiFormat');
    var aiDropzone = document.getElementById('aiDropzone');
    var aiFileInput = document.getElementById('aiFileInput');
    var aiThumbs = document.getElementById('aiThumbs');
    var aiContext = document.getElementById('aiContext');
    var aiGoBtn = document.getElementById('aiGoBtn');
    var aiStatus = document.getElementById('aiStatus');
    if (!btnAi) return;

    var aiImages = [];
    btnAi.addEventListener('click', function () { aiPanel.classList.toggle('hidden'); });
    aiDropzone.addEventListener('click', function () { aiFileInput.click(); });
    aiDropzone.addEventListener('dragover', function (e) { e.preventDefault(); aiDropzone.classList.add('dragover'); });
    aiDropzone.addEventListener('dragleave', function () { aiDropzone.classList.remove('dragover'); });
    aiDropzone.addEventListener('drop', function (e) { e.preventDefault(); aiDropzone.classList.remove('dragover'); handleAiFiles(e.dataTransfer.files); });
    aiFileInput.addEventListener('change', function () { handleAiFiles(aiFileInput.files); aiFileInput.value = ''; });

    function handleAiFiles(files) {
        for (var i = 0; i < files.length; i++) {
            if (!files[i].type.startsWith('image/')) continue;
            (function (f) {
                var reader = new FileReader();
                reader.onload = function (ev) { aiImages.push({ file: f, dataUrl: ev.target.result }); renderAiThumbs(); };
                reader.readAsDataURL(f);
            })(files[i]);
        }
    }

    function renderAiThumbs() {
        aiThumbs.innerHTML = '';
        aiImages.forEach(function (img, i) {
            var div = document.createElement('div'); div.className = 'ai-thumb';
            div.innerHTML = '<img src="' + img.dataUrl + '"><button class="remove-thumb" data-i="' + i + '">×</button>';
            div.querySelector('.remove-thumb').addEventListener('click', function () { aiImages.splice(i, 1); renderAiThumbs(); });
            aiThumbs.appendChild(div);
        });
    }

    aiGoBtn.addEventListener('click', async function () {
        if (aiImages.length === 0) { showAiStatus('Adicione pelo menos um print.', 'error'); return; }
        var apiKey = window.FIXED_API_KEY || (document.getElementById('apiKeyInput') ? document.getElementById('apiKeyInput').value : '');
        if (!apiKey) { showAiStatus('API Key não configurada.', 'error'); return; }
        var dims = aiSize.value.split('x').map(Number), w = dims[0], h = dims[1];
        var format = aiFormat.value, context = aiContext.value.trim();
        aiGoBtn.disabled = true; aiGoBtn.textContent = '⏳ Gerando...';
        showAiStatus('Enviando para GPT — pode levar 20-40s...', '');
        try {
            var html = await generateCreativeFromPrint({ apiKey: apiKey, w: w, h: h, format: format, context: context, images: aiImages });
            showAiStatus('Criativo gerado!', 'success');
            // Try to use importHTML from builder scope
            if (typeof importHTML === 'function') importHTML(html);
            else { var blob = new Blob([html], { type: 'text/html' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'creative_' + w + 'x' + h + '.html'; a.click(); URL.revokeObjectURL(url); }
        } catch (err) { console.error('[AI]', err); showAiStatus('Erro: ' + (err.message || err), 'error'); }
        finally { aiGoBtn.disabled = false; aiGoBtn.textContent = '⚡ Gerar Criativo'; }
    });

    function showAiStatus(msg, type) { aiStatus.classList.remove('hidden', 'error', 'success'); if (type) aiStatus.classList.add(type); aiStatus.textContent = msg; }

    async function generateCreativeFromPrint(opts) {
        var imageParts = opts.images.map(function (img) { return { type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } }; });
        var userText = 'Dimensão: ' + opts.w + '×' + opts.h + 'px. Formato: ' + (opts.format === 'amp' ? 'AMP (amp4ads)' : 'HTML5') + '.';
        if (opts.context) userText += '\nContexto: ' + opts.context;
        userText += '\n\nLeia TODOS os textos com precisão. Extraia cores exatas (hex). Responda SOMENTE com código HTML completo.';
        var messages = [{ role: 'system', content: 'Você gera criativos HTML para Google Ads a partir de screenshots. Responda apenas com código HTML.' }, { role: 'user', content: [{ type: 'text', text: userText }].concat(imageParts) }];
        var maxTokens = Math.min(16000, Math.max(6000, Math.round(opts.w * opts.h / 2.5)));
        var res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + opts.apiKey },
            body: JSON.stringify({ model: 'gpt-4o', messages: messages, max_tokens: maxTokens, temperature: 0.3 })
        });
        if (!res.ok) { var errData = await res.json().catch(function () { return {}; }); throw new Error((errData.error ? errData.error.message : '') || 'HTTP ' + res.status); }
        var data = await res.json(); var raw = data.choices[0].message.content.trim();
        var fence = raw.match(/```(?:html)?\s*\n?([\s\S]*?)```/); if (fence) raw = fence[1].trim();
        if (!raw.match(/^<(!doctype|!DOCTYPE|html)/i)) { var idx = raw.indexOf('<!'); var idx2 = raw.indexOf('<html'); raw = raw.substring(Math.max(0, idx >= 0 ? idx : (idx2 >= 0 ? idx2 : 0))); }
        var endIdx = raw.lastIndexOf('</html>'); if (endIdx >= 0) raw = raw.substring(0, endIdx + 7);
        return raw;
    }
})();
