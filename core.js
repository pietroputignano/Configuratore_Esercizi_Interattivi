const types = [
    {id: 'sentence_ordering', n: 'Mise en ordre (Frasi)'},
    {id: 'dressing', n: 'Dressing Game (Mapper / Lavagna)'},
    {id: 'domino', n: 'Domino Chain'},
    {id: 'anagramme', n: 'Anagramme (Ordering)'},
    {id: 'autocollantes', n: 'Autocollantes (Stickers)'},
    {id: 'rebus', n: 'Texte à trous (Rebus)'},
    {id: 'crossword', n: 'Mots Croisés (Cruciverba)'}
];

let items = [], dbImg = {}, dbAud = {}, curStep = 0, curLvl = 'facile', status = [], activeKey = "";
let errorTracker = [];
let mappedZones = []; let cwData = []; let cwClues = []; let rebusData = {}; 
let cwVerbLabel = ""; let cwShowClues = true; 
let autocollantesData = { facile: {}, difficile: {} };
let autoBuilderLevel = 'facile', autoBuilderKey = '', autoDrawMode = null, autoDraftCrop = null, autoPointerState = null;

let isMuted = false;

function isPlayerMode() { return typeof GAME_CONFIG !== 'undefined'; }
function getCurrentType() {
    if (isPlayerMode()) return GAME_CONFIG.levels?.[curLvl]?.type || 'sentence_ordering';
    const id = curLvl === 'facile' ? 'type-f' : 'type-d';
    return document.getElementById(id)?.value || 'sentence_ordering';
}
function getCurrentItems() {
    if (isPlayerMode()) return GAME_CONFIG.levels?.[curLvl]?.items || [];
    return items;
}
function syncPlayerConfig() {
    if (!isPlayerMode()) return;
    items = [...getCurrentItems()];
    mappedZones = GAME_CONFIG.mappedZones || [];
    cwData = GAME_CONFIG.cwData || [];
    cwClues = GAME_CONFIG.cwClues || [];
    rebusData = GAME_CONFIG.rebusData || {};
    cwVerbLabel = GAME_CONFIG.cwVerbLabel || '';
    cwShowClues = GAME_CONFIG.cwShowClues !== false;
    autocollantesData = GAME_CONFIG.autocollantesData || { facile: {}, difficile: {} };

    const badge = document.getElementById('res-badge');
    if (badge) badge.style.setProperty('--theme-color', GAME_CONFIG.uniteColor || '#E84C7B');
    const unite = String(GAME_CONFIG.unite ?? '1');
    const titre = GAME_CONFIG.titre || 'Jeu';
    document.getElementById('res-unite') && (document.getElementById('res-unite').innerText = unite);
    document.getElementById('start-unite') && (document.getElementById('start-unite').innerText = unite);
    document.getElementById('res-titre') && (document.getElementById('res-titre').innerText = titre);
    document.getElementById('start-titre') && (document.getElementById('start-titre').innerText = titre);
    const leconWrapper = document.getElementById('res-lecon-wrapper');
    if (leconWrapper) leconWrapper.classList.toggle('hidden', GAME_CONFIG.showLecon === false);
    document.getElementById('res-lecon') && (document.getElementById('res-lecon').innerText = GAME_CONFIG.lecon || '1');
}
function toggleMute() {
    isMuted = !isMuted;
    document.getElementById('mute-icon').innerText = isMuted ? '🔇' : '🔊';
    document.getElementById('mute-btn').classList.toggle('opacity-50', isMuted);
}

// Suoni bambini morbidi
function playSound(type) {
    if (isMuted) return;
    const audioSrc = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.audio[type] : dbAud[type];
    if (audioSrc) { const a = new Audio(audioSrc); a.play().catch(e => console.warn(e)); return; }

    if (!window.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        window.audioCtx = new AudioContext();
    }
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
    const ctx = window.audioCtx;
    const now = ctx.currentTime;

    const tone = (freq, start, dur, vol = 0.08, wave = 'sine', endFreq = null) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.025, dur / 3));
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(start); osc.stop(start + dur + 0.02);
    };

    // Fallback sonori piu' morbidi e giocosi per la scuola primaria.
    // Un file personalizzato, se caricato nel configuratore, continua ad avere priorita'.
    if (type === 'drag') {
        tone(520, now, 0.075, 0.045, 'sine', 700); // piccolo pop di presa
    } else if (type === 'drop') {
        tone(330, now, 0.07, 0.04, 'sine', 270); // toc morbido
        tone(520, now + 0.045, 0.075, 0.025, 'sine');
    } else if (type === 'global_ok') {
        tone(523.25, now, 0.16, 0.075, 'sine');
        tone(659.25, now + 0.105, 0.18, 0.075, 'sine');
        tone(783.99, now + 0.215, 0.24, 0.065, 'sine');
    } else if (type === 'global_ko') {
        tone(330, now, 0.17, 0.055, 'triangle', 285);
        tone(285, now + 0.12, 0.20, 0.045, 'sine', 310); // errore non punitivo
    } else if (type === 'report_high') {
        tone(523.25, now, 0.16, 0.07, 'sine');
        tone(659.25, now + 0.10, 0.16, 0.07, 'sine');
        tone(783.99, now + 0.20, 0.18, 0.07, 'sine');
        tone(1046.50, now + 0.32, 0.36, 0.06, 'sine');
    } else if (type === 'report_medium') {
        tone(440, now, 0.17, 0.055, 'sine');
        tone(554.37, now + 0.13, 0.20, 0.055, 'sine');
        tone(659.25, now + 0.27, 0.27, 0.05, 'sine');
    } else if (type === 'report_low') {
        tone(392, now, 0.18, 0.045, 'sine');
        tone(440, now + 0.15, 0.20, 0.045, 'sine');
        tone(493.88, now + 0.31, 0.28, 0.04, 'sine'); // finale incoraggiante, sempre ascendente
    }
}

window.onload = () => {
    if (isPlayerMode()) {
        syncPlayerConfig();
        showStartScreen();
        return;
    }
    document.querySelectorAll('.type-sel').forEach(s => { s.innerHTML = types.map(t=>`<option value="${t.id}">${t.n}</option>`).join(''); });
    const btnF = document.getElementById('type-f'); if(btnF) btnF.value = 'sentence_ordering';
    const btnD = document.getElementById('type-d'); if(btnD) btnD.value = 'dressing';
    toggleToolBtns('f'); toggleToolBtns('d');
    buildCWGrid(); initGame();
};

function toggleToolBtns(l) {
    const btn = document.getElementById('type-' + l);
    if(!btn || !btn.value) return;
    const type = btn.value;
    const mBtn = document.getElementById('btn-map-' + l); if(mBtn) mBtn.classList.toggle('hidden', type !== 'dressing');
    const cBtn = document.getElementById('btn-cw-' + l); if(cBtn) cBtn.classList.toggle('hidden', type !== 'crossword');
    const rBtn = document.getElementById('btn-rebus-' + l); if(rBtn) rBtn.classList.toggle('hidden', type !== 'rebus'); 
    const aBtn = document.getElementById('btn-auto-' + l); if(aBtn) aBtn.classList.toggle('hidden', type !== 'autocollantes');
}

/* --- BUILDERS --- */
function openRebusBuilder() {
    if(items.length === 0) { alert("Inserisci prima le parole base nel campo Dati!"); return; }
    let html = '';
    items.forEach(word => {
        const prevSentence = rebusData[word] || `Oggi mangio la {${word}}`;
        html += `<div class="bg-white p-4 rounded shadow-sm border border-gray-200"><label class="font-bold text-green-800 uppercase block mb-1">Parola: ${word}</label><input type="text" class="rebus-input w-full border border-gray-300 p-2 rounded" data-word="${word.replace(/"/g, '&quot;')}" value="${prevSentence.replace(/"/g, '&quot;')}"></div>`;
    });
    document.getElementById('rebus-sentences-container').innerHTML = html; document.getElementById('rebus-modal').classList.remove('hidden');
}
function closeRebusBuilder() { document.querySelectorAll('.rebus-input').forEach(inp => { rebusData[inp.dataset.word] = inp.value; }); document.getElementById('rebus-modal').classList.add('hidden'); startGame(); }

function openMapper() { document.getElementById('mapper-modal').classList.remove('hidden'); }
function closeMapper() { 
    document.querySelectorAll('.selected-zone').forEach(el => el.classList.remove('ring-4', 'ring-blue-500', 'selected-zone'));
    document.getElementById('mapper-modal').classList.add('hidden'); 
    startGame(); 
}

function clearSelection(e) {
    if (e.target.id === 'mapper-container' || e.target.id === 'mapper-preview' || e.target.id === 'mapper-hint') {
        document.querySelectorAll('.selected-zone').forEach(el => el.classList.remove('ring-4', 'ring-blue-500', 'selected-zone'));
    }
}
function alignZones(prop) {
    const selected = Array.from(document.querySelectorAll('.mapper-zone.selected-zone'));
    if(selected.length < 2) { alert("Clicca su almeno 2 blocchi per selezionarli (bordo azzurro) prima di allinearli!"); return; }
    const ref = selected[0]; 
    selected.forEach((el, i) => {
        if(i === 0) return;
        if(prop === 'left') el.style.left = ref.style.left;
        if(prop === 'top') el.style.top = ref.style.top;
        if(prop === 'width') el.style.width = ref.style.width;
        if(prop === 'height') el.style.height = ref.style.height;
    });
    saveZones();
}

function addZone() {
    const z = document.createElement('div'); z.className = 'mapper-zone flex flex-col p-1 gap-1 justify-center rounded-md'; z.style.cssText = "width:25%; height:12%; left:35%; top:40%;";
    const word = items[mappedZones.length] || "verbo";
    z.innerHTML = `<input class="w-full text-[10px] font-bold border-none bg-white/90 px-1 rounded placeholder-gray-500 shadow-sm" placeholder="Testo (usa ... per buco)" value="" onmousedown="event.stopPropagation()">
                   <input class="w-full text-[10px] font-bold border-none bg-orange-100 px-1 rounded text-orange-800 shadow-sm" placeholder="Parola attesa" value="${word.replace(/"/g, '&quot;')}" onmousedown="event.stopPropagation()">
                   <div class="resize-handle"></div>`;
    document.getElementById('mapper-container').appendChild(z); makeDraggable(z);
}

function makeDraggable(el) {
    let container = document.getElementById('mapper-container');
    el.onmousedown = (e) => {
        if(e.target.tagName === 'INPUT' || e.target.classList.contains('resize-handle')) return;
        let sx = e.clientX, sy = e.clientY;
        let moved = false;
        document.onmousemove = (ev) => { 
            moved = true;
            let dx = ev.clientX-sx, dy = ev.clientY-sy; sx=ev.clientX; sy=ev.clientY; 
            
            if (el.classList.contains('selected-zone')) {
                document.querySelectorAll('.selected-zone').forEach(sel => {
                    sel.style.left = (sel.offsetLeft + dx)/container.offsetWidth*100 + '%'; 
                    sel.style.top = (sel.offsetTop + dy)/container.offsetHeight*100 + '%'; 
                });
            } else {
                el.style.left = (el.offsetLeft + dx)/container.offsetWidth*100 + '%'; 
                el.style.top = (el.offsetTop + dy)/container.offsetHeight*100 + '%'; 
            }
        };
        document.onmouseup = () => { 
            document.onmousemove = null; 
            document.onmouseup = null; 
            if (!moved) { 
                el.classList.toggle('ring-4'); 
                el.classList.toggle('ring-blue-500'); 
                el.classList.toggle('selected-zone'); 
            }
            saveZones(); 
        };
    };
    el.querySelector('.resize-handle').onmousedown = (e) => { 
        e.stopPropagation(); 
        document.onmousemove = (ev) => { 
            el.style.width = (ev.clientX - el.getBoundingClientRect().left)/container.offsetWidth*100 + '%'; 
            el.style.height = (ev.clientY - el.getBoundingClientRect().top)/container.offsetHeight*100 + '%'; 
        }; 
        document.onmouseup = () => { document.onmousemove = null; document.onmouseup = null; saveZones(); }; 
    };
}

function saveZones() { 
    mappedZones = Array.from(document.querySelectorAll('.mapper-zone')).map(z => {
        const inputs = z.getElementsByTagName('input');
        return {
            label: inputs[0] ? inputs[0].value : '',
            word: inputs[1] ? inputs[1].value : '',
            left: z.style.left, top: z.style.top, width: z.style.width, height: z.style.height
        };
    });
}


/* --- AUTOCOLLANTES BUILDER --- */
function getAutoLevelBucket(level = autoBuilderLevel) {
    if (!autocollantesData[level]) autocollantesData[level] = {};
    return autocollantesData[level];
}
function getAutoBuilderItems(level = autoBuilderLevel) {
    const id = level === 'facile' ? 'items-list-f' : 'items-list-d';
    const el = document.getElementById(id);
    if (!el) return [];
    const raw = el.value.trim() !== '' ? el.value : el.placeholder;
    return raw.split(';').map(v => v.trim()).filter(Boolean);
}
function autoSafeKey(v) { return String(v).replace(/[^a-z0-9_-]/gi, '_'); }
function openAutocollantesBuilder(level) {
    autoBuilderLevel = level || 'facile';
    const keys = getAutoBuilderItems(autoBuilderLevel);
    if (!keys.length) { alert('Inserisci prima gli identificativi delle basi nel campo Dati, separati da ; (es: 1; 2; 3).'); return; }
    if (!autoBuilderKey || !keys.includes(autoBuilderKey)) autoBuilderKey = keys[0];
    const sel = document.getElementById('auto-board-select');
    sel.innerHTML = keys.map(k => `<option value="${k.replace(/"/g,'&quot;')}">${k}</option>`).join('');
    sel.value = autoBuilderKey;
    document.getElementById('auto-builder-level-label').innerText = autoBuilderLevel === 'facile' ? 'FACILE' : 'DIFFICILE';
    document.getElementById('auto-modal').classList.remove('hidden');
    renderAutocollantesBuilder();
}
function closeAutocollantesBuilder() {
    autoDrawMode = null; autoDraftCrop = null; autoPointerState = null;
    document.getElementById('auto-modal').classList.add('hidden');
    if (curLvl === autoBuilderLevel) startGame();
}
function selectAutoActivity(v) { autoBuilderKey = v; autoDrawMode = null; autoDraftCrop = null; renderAutocollantesBuilder(); }
function getAutoActivity(level = autoBuilderLevel, key = autoBuilderKey) {
    const bucket = getAutoLevelBucket(level);
    if (!bucket[key]) bucket[key] = { baseImageKey:'', sheetImageKey:'', baseWidth:0, baseHeight:0, sheetWidth:0, sheetHeight:0, stickers:[] };
    return bucket[key];
}
function pickAutoFile(kind) {
    const inp = document.getElementById(kind === 'base' ? 'autoBaseInp' : 'autoSheetInp');
    inp.value = '';
    inp.click();
}
function handleAutoFile(e, kind) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        const src = ev.target.result;
        const img = new Image();
        img.onload = () => {
            const cfg = getAutoActivity();
            const imageKey = `auto_${autoBuilderLevel}_${autoSafeKey(autoBuilderKey)}_${kind}`;
            dbImg[imageKey] = src;
            if (kind === 'base') { cfg.baseImageKey = imageKey; cfg.baseWidth = img.naturalWidth; cfg.baseHeight = img.naturalHeight; }
            else { cfg.sheetImageKey = imageKey; cfg.sheetWidth = img.naturalWidth; cfg.sheetHeight = img.naturalHeight; }
            renderAutocollantesBuilder();
            if (curLvl === autoBuilderLevel && getCurrentType() === 'autocollantes') loadStep(curStep);
        };
        img.src = src;
    };
    r.readAsDataURL(f);
}
function startAutoStickerPair() {
    const cfg = getAutoActivity();
    if (!cfg.sheetImageKey || !cfg.baseImageKey) { alert('Carica prima sia la base sia la tavola autocollantes.'); return; }
    autoDraftCrop = null;
    autoDrawMode = 'crop';
    renderAutocollantesBuilder();
}
function cancelAutoDrawing() { autoDrawMode = null; autoDraftCrop = null; autoPointerState = null; renderAutocollantesBuilder(); }
function deleteAutoSticker(idx) { const cfg=getAutoActivity(); cfg.stickers.splice(idx,1); renderAutocollantesBuilder(); }
function clearAutoStickers() { if(confirm('Eliminare tutti gli sticker e le zone di questa base?')) { getAutoActivity().stickers=[]; cancelAutoDrawing(); } }
function autoImgSrc(imageKey) { return isPlayerMode() ? (GAME_CONFIG.images?.[imageKey] || '') : (dbImg[imageKey] || ''); }
function autoRectFromPointer(e, wrap) {
    const r = wrap.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (e.clientX-r.left)/r.width*100)), y: Math.max(0, Math.min(100, (e.clientY-r.top)/r.height*100)) };
}
function autoPointerDown(e, kind) {
    if ((kind === 'sheet' && autoDrawMode !== 'crop') || (kind === 'base' && autoDrawMode !== 'zone')) return;
    e.preventDefault();
    const wrap = e.currentTarget;
    const p = autoRectFromPointer(e, wrap);
    autoPointerState = { kind, wrap, sx:p.x, sy:p.y, cx:p.x, cy:p.y };
    wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId);
    renderAutoTempRect();
}
function autoPointerMove(e, kind) {
    if (!autoPointerState || autoPointerState.kind !== kind) return;
    const p = autoRectFromPointer(e, autoPointerState.wrap); autoPointerState.cx=p.x; autoPointerState.cy=p.y; renderAutoTempRect();
}
function autoPointerUp(e, kind) {
    if (!autoPointerState || autoPointerState.kind !== kind) return;
    const p = autoRectFromPointer(e, autoPointerState.wrap); autoPointerState.cx=p.x; autoPointerState.cy=p.y;
    const x=Math.min(autoPointerState.sx,p.x), y=Math.min(autoPointerState.sy,p.y), w=Math.abs(p.x-autoPointerState.sx), h=Math.abs(p.y-autoPointerState.sy);
    autoPointerState=null;
    if (w < 2 || h < 2) { renderAutocollantesBuilder(); return; }
    const rect={x:+x.toFixed(3), y:+y.toFixed(3), w:+w.toFixed(3), h:+h.toFixed(3)};
    if (kind === 'sheet') { autoDraftCrop=rect; autoDrawMode='zone'; renderAutocollantesBuilder(); }
    else {
        const cfg=getAutoActivity();
        cfg.stickers.push({ id:`s${Date.now()}_${cfg.stickers.length+1}`, crop:autoDraftCrop, zone:rect });
        autoDraftCrop=null; autoDrawMode=null; renderAutocollantesBuilder();
    }
}
function renderAutoTempRect() {
    document.querySelectorAll('.auto-temp-rect').forEach(el=>el.remove());
    if (!autoPointerState) return;
    const x=Math.min(autoPointerState.sx,autoPointerState.cx), y=Math.min(autoPointerState.sy,autoPointerState.cy), w=Math.abs(autoPointerState.cx-autoPointerState.sx), h=Math.abs(autoPointerState.cy-autoPointerState.sy);
    const el=document.createElement('div'); el.className='auto-temp-rect'; el.style.cssText=`left:${x}%;top:${y}%;width:${w}%;height:${h}%;`;
    autoPointerState.wrap.appendChild(el);
}
function autoOverlayRect(rect, label, extra='') { return `<div class="auto-builder-rect ${extra}" style="left:${rect.x}%;top:${rect.y}%;width:${rect.w}%;height:${rect.h}%"><span>${label}</span></div>`; }
function renderAutocollantesBuilder() {
    const cfg=getAutoActivity();
    const baseSrc=autoImgSrc(cfg.baseImageKey), sheetSrc=autoImgSrc(cfg.sheetImageKey);
    const baseWrap=document.getElementById('auto-base-wrap'), sheetWrap=document.getElementById('auto-sheet-wrap');
    const status=document.getElementById('auto-draw-status');
    if(status) status.innerText = autoDrawMode==='crop' ? '1/2 Disegna un rettangolo attorno a uno sticker nella tavola.' : autoDrawMode==='zone' ? '2/2 Disegna ora la zona di destinazione sulla base.' : 'Crea una coppia Sticker → Zona per ogni elemento trascinabile.';
    const baseOverlays=cfg.stickers.map((s,i)=>autoOverlayRect(s.zone,String(i+1),'auto-zone-rect')).join('');
    const cropOverlays=cfg.stickers.map((s,i)=>autoOverlayRect(s.crop,String(i+1),'auto-crop-rect')).join('') + (autoDraftCrop?autoOverlayRect(autoDraftCrop,'NUOVO','auto-crop-rect auto-draft-rect'):'');
    baseWrap.innerHTML = baseSrc ? `<div class="auto-img-stage"><img src="${baseSrc}" draggable="false">${baseOverlays}</div>` : `<div class="auto-empty-preview">Carica immagine base</div>`;
    sheetWrap.innerHTML = sheetSrc ? `<div class="auto-img-stage"><img src="${sheetSrc}" draggable="false">${cropOverlays}</div>` : `<div class="auto-empty-preview">Carica tavola autocollantes</div>`;
    const baseStage=baseWrap.querySelector('.auto-img-stage'), sheetStage=sheetWrap.querySelector('.auto-img-stage');
    if(baseStage){ baseStage.onpointerdown=e=>autoPointerDown(e,'base'); baseStage.onpointermove=e=>autoPointerMove(e,'base'); baseStage.onpointerup=e=>autoPointerUp(e,'base'); }
    if(sheetStage){ sheetStage.onpointerdown=e=>autoPointerDown(e,'sheet'); sheetStage.onpointermove=e=>autoPointerMove(e,'sheet'); sheetStage.onpointerup=e=>autoPointerUp(e,'sheet'); }
    const list=document.getElementById('auto-pairs-list');
    list.innerHTML = cfg.stickers.length ? cfg.stickers.map((s,i)=>`<div class="auto-pair-row"><b>Sticker ${i+1}</b><span>ritaglio + zona associata</span><button onclick="deleteAutoSticker(${i})">Elimina</button></div>`).join('') : '<div class="text-gray-400 italic">Nessuna coppia definita.</div>';
}
function autoCropSvg(sheetSrc, crop, cfg, fitMode = 'preview') {
    const sw=cfg.sheetWidth||1000, sh=cfg.sheetHeight||1000;
    const x=crop.x/100*sw, y=crop.y/100*sh, w=crop.w/100*sw, h=crop.h/100*sh;
    // Nel pool manteniamo le proporzioni originali; una volta posizionato lo sticker
    // viene adattato esattamente al rettangolo target per aderire alla base.
    const preserve = fitMode === 'target' ? 'none' : 'xMidYMid meet';
    return `<svg class="auto-crop-svg ${fitMode === 'target' ? 'auto-crop-target' : ''}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="${preserve}"><image href="${sheetSrc}" x="0" y="0" width="${sw}" height="${sh}" preserveAspectRatio="none"></image></svg>`;
}
function setupAutocollantesBoard(boardConfigs) {
    const pool=document.getElementById('pool'); if(!pool) return;
    new Sortable(pool,{group:'autocollantes-game',sort:false,animation:150,onStart:()=>playSound('drag'),onEnd:()=>playSound('drop')});

    boardConfigs.forEach(({boardKey,cfg})=>{
        cfg.stickers.forEach(s=>{
            const targetId='auto-target-'+autoSafeKey(boardKey)+'-'+s.id;
            const tgt=document.getElementById(targetId); if(!tgt) return;
            new Sortable(tgt,{group:'autocollantes-game',animation:150,onAdd:e=>{
                const ok=e.item.dataset.stickerId===s.id && e.item.dataset.boardKey===boardKey;
                if(ok){
                    const sheetSrc=autoImgSrc(cfg.sheetImageKey);
                    // Ricreiamo il ritaglio in modalita' target: riempie precisamente la zona
                    // definita nel builder invece di conservare un rapporto d'aspetto diverso.
                    e.item.innerHTML=autoCropSvg(sheetSrc,s.crop,cfg,'target');
                    e.target.innerHTML=''; e.target.appendChild(e.item); e.target.classList.add('auto-target-solved');
                    e.item.className='auto-sticker-piece auto-sticker-placed';
                    e.item.style.width='100%'; e.item.style.height='100%'; e.item.style.aspectRatio='auto'; e.item.style.cursor='default';
                    e.item.removeAttribute('draggable');
                    playSound('global_ok');
                    const left=Array.from(pool.children).filter(ch=>!ch.classList.contains('sortable-ghost'));
                    if(!left.length){
                        status = new Array(getCurrentItems().length).fill('completed');
                        renderNav();
                        setTimeout(()=>showEndScreen(),900);
                    }
                } else {
                    errorTracker[0]=(errorTracker[0]||0)+1; playSound('global_ko');
                    e.item.classList.add('shake-error'); setTimeout(()=>{ e.item.classList.remove('shake-error'); pool.appendChild(e.item); },450);
                }
            }});
        });
    });
}

function openCWBuilder() { document.getElementById('cw-modal').classList.remove('hidden'); }
function buildCWGrid() { const gridEl = document.getElementById('cw-builder-grid'); if(!gridEl) return; let html = ''; for(let y=0; y<12; y++) { for(let x=0; x<12; x++) { html += `<div class="cw-cell-wrapper"><input type="text" maxlength="1" class="cw-cell" data-x="${x}" data-y="${y}"></div>`; } } gridEl.innerHTML = html; }
function findCWWords() {
    let grid = []; for(let y=0; y<12; y++) { grid[y] = []; for(let x=0; x<12; x++) { grid[y][x] = document.querySelector(`.cw-cell[data-x="${x}"][data-y="${y}"]`).value.trim().toUpperCase(); } }
    let words = []; let counter = 1;
    for(let y=0; y<12; y++) { let currWord = ""; let startX = -1; for(let x=0; x<=12; x++) { if(x<12 && grid[y][x]) { if(currWord === "") startX = x; currWord += grid[y][x]; } else { if(currWord.length > 1) words.push({ word: currWord, x: startX, y: y, dir: 'h' }); currWord = ""; } } }
    for(let x=0; x<12; x++) { let currWord = ""; let startY = -1; for(let y=0; y<=12; y++) { if(y<12 && grid[y][x]) { if(currWord === "") startY = y; currWord += grid[y][x]; } else { if(currWord.length > 1) words.push({ word: currWord, x: x, y: startY, dir: 'v' }); currWord = ""; } } }
    if(words.length === 0) return;
    let starts = {}; words.forEach(w => { let key = `${w.x}-${w.y}`; if(!starts[key]) starts[key] = counter++; w.num = starts[key]; });
    document.querySelectorAll('.cw-number').forEach(e => e.remove());
    Object.keys(starts).forEach(key => { let [x,y] = key.split('-'); let cellWrap = document.querySelector(`.cw-cell[data-x="${x}"][data-y="${y}"]`).parentElement; let span = document.createElement('span'); span.className = 'cw-number'; span.innerText = starts[key]; cellWrap.appendChild(span); });
    let cluesHtml = `<h4 class="font-bold text-blue-900 border-b pb-2 mb-3">Definizioni e pronomi</h4><div class="grid grid-cols-1 md:grid-cols-2 gap-4">`;
    words.sort((a,b) => a.num - b.num).forEach(w => {
        let label = w.dir === 'h' ? 'Orizzontale' : 'Verticale';
        let prev = cwClues.find(c => c.word === w.word && c.dir === w.dir) || {};
        let prevClue = prev.clue || "";
        let prevPronoun = prev.pronoun || "";
        cluesHtml += `<div class="bg-slate-50 border border-gray-200 rounded-lg p-3">
            <label class="text-xs font-bold text-gray-700 block mb-2">${w.num}. ${label} (${w.word})</label>
            <div class="grid grid-cols-[110px_1fr] gap-2">
                <input type="text" class="cw-pronoun-input w-full border border-gray-300 rounded p-2 text-xs font-bold text-blue-900" data-word="${w.word.replace(/"/g, '&quot;')}" data-num="${w.num}" data-dir="${w.dir}" data-x="${w.x}" data-y="${w.y}" placeholder="Pronom (Je, Tu...)" value="${prevPronoun.replace(/"/g, '&quot;')}">
                <input type="text" class="cw-clue-input w-full border border-gray-300 rounded p-2 text-xs" data-word="${w.word.replace(/"/g, '&quot;')}" data-num="${w.num}" data-dir="${w.dir}" data-x="${w.x}" data-y="${w.y}" placeholder="Définition" value="${prevClue.replace(/"/g, '&quot;')}">
            </div>
        </div>`;
    });
    cluesHtml += `</div>`; document.getElementById('cw-clues-container').innerHTML = cluesHtml; document.getElementById('cw-clues-container').classList.remove('hidden');
}
function closeCWBuilder() {
    cwData = []; cwClues = [];
    cwVerbLabel = document.getElementById('cw-in-verb') ? document.getElementById('cw-in-verb').value : "";
    cwShowClues = document.getElementById('cw-in-show-clues') ? document.getElementById('cw-in-show-clues').checked : true;
    document.querySelectorAll('.cw-cell').forEach(inp => { if(inp.value.trim() !== '') { let numSpan = inp.parentElement.querySelector('.cw-number'); cwData.push({ x: parseInt(inp.dataset.x), y: parseInt(inp.dataset.y), char: inp.value.toUpperCase(), num: numSpan ? parseInt(numSpan.innerText) : null }); } });
    document.querySelectorAll('.cw-clue-input').forEach(inp => {
        const pronounInp = document.querySelector(`.cw-pronoun-input[data-word="${CSS.escape(inp.dataset.word)}"][data-dir="${inp.dataset.dir}"]`);
        cwClues.push({
            num: parseInt(inp.dataset.num), dir: inp.dataset.dir, word: inp.dataset.word,
            x: parseInt(inp.dataset.x), y: parseInt(inp.dataset.y),
            clue: inp.value || inp.dataset.word,
            pronoun: pronounInp ? pronounInp.value.trim() : ''
        });
    });
    document.getElementById('cw-modal').classList.add('hidden'); startGame();
}

/* --- GAME LOGIC --- */
function initGame() {
    if (isPlayerMode()) { syncPlayerConfig(); return; }
    const listId = curLvl === 'facile' ? 'items-list-f' : 'items-list-d';
    const listEl = document.getElementById(listId);
    if(!listEl) return;
    const rawItems = listEl.value.trim() !== '' ? listEl.value : listEl.placeholder;
    items = rawItems.split(';').map(i=>i.trim()).filter(i=>i);
    
    let color = document.getElementById('in-color').value || '#E84C7B';
    document.getElementById('res-badge').style.setProperty('--theme-color', color);
    
    let showLecon = document.getElementById('in-show-lecon').checked;
    let leconWrapper = document.getElementById('res-lecon-wrapper');
    if(showLecon) {
        leconWrapper.classList.remove('hidden');
        const inLecon = document.getElementById('in-lecon');
        document.getElementById('res-lecon').innerText = inLecon.value.trim() !== '' ? inLecon.value : inLecon.placeholder;
    } else {
        leconWrapper.classList.add('hidden');
    }

    const inUnite = document.getElementById('in-unite');
    const uniteText = inUnite.value.trim() !== '' ? inUnite.value : inUnite.placeholder;
    document.getElementById('res-unite').innerText = uniteText;
    document.getElementById('start-unite').innerText = uniteText;
    
    const inTitre = document.getElementById('in-titre');
    const titreText = inTitre.value.trim() !== '' ? inTitre.value : inTitre.placeholder;
    document.getElementById('res-titre').innerText = titreText;
    document.getElementById('start-titre').innerText = titreText;
    
    toggleToolBtns('f'); toggleToolBtns('d');
}

function showStartScreen() {
    document.getElementById('start-screen').classList.remove('hidden'); document.getElementById('end-screen').classList.add('hidden');
}

function startGame() {
    document.getElementById('start-screen').classList.add('hidden'); document.getElementById('end-screen').classList.add('hidden');
    if (isPlayerMode()) syncPlayerConfig();
    const type = getCurrentType();
    items = [...getCurrentItems()];
    status = new Array(items.length).fill('pending'); 
    if(type === 'domino' || type === 'dressing' || type === 'crossword') errorTracker = [0]; 
    else errorTracker = new Array(items.length).fill(0);
    loadStep(0);
}


// --- CROSSWORD HELPERS ---
function getCWClueStart(clue) {
    if (Number.isFinite(clue?.x) && Number.isFinite(clue?.y)) return { x: clue.x, y: clue.y };
    const candidates = cwData.filter(c => c.num === clue?.num);
    if (candidates.length) return { x: candidates[0].x, y: candidates[0].y };
    return null;
}

function getCWCellMeta() {
    const meta = new Map();
    cwClues.forEach(clue => {
        const start = getCWClueStart(clue);
        if (!start || !clue.word) return;
        const chars = String(clue.word).toUpperCase().split('');
        chars.forEach((_, i) => {
            const x = start.x + (clue.dir === 'h' ? i : 0);
            const y = start.y + (clue.dir === 'v' ? i : 0);
            const key = `${x}-${y}`;
            if (!meta.has(key)) meta.set(key, { entries: [] });
            meta.get(key).entries.push({ clue, index: i });
        });
    });
    return meta;
}

function getCWNextCellId(x, y) {
    const meta = getCWCellMeta().get(`${x}-${y}`);
    if (!meta || !meta.entries.length) return '';
    // Prefer horizontal when an intersection belongs to two words; otherwise use the only direction.
    const entry = meta.entries.find(e => e.clue.dir === 'h') || meta.entries[0];
    const nextIndex = entry.index + 1;
    if (nextIndex >= String(entry.clue.word).length) return '';
    const start = getCWClueStart(entry.clue);
    if (!start) return '';
    const nx = start.x + (entry.clue.dir === 'h' ? nextIndex : 0);
    const ny = start.y + (entry.clue.dir === 'v' ? nextIndex : 0);
    return `cw-${nx}-${ny}`;
}

function getCWPronounLabelsAt(x, y) {
    return cwClues.filter(c => {
        const start = getCWClueStart(c);
        return start && start.x === x && start.y === y && c.pronoun;
    });
}

function getCWPronounHtml(x, y) {
    return getCWPronounLabelsAt(x, y).map(c =>
        `<span class="cw-pronoun-label ${c.dir === 'h' ? 'cw-pronoun-h' : 'cw-pronoun-v'}">${c.pronoun}</span>`
    ).join('');
}

function buildCrosswordSolutionHtml() {
    let html = '<div class="cw-solution-scroll custom-scrollbar"><div class="grid gap-1 p-6 bg-white rounded-2xl border border-gray-200" style="grid-template-columns: repeat(12, 40px); width:max-content; margin:0 auto;">';
    for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
            const cell = cwData.find(c => c.x === x && c.y === y);
            if (cell) {
                html += `<div class="cw-play-wrapper">${getCWPronounHtml(x,y)}<span class="cw-number">${cell.num || ''}</span><div class="cw-play-cell cw-solution-cell font-mont">${cell.char}</div></div>`;
            } else html += '<div class="w-10 h-10"></div>';
        }
    }
    return html + '</div></div>';
}

function showEndScreen() {
    document.getElementById('end-screen').classList.remove('hidden');
    const type = getCurrentType();
    
    let errs = errorTracker.reduce((a, b) => a + b, 0);
    let scorePerc = Math.max(0, 100 - (errs * 10));

    let answersHtml = '<div class="w-full mt-4"><h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Les solutions</h3><ul class="text-left bg-white p-4 rounded-xl border border-gray-200 max-h-48 overflow-y-auto custom-scrollbar">';
    if (type === 'crossword') {
        answersHtml += `<li class="list-none">${buildCrosswordSolutionHtml()}</li>`;
        if (cwClues.length) {
            answersHtml += `<li class="list-none mt-3"><div class="cw-solution-conjugation">` + cwClues.map(c => {
                const full = `${c.pronoun ? c.pronoun + ' ' : ''}${c.word}`.trim();
                return `<div><b>${c.num}.</b> ${full}</div>`;
            }).join('') + `</div></li>`;
        }
    } else if (type === 'domino') {
        const getSolutionImg = (key) => (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images[key] : dbImg[key];
        let dominoSolutions = '<div class="domino-solutions custom-scrollbar">';
        items.forEach((word, i) => {
            if (i === 0) {
                dominoSolutions += `<div class="domino-solution-tile"><div class="domino-solution-img domino-start-block"></div><div class="domino-solution-text">${word}</div></div>`;
                return;
            }
            const imgNeeded = items[i - 1];
            const imgSrc = getSolutionImg(imgNeeded);
            const visual = imgSrc
                ? `<img src="${imgSrc}" alt="" class="pointer-events-none">`
                : `<span class="domino-img-placeholder">📷<br>${imgNeeded}</span>`;
            dominoSolutions += `<div class="domino-solution-tile"><div class="domino-solution-img">${visual}</div><div class="domino-solution-text">${word}</div></div>`;
        });
        const lastWord = items[items.length - 1];
        const lastImg = getSolutionImg(lastWord);
        const lastVisual = lastImg ? `<img src="${lastImg}" alt="" class="pointer-events-none">` : `<span class="domino-img-placeholder">📷<br>${lastWord}</span>`;
        dominoSolutions += `<div class="domino-solution-tile"><div class="domino-solution-img">${lastVisual}</div><div class="domino-solution-text domino-end-block"></div></div>`;
        dominoSolutions += '</div>';
        answersHtml += `<li class="list-none">${dominoSolutions}</li>`;
    } else if (type === 'sentence_ordering') {
        items.forEach(it => {
            const correctSentence = it.split('/').map(w => w.trim()).join(' ');
            answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 text-sm">${correctSentence}</li>`;
        });
    } else if (type === 'anagramme') {
        answersHtml += '<li class="list-none"><div class="anagram-solutions custom-scrollbar">';
        items.forEach(it => {
            const parsed = parseAnagramItem(it);
            const imgSrc = getAnagramImage(it);
            const visual = imgSrc
                ? `<img src="${imgSrc}" alt="" class="pointer-events-none">`
                : `<span class="anagram-solution-placeholder">📷</span>`;
            const label = `${parsed.determiner ? parsed.determiner + ' ' : ''}${parsed.lexical}`.trim();
            answersHtml += `<div class="anagram-solution-card"><div class="anagram-solution-image">${visual}</div><div class="anagram-solution-label">${label}</div></div>`;
        });
        answersHtml += '</div></li>';
    } else if (type === 'dressing') {
        const zoneList = (typeof GAME_CONFIG !== 'undefined') ? (GAME_CONFIG.mappedZones || []) : mappedZones;
        const completionZones = zoneList.filter(z => z.label && z.label.includes('...'));
        if (completionZones.length > 0) {
            completionZones.forEach(z => {
                const completed = z.label.split('...').join(z.word || '');
                answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 text-lg font-black font-mont">${completed}</li>`;
            });
        } else {
            items.forEach(it => {
                answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 font-bold">${it}</li>`;
            });
        }
    } else if (type === 'rebus') {
        items.forEach(it => {
            let sentence = rebusData[it] || `{${it}}`;
            let solved = sentence.replace(/{([^}]+)}/g, '<span class="text-orange-500 font-bold">$1</span>');
            answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 text-sm">${solved}</li>`;
        });
    } else {
        items.forEach(it => {
            answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 font-bold">${it}</li>`;
        });
    }
    answersHtml += '</ul></div>';

    setTimeout(() => {
        const scoreBar = document.getElementById('score-bar');
        const scoreText = document.getElementById('score-text');
        if(scoreBar) scoreBar.style.width = scorePerc + '%';
        if(scoreText) scoreText.innerText = scorePerc + '%';
    }, 100);

    const imgHigh = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images['score_high'] : dbImg['score_high'];
    const imgLow = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images['score_low'] : dbImg['score_low'];
    const visualContainer = document.getElementById('visual-container');
    const scoreLevel = scorePerc >= 80 ? 'high' : (scorePerc >= 50 ? 'medium' : 'low');

    if (visualContainer) {
        // Le grafiche personalizzate restano prioritarie per risultato alto e basso.
        // Il livello intermedio usa sempre il nuovo fallback grafico del tool.
        if (scoreLevel === 'high' && imgHigh) {
            visualContainer.innerHTML = `<img src="${imgHigh}" class="score-custom-image" alt="">`;
        } else if (scoreLevel === 'low' && imgLow) {
            visualContainer.innerHTML = `<img src="${imgLow}" class="score-custom-image" alt="">`;
        } else {
            const text = scoreLevel === 'high' ? 'Bravo !' : (scoreLevel === 'medium' ? 'Bien joué !' : 'Essaie encore !');
            const sub = scoreLevel === 'high' ? 'Super travail !' : (scoreLevel === 'medium' ? 'Tu progresses !' : 'Tu peux y arriver !');
            const confetti = scoreLevel === 'high' ? `<span class="score-confetti c1"></span><span class="score-confetti c2"></span><span class="score-confetti c3"></span><span class="score-confetti c4"></span><span class="score-confetti c5"></span><span class="score-confetti c6"></span>` : '';
            visualContainer.innerHTML = `<div class="score-celebration score-${scoreLevel}">${confetti}<div class="score-rays"></div><div class="score-medal"><div class="score-star"></div></div><div class="score-message"><strong>${text}</strong><span>${sub}</span></div></div>`;
        }
    }

    if (scoreLevel === 'high') playSound('report_high');
    else if (scoreLevel === 'medium') playSound('report_medium');
    else playSound('report_low');
    document.getElementById('end-score').innerHTML = answersHtml;
}

function checkCrossword(inputEl) {
    if (inputEl && inputEl.value.trim() !== '') {
        if (inputEl.value.toUpperCase() !== inputEl.dataset.ans) {
            errorTracker[0]++;
            playSound('global_ko');
            inputEl.classList.add('shake-error', 'text-red-500');
            setTimeout(() => {
                inputEl.classList.remove('shake-error', 'text-red-500');
                inputEl.value = '';
                inputEl.focus();
            }, 500);
        } else {
            inputEl.value = inputEl.dataset.ans;
            inputEl.classList.add('correct');
            playSound('drop');
            const nextId = inputEl.dataset.next;
            if (nextId) {
                const next = document.getElementById(nextId);
                if (next && !next.classList.contains('correct')) setTimeout(() => next.focus(), 80);
            }
        }
    }

    let allCorrect = true; let filledCount = 0; let inputs = document.querySelectorAll('.cw-play-cell');
    inputs.forEach(inp => {
        if(inp.value.toUpperCase() !== inp.dataset.ans) { allCorrect = false; }
        if(inp.value.trim() !== '') filledCount++;
    });
    if(allCorrect && filledCount === inputs.length && inputs.length > 0) {
        playSound('global_ok');
        setTimeout(() => showEndScreen(), 1500);
    }
}

// ANAGRAMME: parsing isolato. Permette dati come "La poule", "Le cheval", "L\'ours".
// Il determinante resta gia' visibile; il bambino riordina solo le lettere del nome.
function parseAnagramItem(rawItem) {
    const raw = String(rawItem || '').trim();
    let determiner = '';
    let lexical = raw;

    const apostropheMatch = raw.match(/^(l['’])\s*(.+)$/i);
    const spacedMatch = raw.match(/^(le|la|les|un|une|des)\s+(.+)$/i);
    const match = apostropheMatch || spacedMatch;
    if (match) {
        determiner = match[1];
        lexical = match[2].trim();
    }

    return {
        raw,
        determiner,
        lexical,
        answer: lexical.replace(/\s+/g, '')
    };
}

function getAnagramImage(key) {
    return (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images[key] : dbImg[key];
}

function checkOrder(mode) {
    const target = document.getElementById('target');
    const targetWord = items[curStep];
    let isCorrect = false;

    if (mode === 'anagramme') {
        const parsed = parseAnagramItem(targetWord);
        const current = Array.from(target.children).map(el=>el.getAttribute('data-letter')).join('');
        isCorrect = (current.toLowerCase() === parsed.answer.toLowerCase());
    } else if (mode === 'sentence_ordering') {
        const expectedStr = targetWord.split('/').map(c=>c.trim()).join('');
        const currentStr = Array.from(target.children).map(el=>el.getAttribute('data-chunk')).join('');
        isCorrect = (currentStr === expectedStr);
    }

    if (isCorrect) {
        Array.from(target.children).forEach(el => {
            if(mode === 'anagramme') el.className = "anagram-solved-letter";
            else el.className = "px-2 py-1 text-2xl md:text-3xl font-black bg-transparent border-none shadow-none text-blue-900 m-0 font-mont";
        });
        target.style.border = "none"; target.style.background = "transparent";
        if (mode === 'anagramme') target.classList.add('anagram-target-solved');
        document.getElementById('check-btn').classList.add('hidden');
        validate(true);
    } else {
        playSound('global_ko');
        target.classList.add('shake-error', 'border-red-500');
        setTimeout(() => target.classList.remove('shake-error', 'border-red-500'), 500);
        validate(false);
    }
}

function loadStep(idx) {
    curStep = idx; renderNav();
    const stage = document.getElementById('main-content'); const pool = document.getElementById('pool');
    const type = getCurrentType();
    
    const resConsigne = document.getElementById('res-consigne');
    if (isPlayerMode()) {
        if (resConsigne) resConsigne.innerText = GAME_CONFIG.levels?.[curLvl]?.consigne || '';
    } else {
        const conInput = document.getElementById(curLvl === 'facile' ? 'con-f' : 'con-d');
        if (resConsigne && conInput) resConsigne.innerText = conInput.value.trim() !== '' ? conInput.value : conInput.placeholder;
    }
    
    stage.innerHTML = '';
    pool.innerHTML = '';
   if(type === 'crossword') {
        if(cwData.length === 0) { stage.innerHTML = "<p class='text-gray-400'>Usa il Costruttore Cruciverba (🧩).</p>"; return; }
        let labelHtml = cwVerbLabel ? `<div class="mb-6 px-10 py-3 bg-white border-2 border-blue-600 text-blue-900 rounded-full font-black text-3xl shadow-md font-mont uppercase">${cwVerbLabel}</div>` : '';
        // Preserve the exact v8.3 crossword grid: 12 columns and the original x/y positions.
        let gridHtml = '<div class="grid gap-1 p-6 bg-white rounded-2xl shadow-sm border border-gray-200" style="grid-template-columns: repeat(12, 40px);">';
        for(let y=0; y<12; y++) {
            for(let x=0; x<12; x++) {
                let cell = cwData.find(c => c.x === x && c.y === y);
                if(cell) {
                    const nextId = getCWNextCellId(x, y);
                    gridHtml += `<div class="cw-play-wrapper">${getCWPronounHtml(x,y)}<span class="cw-number">${cell.num || ''}</span><input id="cw-${x}-${y}" type="text" maxlength="1" class="cw-play-cell font-mont" data-x="${x}" data-y="${y}" data-ans="${cell.char}" data-next="${nextId}" oninput="checkCrossword(this)"></div>`;
                } else gridHtml += `<div class="w-10 h-10"></div>`;
            }
        }
        gridHtml += '</div>';
        let cluesHtml = (cwShowClues && cwClues.length > 0) ? `<div class="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mt-6"><h3 class="font-black text-blue-900 border-b border-gray-100 pb-2 mb-4 uppercase font-mont">Définitions</h3><div class="flex flex-col md:flex-row flex-wrap gap-4 text-sm text-gray-700">` + cwClues.map(c => `<div class="w-full md:w-[45%] bg-slate-50 p-3 rounded-lg"><b class="text-blue-800">${c.num}. ${c.pronoun ? c.pronoun + ' — ' : ''}${c.dir === 'h' ? 'Horizontal' : 'Vertical'} :</b> ${c.clue}</div>`).join('') + `</div></div>` : '';
        stage.innerHTML = `<div class="flex flex-col items-center w-full">${labelHtml}${gridHtml}${cluesHtml}</div>`;
        document.getElementById('nav-step').innerHTML = '';
        setTimeout(() => { const first = stage.querySelector('.cw-play-cell'); if (first) first.focus(); }, 0);
        return;
    }

    if(items.length === 0) return;
    const word = items[idx];

    let stepAudioHtml = '';
    const stepAudioKey = word + '_audio';
    const audioSrc = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.audio[stepAudioKey] : dbAud[stepAudioKey];
    if (audioSrc && type !== 'dressing') {
        stepAudioHtml = `<button onclick="new Audio('${audioSrc}').play()" class="mb-6 bg-orange-100 border-2 border-orange-400 text-orange-700 rounded-full px-8 py-2 font-black text-lg hover:bg-orange-200 transition shadow-md flex items-center justify-center gap-3 mx-auto"><span>▶</span> ÉCOUTE</button>`;
    }

    if(type === 'autocollantes') {
        // AUTOCOLLANTES e' un unico step: tutte le basi del livello vengono mostrate
        // contemporaneamente e tutti gli sticker condividono un solo pool.
        curStep = 0;
        const levelData = (isPlayerMode() ? (GAME_CONFIG.autocollantesData?.[curLvl] || {}) : (autocollantesData[curLvl] || {}));
        const boardConfigs = items.map(boardKey=>({boardKey,cfg:levelData[boardKey]}));
        const missing = boardConfigs.filter(({cfg})=>!cfg || !cfg.baseImageKey || !cfg.sheetImageKey || !cfg.stickers?.length);
        const ready = boardConfigs.filter(({cfg})=>cfg && cfg.baseImageKey && cfg.sheetImageKey && cfg.stickers?.length);

        let boardsHtml = '<div class="auto-activity-all">';
        ready.forEach(({boardKey,cfg})=>{
            const baseSrc=autoImgSrc(cfg.baseImageKey);
            const zones=cfg.stickers.map((s,i)=>`<div id="auto-target-${autoSafeKey(boardKey)}-${s.id}" class="auto-drop-zone" data-board-key="${boardKey.replace(/"/g,'&quot;')}" data-sticker-id="${s.id}" style="left:${s.zone.x}%;top:${s.zone.y}%;width:${s.zone.w}%;height:${s.zone.h}%"><span>${i+1}</span></div>`).join('');
            boardsHtml += `<div class="auto-game-card"><div class="auto-game-board"><img src="${baseSrc}" draggable="false">${zones}</div></div>`;
        });
        boardsHtml += '</div>';
        if(missing.length){
            boardsHtml += `<div class="auto-missing-config">Da configurare: ${missing.map(x=>x.boardKey).join(', ')}</div>`;
        }
        stage.innerHTML = boardsHtml;

        const allStickers=[];
        ready.forEach(({boardKey,cfg})=>{
            const sheetSrc=autoImgSrc(cfg.sheetImageKey);
            cfg.stickers.forEach(s=>allStickers.push({boardKey,cfg,s,sheetSrc}));
        });
        allStickers.sort(()=>Math.random()-0.5);
        pool.innerHTML=allStickers.map(({boardKey,cfg,s,sheetSrc})=>{
            const ratio=((s.crop.w*(cfg.sheetWidth||1))/(s.crop.h*(cfg.sheetHeight||1))) || 1;
            return `<div class="auto-sticker-piece" data-board-key="${boardKey.replace(/"/g,'&quot;')}" data-sticker-id="${s.id}" style="aspect-ratio:${ratio};">${autoCropSvg(sheetSrc,s.crop,cfg,'preview')}</div>`;
        }).join('');
        document.getElementById('nav-step').innerHTML='';
        setupAutocollantesBoard(ready);
    }
    else if(type === 'dressing') {
        const getImg = (key) => (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images[key] : dbImg[key];
        const bgImage = getImg('mapper_bg');
        const bg = bgImage ? `<img src="${bgImage}" class="absolute inset-0 w-full h-full object-cover">` : `<div class="p-10 text-gray-400">Nessuno Sfondo</div>`;
        
        let zonesHtml = '';
        const zoneList = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.mappedZones : mappedZones;
        
        zoneList.forEach(z => {
            const boxStyle = 'border-2 border-dashed border-orange-400 bg-orange-100/50 shadow-sm';
            const isInlineCompletion = !!(z.label && z.label.includes('...'));
            let targetDiv = isInlineCompletion
                ? `<div id="target-${z.word}" data-expected="${z.word.replace(/"/g, '&quot;')}" class="dressing-inline-target rounded-md inline-flex items-center justify-center transition-all duration-300 ${boxStyle}"></div>`
                : `<div id="target-${z.word}" data-expected="${z.word.replace(/"/g, '&quot;')}" class="flex-grow h-full rounded-xl flex items-center justify-center transition-all duration-300 ${boxStyle}"></div>`;
            let labelHtml = '';
            let wrapperClass = 'absolute flex items-center gap-3';

            if (z.label) {
                if (isInlineCompletion) {
                    const parts = z.label.split('...');
                    wrapperClass = 'absolute flex items-center gap-0';
                    labelHtml = `<span class="dressing-inline-text">${parts[0]}</span>` + 
                                targetDiv + 
                                `<span class="dressing-inline-text">${parts.slice(1).join('...')}</span>`;
                } else {
                    labelHtml = `<span class="text-xl md:text-3xl font-black text-white drop-shadow-md whitespace-nowrap font-mont" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${z.label.trim()}</span>` + targetDiv;
                }
            } else {
                labelHtml = targetDiv;
            }

            zonesHtml += `<div class="${wrapperClass}" style="left:${z.left}; top:${z.top}; width:${z.width}; height:${z.height}">${labelHtml}</div>`;
        });

        stage.insertAdjacentHTML('beforeend', `<div class="relative w-full max-w-[900px] aspect-[9/5] bg-slate-50 border-4 border-gray-300 shadow-2xl rounded-2xl flex items-center justify-center overflow-hidden">${bg}${zonesHtml}</div>`);
        
        const shuffled = [...items].sort(()=>Math.random()-0.5);
        pool.innerHTML = shuffled.map(it => {
            const stickerImg = getImg(it);
            if (stickerImg) { return `<div class="w-24 h-24 bg-white border-2 border-gray-200 rounded-xl shadow-md cursor-grab p-2 flex items-center justify-center transition-all hover:border-blue-400 shrink-0" data-word="${it.replace(/"/g, '&quot;')}" onclick="pickImg('${it.replace(/'/g, "\\'")}')"><img src="${stickerImg}" class="max-h-full object-contain pointer-events-none"></div>`; } 
            else { return `<div class="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xl rounded-xl shadow-md cursor-grab transition-all flex items-center justify-center min-w-[100px] shrink-0 font-source uppercase" data-word="${it.replace(/"/g, '&quot;')}" onclick="pickImg('${it.replace(/'/g, "\\'")}')">${it}</div>`; }
        }).join('');
        document.getElementById('nav-step').innerHTML = ''; setupSortable('dressing', null);
    }
    else if(type === 'domino') {
        const getImg = (key) => (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images[key] : dbImg[key];

        // Serpentina APERTA: niente chiusura forzata verso la prima tessera.
        // Ogni nuova tessera viene posizionata a partire dal punto WORD della precedente
        // e dal punto IMAGE della successiva. In questo modo allineamento e connettore
        // usano esattamente la stessa geometria.
        function dominoTileSize(orientation, mobile = false) {
            if (mobile) return orientation === 'h' ? {w:140, h:76} : {w:88, h:122};
            return orientation === 'h' ? {w:205, h:94} : {w:108, h:140};
        }

        function dominoHalfCenter(orientation, flow, kind, mobile = false) {
            if (mobile) {
                if (orientation === 'h') {
                    if (flow === 'left') return kind === 'image' ? {x:37.8,y:0} : {x:-32.2,y:0};
                    return kind === 'image' ? {x:-37.8,y:0} : {x:32.2,y:0};
                }
                if (flow === 'up') return kind === 'image' ? {x:0,y:28.06} : {x:0,y:-32.94};
                return kind === 'image' ? {x:0,y:-28.06} : {x:0,y:32.94};
            }
            if (orientation === 'h') {
                if (flow === 'left') return kind === 'image' ? {x:53.3,y:0} : {x:-49.2,y:0};
                return kind === 'image' ? {x:-53.3,y:0} : {x:49.2,y:0};
            }
            if (flow === 'up') return kind === 'image' ? {x:0,y:31.5} : {x:0,y:-38.5};
            return kind === 'image' ? {x:0,y:-31.5} : {x:0,y:38.5};
        }

        function portOffset(tile, kind, direction, mobile=false) {
            const sz = dominoTileSize(tile.o, mobile);
            const hc = dominoHalfCenter(tile.o, tile.flow, kind, mobile);
            if (direction === 'right') return {x: sz.w/2, y: hc.y};
            if (direction === 'left')  return {x:-sz.w/2, y: hc.y};
            if (direction === 'down')  return {x: hc.x, y: sz.h/2};
            return {x: hc.x, y:-sz.h/2};
        }

        function vecForDirection(direction, distance) {
            if (direction === 'right') return {x:distance,y:0};
            if (direction === 'left') return {x:-distance,y:0};
            if (direction === 'down') return {x:0,y:distance};
            return {x:0,y:-distance};
        }

        function oppositeDirection(dir) {
            return {right:'left',left:'right',down:'up',up:'down'}[dir];
        }

        // Pattern: riga -> discesa -> riga inversa -> discesa -> ...
        // Desktop: 3 tessere per riga e 2 nel tratto verticale.
        // Mobile: 2 tessere per riga e 1 nel tratto verticale.
        function buildDominoOpenSnake(count, mobile=false) {
            if (!count) return {path:[], positions:[], width:1, height:1};
            const horizontalRun = mobile ? 2 : 3;
            const verticalRun = mobile ? 1 : 2;
            const gap = mobile ? 14 : 18;
            const pad = mobile ? 12 : 22;
            const path = [];
            const positions = [];

            let horizontalFlow = 'right';
            let phase = 'horizontal';
            let phaseRemaining = horizontalRun;

            for (let i=0; i<count; i++) {
                let flow, o;
                if (phase === 'horizontal') {
                    flow = horizontalFlow;
                    o = 'h';
                } else {
                    flow = 'down';
                    o = 'v';
                }

                let entryDir = null;
                if (i > 0) {
                    const prev = path[i-1];
                    if (prev.o === 'h' && o === 'v') entryDir = 'down';
                    else if (prev.o === 'v' && o === 'h') entryDir = 'down';
                    else entryDir = flow;
                }
                path.push({o, flow, entryDir});

                if (i === 0) {
                    const sz = dominoTileSize(o,mobile);
                    positions.push({x:pad+sz.w/2, y:pad+sz.h/2});
                } else {
                    const prev = path[i-1];
                    const prevPos = positions[i-1];
                    const dir = entryDir;
                    const prevPort = portOffset(prev,'word',dir,mobile);
                    const currPort = portOffset(path[i],'image',oppositeDirection(dir),mobile);
                    const dv = vecForDirection(dir,gap);
                    positions.push({
                        x: prevPos.x + prevPort.x + dv.x - currPort.x,
                        y: prevPos.y + prevPort.y + dv.y - currPort.y
                    });
                }

                phaseRemaining--;
                if (phaseRemaining === 0 && i < count-1) {
                    if (phase === 'horizontal') {
                        phase = 'vertical';
                        phaseRemaining = verticalRun;
                    } else {
                        phase = 'horizontal';
                        horizontalFlow = horizontalFlow === 'right' ? 'left' : 'right';
                        phaseRemaining = horizontalRun;
                    }
                }
            }

            let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
            path.forEach((tile,i)=>{
                const sz=dominoTileSize(tile.o,mobile), c=positions[i];
                minX=Math.min(minX,c.x-sz.w/2); minY=Math.min(minY,c.y-sz.h/2);
                maxX=Math.max(maxX,c.x+sz.w/2); maxY=Math.max(maxY,c.y+sz.h/2);
            });
            const shiftX=pad-minX, shiftY=pad-minY;
            const shifted=positions.map(c=>({x:c.x+shiftX,y:c.y+shiftY}));
            return {path,positions:shifted,width:Math.ceil(maxX-minX+pad*2),height:Math.ceil(maxY-minY+pad*2)};
        }

        const dominoTileCount = items.length + 1; // starter + collegamenti + tessera finale
        const desktopCircuit = buildDominoOpenSnake(dominoTileCount, false);
        const mobileCircuit = buildDominoOpenSnake(dominoTileCount, true);
        const desktopPath = desktopCircuit.path;
        const mobilePath = mobileCircuit.path;
        const desktopGeo = {positions:desktopCircuit.positions,width:desktopCircuit.width,height:desktopCircuit.height};
        const mobileGeo = {positions:mobileCircuit.positions,width:mobileCircuit.width,height:mobileCircuit.height};
        const desktopFlows = desktopPath.map(p=>p.flow);
        const mobileFlows = mobilePath.map(p=>p.flow);

        function absolutePort(path, geo, index, kind, direction, mobile=false) {
            const off=portOffset(path[index],kind,direction,mobile);
            const c=geo.positions[index];
            return {x:c.x+off.x,y:c.y+off.y};
        }

        function buildConnectorSvg(path, geo, mobile=false) {
            if (path.length<2) return '';
            const klass=mobile ? 'domino-connectors domino-connectors-mobile' : 'domino-connectors domino-connectors-desktop';
            const segments=[];
            for (let i=0;i<path.length-1;i++) {
                const dir=path[i+1].entryDir;
                const a=absolutePort(path,geo,i,'word',dir,mobile);
                const b=absolutePort(path,geo,i+1,'image',oppositeDirection(dir),mobile);
                segments.push(`<polyline points="${a.x.toFixed(1)},${a.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}" />`);
            }
            return `<svg class="${klass}" viewBox="0 0 ${geo.width} ${geo.height}" aria-hidden="true">${segments.join('')}</svg>`;
        }

        const desktopConnectorSvg = buildConnectorSvg(desktopPath, desktopGeo, false);
        const mobileConnectorSvg = buildConnectorSvg(mobilePath, mobileGeo, true);
        let dominoChainHtml = `<div class="domino-chain" id="domino-board" style="--d-board-w:${desktopGeo.width}px; --d-board-h:${desktopGeo.height}px; --m-board-w:${mobileGeo.width}px; --m-board-h:${mobileGeo.height}px;">${desktopConnectorSvg}${mobileConnectorSvg}`;

        for (let i = 0; i < dominoTileCount; i++) {
            const d = desktopPath[i];
            const m = mobilePath[i];
            const dFlow = desktopFlows[i] || (d.o === 'v' ? 'down' : 'right');
            const mFlow = mobileFlows[i] || (m.o === 'v' ? 'down' : 'right');
            const ds = dominoTileSize(d.o, false), ms = dominoTileSize(m.o, true);
            const dp = desktopGeo.positions[i], mp = mobileGeo.positions[i];
            const slotClasses = `domino-slot orient-d-${d.o} orient-m-${m.o} flow-d-${dFlow} flow-m-${mFlow}`;
            const slotStyle = `--d-left:${(dp.x-ds.w/2).toFixed(1)}px; --d-top:${(dp.y-ds.h/2).toFixed(1)}px; --d-w:${ds.w}px; --d-h:${ds.h}px; --m-left:${(mp.x-ms.w/2).toFixed(1)}px; --m-top:${(mp.y-ms.h/2).toFixed(1)}px; --m-w:${ms.w}px; --m-h:${ms.h}px;`;

            if (i === 0) {
                // La catena e' lineare: il primo mezzo-domino e' un blocco START, non l'immagine dell'ultima parola.
                const w = items[0];
                dominoChainHtml += `<div class="${slotClasses}" style="${slotStyle}"><div class="domino-tile domino-starter cursor-default"><div class="tile-img domino-start-block" aria-label="Début"></div><div class="tile-text">${w}</div></div></div>`;
            } else if (i === items.length) {
                // Ultima posizione: immagine dell'ultima parola + blocco END.
                dominoChainHtml += `<div class="${slotClasses}" style="${slotStyle}"><div id="target-__DOMINO_END__" class="drop-target" data-expected="__DOMINO_END__"></div></div>`;
            } else {
                const w = items[i];
                dominoChainHtml += `<div class="${slotClasses}" style="${slotStyle}"><div id="target-${w}" class="drop-target" data-expected="${w.replace(/"/g, '&quot;')}"></div></div>`;
            }
        }

        dominoChainHtml += `</div>`;
        stage.insertAdjacentHTML('beforeend', `<div class="w-full flex justify-center px-1 md:px-4">${dominoChainHtml}</div>`);

        // Nel pool restano le tessere dalla seconda parola in poi, piu' la tessera terminale.
        const poolEntries = items.slice(1).map((it, i) => ({kind:'word', word:it, imageKey:items[i]}));
        poolEntries.push({kind:'end', word:'__DOMINO_END__', imageKey:items[items.length - 1]});
        poolEntries.sort(()=>Math.random()-0.5);
        pool.innerHTML = poolEntries.map((entry) => {
            const imgNeeded = entry.imageKey;
            const imgSrc = getImg(imgNeeded);
            const imgContent = imgSrc ? `<img src="${imgSrc}" class="object-contain w-full h-full pointer-events-none">` : `<span class="domino-img-placeholder">📷<br>${imgNeeded}</span>`;
            const imgClick = isPlayerMode() ? '' : ` onclick="pickImg('${imgNeeded.replace(/'/g, "\\'")}')"`;
            if (entry.kind === 'end') {
                return `<div class="domino-tile domino-pool-tile domino-finish-tile shadow-lg hover:shadow-xl transition cursor-grab" data-word="__DOMINO_END__"><div class="tile-img"${imgClick}>${imgContent}</div><div class="tile-text domino-end-block" aria-label="Fin"></div></div>`;
            }
            return `<div class="domino-tile domino-pool-tile shadow-lg hover:shadow-xl transition cursor-grab" data-word="${entry.word.replace(/"/g, '&quot;')}"><div class="tile-img"${imgClick}>${imgContent}</div><div class="tile-text">${entry.word}</div></div>`;
        }).join('');

        document.getElementById('nav-step').innerHTML = '';
        setupSortable('domino', null);
    }
    else if(type === 'anagramme') {
        // Consigne editoriale richiesta per l'Anagramme, usata solo se non e' stata compilata una consigne custom.
        const anagramDefaultConsigne = 'Regarde les dessins et mets les lettres dans le bon ordre.';
        if (resConsigne) {
            const configured = isPlayerMode()
                ? (GAME_CONFIG.levels?.[curLvl]?.consigne || '').trim()
                : (document.getElementById(curLvl === 'facile' ? 'con-f' : 'con-d')?.value || '').trim();
            if (!configured) resConsigne.innerText = anagramDefaultConsigne;
        }

        const parsed = parseAnagramItem(word);
        const shuffled = Array.from(parsed.answer).sort(()=>Math.random()-0.5);
        const imgSrc = getAnagramImage(word);
        const imgContent = imgSrc ? `<img src="${imgSrc}" class="h-full w-full object-contain pointer-events-none">` : '📷 Foto';
        const imgClick = isPlayerMode() ? '' : ` onclick="pickImg('${word.replace(/'/g, "\\'")}')"`;
        const determinerHtml = parsed.determiner ? `<div class="anagram-determiner">${parsed.determiner}</div>` : '';

        stage.insertAdjacentHTML('beforeend', `<div class="flex flex-col items-center gap-6 w-full">
            <div class="w-40 h-40 border-4 border-white rounded-2xl overflow-hidden bg-white shadow-lg flex justify-center items-center cursor-pointer"${imgClick}>${imgContent}</div>
            <div class="anagram-answer-wrap">
                ${determinerHtml}
                <div id="target" class="anagram-target">`
                    + shuffled.map(l => `<div class="letter-tile text-xl shadow-md cursor-grab" data-letter="${l.replace(/"/g, '&quot;')}">${l.toLowerCase()}</div>`).join('') +
                `</div>
            </div>
            <button id="check-btn" onclick="checkOrder('anagramme')" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-md transition transform hover:scale-105 font-mont uppercase">Vérifier</button>
        </div>`);
        pool.innerHTML = '';
        setupSortable('anagramme', parsed.answer);
    }
    else if(type === 'sentence_ordering') {
        const chunks = word.split('/').map(c => c.trim());
        const imgContent = dbImg[word] ? `<img src="${dbImg[word]}" class="h-full w-full object-contain pointer-events-none">` : '📷 Foto';
        const shuffled = [...chunks].sort(()=>Math.random()-0.5);
        stage.insertAdjacentHTML('beforeend', `<div class="flex flex-col items-center gap-8 w-full"><div class="w-48 h-32 border-4 border-white rounded-2xl overflow-hidden bg-white shadow-lg flex justify-center items-center cursor-pointer" onclick="pickImg('${word.replace(/'/g, "\\'")}')">${imgContent}</div>
            <div id="target" class="flex flex-wrap gap-2 min-h-[60px] w-full max-w-3xl items-center justify-center p-4 bg-white rounded-xl shadow-inner border-2 border-gray-200">` 
                + shuffled.map(c => `<div class="px-4 py-2 bg-orange-500 text-white rounded-xl shadow-md cursor-grab font-bold text-lg font-source uppercase" data-chunk="${c.replace(/"/g, '&quot;')}">${c}</div>`).join('') + 
            `</div>
            <button id="check-btn" onclick="checkOrder('sentence_ordering')" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-md transition transform hover:scale-105 font-mont uppercase">Vérifier</button>
        </div>`);
        pool.innerHTML = '';
        setupSortable('sentence_ordering', word);
    }
    else if(type === 'rebus') {
        const sentence = rebusData[word] || `{${word}}`;
        const text = sentence.replace(/{([^}]+)}/g, `<div id="target" class="rebus-gap overflow-hidden inline-flex items-center justify-center px-4 shadow-inner" data-ans="$1"></div>`);
        const imgContent = dbImg[word] ? `<img src="${dbImg[word]}" class="h-full w-full object-contain pointer-events-none">` : '<span class="text-[10px] text-gray-500 font-bold uppercase text-center">📷 Immagine<br>(Opzionale)</span>';
        stage.insertAdjacentHTML('beforeend', `<div class="flex flex-col items-center w-full max-w-3xl gap-6"><div class="w-40 h-40 border-4 border-white rounded-2xl overflow-hidden bg-white shadow-lg flex justify-center items-center cursor-pointer hover:scale-105 transition" onclick="pickImg('${word.replace(/'/g, "\\'")}')">${imgContent}</div><div class="text-2xl md:text-4xl font-black text-blue-900 leading-relaxed text-center font-mont bg-white p-6 rounded-2xl shadow-sm border border-gray-100 w-full">${text}</div></div>`);
        const shuffledItems = [...items].sort(() => Math.random() - 0.5);
        pool.innerHTML = shuffledItems.map(it => `<div class="px-6 py-3 bg-white border-2 border-gray-200 rounded-xl shadow-md cursor-grab font-bold text-lg flex items-center justify-center hover:border-blue-400 transition font-source uppercase" data-word="${it.replace(/"/g, '&quot;')}">${it}</div>`).join('');
        setupSortable('rebus', word);
    }

    if (stepAudioHtml !== '') { stage.insertAdjacentHTML('afterbegin', stepAudioHtml); }
}

function playStepAudio(btn) {
    const wordStr = btn.getAttribute('data-word');
    const stepAudioKey = wordStr + '_audio';
    const audioSrc = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.audio[stepAudioKey] : dbAud[stepAudioKey];
    
    if (audioSrc) {
        new Audio(audioSrc).play();
    } else {
        let textToSpeak = wordStr;
        const type = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.levels[curLvl].type : document.getElementById(curLvl === 'facile' ? 'type-f' : 'type-d').value;
        
        if (type === 'sentence_ordering') {
            textToSpeak = wordStr.replace(/\//g, ' ');
        } else if (type === 'rebus') {
            const rData = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.rebusData : rebusData;
            const sentence = rData[wordStr] || wordStr;
            textToSpeak = sentence.replace(/[{}]/g, '');
        }
        
        const m = new SpeechSynthesisUtterance(textToSpeak);
        m.lang = 'fr-FR';
        m.rate = 0.6;
        window.speechSynthesis.speak(m);
    }
}

function setupSortable(mode, targetWord) {
    const pool = document.getElementById('pool'); 
    
    if (mode === 'autocollantes' || mode === 'dressing' || mode === 'domino') {
        if(!pool) return;
        new Sortable(pool, { group: 'game', sort: false, animation: 150, onStart: () => playSound('drag'), onEnd: () => playSound('drop') });
        
        const itemArray = getCurrentItems();
        const zoneList = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.mappedZones : mappedZones;
        const targetWords = mode === 'domino' ? itemArray.slice(1).concat('__DOMINO_END__') : (mode === 'autocollantes' ? itemArray : zoneList.map(z => z.word));

        targetWords.forEach(w => {
            const tgt = document.getElementById('target-' + w);
            if (tgt) {
                new Sortable(tgt, {
                    group: 'game', animation: 150, onStart: () => playSound('drag'),
                    onAdd: (e) => {
                        const dropped = e.item.getAttribute('data-word');
                        const expectedWord = e.target.getAttribute('data-expected');
                        if(dropped.toLowerCase() === expectedWord.toLowerCase()) {
                            if (mode === 'dressing') {
                                if (e.target.classList.contains('dressing-inline-target')) {
                                    e.item.className = "dressing-inline-answer";
                                    e.target.classList.add('dressing-inline-target-solved');
                                } else {
                                    e.item.className = "w-full h-full flex items-center justify-center p-0 m-0 border-0 bg-transparent shadow-none font-black text-2xl md:text-3xl text-white drop-shadow-md font-mont uppercase";
                                }
                            } else if (mode === 'domino') {
                                e.item.className = "domino-tile shadow-sm"; 
                                e.item.style.setProperty('box-shadow', '0 4px 0 var(--hfle-blue)', 'important');
                                e.item.style.setProperty('transform', 'none', 'important');
                                e.item.style.cursor = 'default';
                            } else {
                                e.item.className = "w-full h-full flex items-center justify-center p-0 m-0 border-0 bg-transparent shadow-none";
                            }
                            const img = e.item.querySelector('img'); if(img) img.className = "w-full h-full object-contain pointer-events-none";
                            e.item.removeAttribute('draggable');
                            e.target.innerHTML = '';
                            e.target.appendChild(e.item);
                            e.target.style.border = "none";
                            e.target.style.backgroundColor = "transparent";
                            playSound('global_ok');

                            const remainingPool = Array.from(pool.children).filter(child => !child.classList.contains('sortable-ghost'));
                            if (remainingPool.length === 0) {
                                setTimeout(() => showEndScreen(), 1500);
                            }
                        } else {
                            errorTracker[0]++; 
                            playSound('global_ko');
                            e.item.classList.add('shake-error');
                            setTimeout(() => {
                                e.item.classList.remove('shake-error');
                                pool.appendChild(e.item);
                            }, 500);
                        }
                    }
                });
            }
        });
        return;
    }

    const target = document.getElementById('target');
    if(!target) return;
    
    if (mode === 'anagramme' || mode === 'sentence_ordering') {
        new Sortable(target, { animation: 150, ghostClass: 'opacity-50', onStart: () => playSound('drag'), onEnd: () => playSound('drop') });
        return;
    }

    if(!pool) return;
    new Sortable(pool, { group: 'game', sort: false, animation: 150, onStart: () => playSound('drag'), onEnd: () => playSound('drop') });
    new Sortable(target, { 
        group: 'game', animation: 150, onStart: () => playSound('drag'),
        onAdd: (e) => {
            const dropped = e.item.getAttribute('data-word') || e.item.getAttribute('data-letter') || e.item.getAttribute('data-chunk');
            
            if(mode === 'rebus') {
                const targetAns = e.target.getAttribute('data-ans');
                if(dropped.toLowerCase() === targetAns.toLowerCase()) {
                    e.item.className = "w-full h-full flex items-center justify-center text-xl font-black bg-transparent border-none shadow-none text-blue-800 m-0 p-0 font-mont uppercase";
                    e.target.style.border = "none"; e.target.style.background = "transparent"; validate(true);
                } else {
                    e.item.classList.add('shake-error');
                    setTimeout(() => { e.item.classList.remove('shake-error'); pool.appendChild(e.item); }, 500);
                    validate(false);
                }
            } else { e.item.remove(); validate(false); }
        }
    });
}

function validate(correct) {
    const type = getCurrentType();
    const itemsArr = getCurrentItems();
    
    if(correct) { 
        status[curStep]='completed'; playSound('global_ok'); 
        setTimeout(() => { 
            if (['domino','autocollantes','crossword','dressing'].includes(type) || curStep >= itemsArr.length - 1) showEndScreen(); 
            else loadStep(curStep + 1); 
        }, 1500); 
    } else { 
        status[curStep]='error'; 
        if(!['domino','autocollantes','dressing'].includes(type)) errorTracker[curStep]++; 
        playSound('global_ko'); 
    } 
    renderNav(); 
}

function renderNav() { 
    const type = getCurrentType();
    const itemsArr = getCurrentItems();
    if(['crossword','domino','dressing'].includes(type)) { document.getElementById('nav-step').innerHTML = ''; return; }
    document.getElementById('nav-step').innerHTML = itemsArr.map((_, i) => `<div class="nav-square ${i===curStep?'active':''} ${status[i] || ''}" onclick="loadStep(${i})">${i+1}</div>`).join(''); 
}

function switchLvl(l) { 
    curLvl = l; 
    document.getElementById('btn-f-view').className = l==='facile' ? 'px-5 py-2 rounded-full text-xs font-black bg-[#2753F4] text-white shadow-sm transition uppercase tracking-wide' : 'px-5 py-2 rounded-full text-xs font-black text-[#2753F4] hover:bg-blue-100 transition uppercase tracking-wide bg-transparent';
    document.getElementById('btn-d-view').className = l==='difficile' ? 'px-5 py-2 rounded-full text-xs font-black bg-[#2753F4] text-white shadow-sm transition uppercase tracking-wide' : 'px-5 py-2 rounded-full text-xs font-black text-[#2753F4] hover:bg-blue-100 transition uppercase tracking-wide bg-transparent';
    if (isPlayerMode()) syncPlayerConfig(); else initGame();
    startGame();
}

function pickImg(k) { activeKey = k; document.getElementById('imgInp').click(); }
function pickAud(k) { activeKey = k; document.getElementById('audInp').click(); }
function handleImg(e) { if(!e.target.files[0]) return; const r = new FileReader(); r.onload=(ev)=>{ dbImg[activeKey]=ev.target.result; if(activeKey==='mapper_bg'){ const p = document.getElementById('mapper-preview'); if(p) { p.src=ev.target.result; p.classList.remove('hidden'); } const h = document.getElementById('mapper-hint'); if(h) h.classList.add('hidden'); } loadStep(curStep); }; r.readAsDataURL(e.target.files[0]); e.target.value = ''; }
function handleAud(e) { if(!e.target.files[0]) return; const r = new FileReader(); r.onload=(ev)=>{dbAud[activeKey]=ev.target.result; loadStep(curStep); alert("Audio Salvato!");}; r.readAsDataURL(e.target.files[0]); e.target.value = ''; }

function playConsigne() { 
    const key = curLvl === 'facile' ? 'aud-f' : 'aud-d'; 
    const audioSrc = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.audio[key] : dbAud[key];
    if(audioSrc) new Audio(audioSrc).play(); 
    else { 
        const consigneText = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.levels[curLvl].consigne : (document.getElementById(curLvl === 'facile' ? 'con-f' : 'con-d').value.trim() !== '' ? document.getElementById(curLvl === 'facile' ? 'con-f' : 'con-d').value : document.getElementById(curLvl === 'facile' ? 'con-f' : 'con-d').placeholder);
        const m = new SpeechSynthesisUtterance(consigneText); m.lang='fr-FR'; m.rate=0.6; window.speechSynthesis.speak(m); 
    } 
}
/* --- EXPORT JSZIP --- */
async function exportToZIP() {
    const typeF = document.getElementById('type-f').value; 
    const typeD = document.getElementById('type-d').value;
    
    const listF = document.getElementById('items-list-f');
    const itemsFRaw = listF.value.trim() !== '' ? listF.value : listF.placeholder;
    const itemsF = itemsFRaw.split(';').map(i=>i.trim()).filter(i=>i);

    const listD = document.getElementById('items-list-d');
    const itemsDRaw = listD.value.trim() !== '' ? listD.value : listD.placeholder;
    const itemsD = itemsDRaw.split(';').map(i=>i.trim()).filter(i=>i);

    if(itemsF.length === 0 && typeF !== 'crossword' && typeD !== 'crossword') { alert("Dati mancanti!"); return; }
    const zip = new JSZip(); 
    const assetsFolder = zip.folder("assets"); 
    const jsFolder = zip.folder("js");

    try {
        const [coreResp, styleResp] = await Promise.all([fetch('core.js'), fetch('style.css')]);
        if (!coreResp.ok || !styleResp.ok) throw new Error('Impossibile leggere core.js o style.css');
        jsFolder.file('core.js', await coreResp.text());
        zip.file('style.css', await styleResp.text());
    } catch (err) {
        console.error(err);
        alert('Export interrotto: avvia il configuratore tramite un web server (http/https), non direttamente con file://, così posso includere core.js e style.css nello ZIP.');
        return;
    }

    function dataURLtoBlob(url) { 
        let arr = url.split(','), mime = arr[0].match(/:(.*?);/)[1]; 
        let bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n); 
        while(n--){ u8arr[n] = bstr.charCodeAt(n); } 
        return new Blob([u8arr], {type:mime}); 
    }

    let expImg = {}; 
    for(let k in dbImg) { 
        if(!dbImg[k]) continue; 
        let ext = dbImg[k].match(/data:image\/(.*);base64/)[1]; 
        let name = `${k.replace(/[^a-z0-9_]/gi,'_')}.${ext}`; 
        assetsFolder.file(name, dataURLtoBlob(dbImg[k])); 
        expImg[k] = `assets/${name}`; 
    }

    let expAud = {}; 
    for(let k in dbAud) { 
        if(!dbAud[k]) continue; 
        let ext = dbAud[k].includes('mpeg') ? 'mp3' : 'wav'; 
        let name = `${k.replace(/[^a-z0-9_]/gi,'_')}.${ext}`; 
        assetsFolder.file(name, dataURLtoBlob(dbAud[k])); 
        expAud[k] = `assets/${name}`; 
    }

    const gameConfig = { 
        unite: document.getElementById('in-unite').value || '1', 
        uniteColor: document.getElementById('in-color').value || '#E84C7B',
        showLecon: document.getElementById('in-show-lecon').checked,
        lecon: document.getElementById('in-lecon').value || '1',
        titre: document.getElementById('in-titre').value || 'Jeu', 
        cwVerbLabel: cwVerbLabel,
        cwShowClues: cwShowClues,
        mappedZones: mappedZones, cwData: cwData, cwClues: cwClues, rebusData: rebusData, autocollantesData: autocollantesData, 
        images: expImg, audio: expAud, 
        levels: { 
            facile: { type: typeF, consigne: document.getElementById('con-f').value, items: itemsF }, 
            difficile: { type: typeD, consigne: document.getElementById('con-d').value, items: itemsD } 
        } 
    };

    jsFolder.file("config.js", `const GAME_CONFIG = ${JSON.stringify(gameConfig, null, 2)};`);

    let playerHTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>bSmart | ${gameConfig.titre}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;900&family=Source+Sans+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script src="js/config.js"></script>
<script src="js/core.js" defer></script>
</head>
<body class="p-2 md:p-4 flex justify-center items-center min-h-screen">
<div class="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-[750px] relative border border-gray-200">
    <div id="start-screen" class="absolute inset-0 bg-blue-600 flex flex-col items-center justify-center z-50 text-white p-6">
        <h2 class="text-2xl md:text-3xl font-bold mb-2 tracking-widest uppercase font-mont">Unité <span id="start-unite"></span></h2>
        <h1 id="start-titre" class="text-4xl md:text-6xl font-black mb-12 text-center drop-shadow-lg font-mont leading-tight break-words px-4"></h1>
        <button onclick="startGame()" class="bg-orange-500 hover:bg-orange-600 text-white font-black py-4 px-12 rounded-full text-2xl shadow-2xl transform transition hover:scale-105 border-4 border-orange-400 font-mont uppercase">COMMENCER</button>
    </div>
    <div id="end-screen" class="absolute inset-0 bg-white flex flex-col items-center justify-center z-50 hidden p-6 text-center overflow-y-auto">
        <div class="flex flex-col md:flex-row items-center justify-center gap-10 mb-8 w-full max-w-3xl">
            <div class="relative flex items-center justify-center w-48 h-48 md:w-64 md:h-64" id="visual-container"></div>
            <div class="flex flex-col items-center md:items-start w-full max-w-sm">
                <h1 class="text-2xl font-black text-[#EFA92C] mb-3 uppercase font-mont tracking-wide">Mon score est...</h1>
                <div class="flex items-center gap-4 w-full mb-8">
                    <div class="w-full h-8 bg-white border-2 border-[#EFA92C] rounded-full overflow-hidden shadow-inner p-1"><div id="score-bar" class="h-full bg-[#EFA92C] rounded-full transition-all duration-1000 ease-out w-0"></div></div>
                    <span id="score-text" class="text-xl font-bold text-gray-800 w-12 text-left">0%</span>
                </div>
                <div class="flex flex-col sm:flex-row gap-6">
                    <button onclick="startGame()" class="font-bold text-gray-800">↺ Je rejoue</button>
                    <button onclick="document.getElementById('end-score').classList.toggle('hidden')" class="font-bold text-gray-800">💡 Les solutions</button>
                </div>
            </div>
        </div>
        <div id="end-score" class="w-full max-w-4xl flex flex-col items-center hidden mt-2"></div>
    </div>
    <div class="header-wrapper flex flex-col md:flex-row items-center justify-between p-4 md:px-8 border-b border-gray-100 relative gap-4">
        <div class="flex flex-col items-center md:items-start z-10 shrink-0">
            <div class="unit-badge" id="res-badge"><span class="unit-badge-text">Unité</span><span id="res-unite" class="unit-badge-num"></span></div>
            <div id="res-lecon-wrapper" class="lecon-ribbon">LEÇON <span id="res-lecon">1</span></div>
        </div>
        <div class="flex-grow flex justify-center z-10 px-2 md:px-6">
            <h1 id="res-titre" class="h-titre text-2xl md:text-3xl lg:text-4xl text-center leading-tight break-words"></h1>
        </div>
        <div class="flex items-center gap-3 z-10 shrink-0">
            <div class="flex bg-[#E6F0FD] rounded-full p-1 shadow-inner border border-blue-100">
                <button id="btn-f-view" onclick="switchLvl('facile')" class="px-5 py-2 rounded-full text-xs font-black bg-[#2753F4] text-white shadow-sm transition uppercase tracking-wide">FACILE</button>
                <button id="btn-d-view" onclick="switchLvl('difficile')" class="px-5 py-2 rounded-full text-xs font-black text-[#2753F4] hover:bg-blue-100 transition uppercase tracking-wide bg-transparent">DIFFICILE</button>
            </div>
            <button id="mute-btn" onclick="toggleMute()" class="w-10 h-10 min-w-[40px] bg-white rounded-full flex items-center justify-center shadow-md border border-gray-200"><span id="mute-icon">🔊</span></button>
        </div>
    </div>
    <div class="p-6 md:p-10 flex-grow flex flex-col items-center w-full bg-slate-50">
        <div class="flex items-center gap-4 mb-8 bg-white px-8 py-3 rounded-full shadow-sm border border-gray-100 w-fit max-w-full">
            <button onclick="playConsigne()" class="w-12 h-12 flex items-center justify-center rounded-full bg-pink-500 text-white text-2xl pl-1 border-b-[5px] border-pink-700 hover:bg-pink-400 active:border-b-0 active:translate-y-[5px] transition-all shrink-0 outline-none shadow-sm">▶</button>
            <p id="res-consigne" class="text-gray-800 font-bold text-lg md:text-xl font-mont"></p>
        </div>
        <div id="main-content" class="w-full flex flex-col items-center gap-10 overflow-hidden text-center"></div>
        <div id="pool" class="mt-auto pt-8 w-full flex flex-wrap justify-center gap-4"></div>
    </div>
    <div id="nav-step" class="striped-footer flex justify-center gap-3 flex-wrap mt-auto"></div>
</div>
</body>
</html>`;

    zip.file("index.html", playerHTML);
    const customName = document.getElementById('in-filename') ? document.getElementById('in-filename').value.trim() : '';
    const finalName = (customName !== '' ? customName : `bSmart_${gameConfig.titre}`).replace(/[^a-z0-9_\-]+/gi, '_');
    zip.generateAsync({type:"blob"}).then(c => saveAs(c, `${finalName}.zip`));
}
