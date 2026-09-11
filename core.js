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
    if (audioSrc) { let a = new Audio(audioSrc); a.play().catch(e => console.warn(e)); return; }
    
    if (!window.audioCtx) { const AudioContext = window.AudioContext || window.webkitAudioContext; if(!AudioContext) return; window.audioCtx = new AudioContext(); }
    if (window.audioCtx.state === 'suspended') window.audioCtx.resume();
    const now = window.audioCtx.currentTime;
    
    const playTone = (freq, wave, time, dur, vol) => {
        const osc = window.audioCtx.createOscillator(); const gain = window.audioCtx.createGain();
        osc.type = wave; osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain); gain.connect(window.audioCtx.destination);
        osc.start(time); osc.stop(time + dur);
    };

    if (type === 'drag') { playTone(600, 'sine', now, 0.15, 0.1); } 
    else if (type === 'drop') { playTone(400, 'sine', now, 0.15, 0.1); } 
    else if (type === 'global_ok') { playTone(523.25, 'sine', now, 0.3, 0.15); playTone(659.25, 'sine', now + 0.1, 0.4, 0.15); } 
    else if (type === 'global_ko') { playTone(200, 'triangle', now, 0.4, 0.15); } 
    else if (type === 'report_high') { playTone(523.25, 'sine', now, 0.2, 0.15); playTone(659.25, 'sine', now + 0.15, 0.2, 0.15); playTone(783.99, 'sine', now + 0.3, 0.6, 0.15); } 
    else if (type === 'report_low') { playTone(329.63, 'triangle', now, 0.3, 0.15); playTone(311.13, 'triangle', now + 0.3, 0.3, 0.15); playTone(293.66, 'triangle', now + 0.6, 0.6, 0.15); }
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
    let cluesHtml = `<h4 class="font-bold text-blue-900 border-b pb-2 mb-3">Definizioni</h4><div class="grid grid-cols-2 gap-4">`;
    words.sort((a,b) => a.num - b.num).forEach(w => { let label = w.dir === 'h' ? 'Orizzontale' : 'Verticale'; let prevClue = cwClues.find(c => c.word === w.word && c.dir === w.dir)?.clue || ""; cluesHtml += `<div><label class="text-xs font-bold text-gray-700 block">${w.num}. ${label} (${w.word})</label><input type="text" class="cw-clue-input w-full border border-gray-300 rounded p-2 text-xs" data-word="${w.word.replace(/"/g, '&quot;')}" data-num="${w.num}" data-dir="${w.dir}" value="${prevClue.replace(/"/g, '&quot;')}"></div>`; });
    cluesHtml += `</div>`; document.getElementById('cw-clues-container').innerHTML = cluesHtml; document.getElementById('cw-clues-container').classList.remove('hidden');
}
function closeCWBuilder() {
    cwData = []; cwClues = [];
    cwVerbLabel = document.getElementById('cw-in-verb') ? document.getElementById('cw-in-verb').value : "";
    cwShowClues = document.getElementById('cw-in-show-clues') ? document.getElementById('cw-in-show-clues').checked : true;
    document.querySelectorAll('.cw-cell').forEach(inp => { if(inp.value.trim() !== '') { let numSpan = inp.parentElement.querySelector('.cw-number'); cwData.push({ x: parseInt(inp.dataset.x), y: parseInt(inp.dataset.y), char: inp.value.toUpperCase(), num: numSpan ? parseInt(numSpan.innerText) : null }); } });
    document.querySelectorAll('.cw-clue-input').forEach(inp => { cwClues.push({ num: parseInt(inp.dataset.num), dir: inp.dataset.dir, word: inp.dataset.word, clue: inp.value || inp.dataset.word }); });
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
    if(type === 'domino' || type === 'autocollantes' || type === 'dressing' || type === 'crossword') errorTracker = [0]; 
    else errorTracker = new Array(items.length).fill(0);
    loadStep(0);
}

function showEndScreen() {
    document.getElementById('end-screen').classList.remove('hidden');
    const type = getCurrentType();
    
    let errs = errorTracker.reduce((a, b) => a + b, 0);
    let scorePerc = Math.max(0, 100 - (errs * 10));

    let answersHtml = '<div class="w-full mt-4"><h3 class="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Les solutions</h3><ul class="text-left bg-white p-4 rounded-xl border border-gray-200 max-h-48 overflow-y-auto custom-scrollbar">';
    if (type === 'crossword') {
        cwClues.forEach(c => { let dirLabel = c.dir === 'h' ? 'Horizontal' : 'Vertical'; answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 text-sm"><b>${c.num}. ${dirLabel} :</b> ${c.word}</li>`; });
    } else if (type === 'domino') {
        answersHtml += `<li class="text-blue-800 font-bold text-sm leading-relaxed">${items.join(' <span class="text-orange-500">➔</span> ')}</li>`;
    } else if (type === 'sentence_ordering' || type === 'anagramme') {
        items.forEach(it => {
            let correctSentence = type === 'sentence_ordering' ? it.split('/').map(w => w.trim()).join(' ') : it;
            answersHtml += `<li class="text-blue-800 border-b border-gray-50 py-2 text-sm">${correctSentence}</li>`;
        });
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
    
    if (visualContainer) {
        if (scorePerc >= 50 && imgHigh) {
            visualContainer.innerHTML = `<img src="${imgHigh}" class="w-full h-full object-contain drop-shadow-xl scale-125">`;
        } else if (scorePerc < 50 && imgLow) {
            visualContainer.innerHTML = `<img src="${imgLow}" class="w-full h-full object-contain drop-shadow-xl scale-125">`;
        } else {
            let mascotFace = scorePerc >= 80 ? '🤩' : (scorePerc >= 50 ? '😊' : '👦🏼');
            let mascotText = scorePerc >= 80 ? 'Bravo !' : (scorePerc >= 50 ? 'Bien<br>joué !' : 'Essaie<br>encore !');
            visualContainer.innerHTML = `<div id="score-bubble" class="absolute -top-6 -left-12 bg-[#FDE073] text-[#0169B3] font-black text-xl md:text-3xl px-6 py-4 rounded-[40px] rounded-br-none shadow-md transform -rotate-6 z-10 font-mont leading-tight">${mascotText}</div><div class="w-40 h-40 md:w-56 md:h-56 bg-slate-100 rounded-full border-4 border-white shadow-inner flex items-center justify-center text-7xl md:text-9xl" id="score-mascot">${mascotFace}</div>`;
        }
    }
    
    if (scorePerc >= 50) playSound('report_high'); else playSound('report_low');
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
            }, 500);
        } else {
            inputEl.classList.add('correct');
            playSound('drop');
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

function checkOrder(mode) {
    const target = document.getElementById('target');
    const targetWord = items[curStep];
    let isCorrect = false;

    if (mode === 'anagramme') {
        const current = Array.from(target.children).map(el=>el.getAttribute('data-letter')).join('');
        isCorrect = (current === targetWord);
    } else if (mode === 'sentence_ordering') {
        const expectedStr = targetWord.split('/').map(c=>c.trim()).join('');
        const currentStr = Array.from(target.children).map(el=>el.getAttribute('data-chunk')).join('');
        isCorrect = (currentStr === expectedStr);
    }

    if (isCorrect) {
        Array.from(target.children).forEach(el => {
            if(mode === 'anagramme') el.className = "w-10 h-10 flex items-center justify-center text-2xl font-black bg-transparent border-none shadow-none text-blue-900 m-0 p-0 font-mont";
            else el.className = "px-2 py-1 text-2xl md:text-3xl font-black bg-transparent border-none shadow-none text-blue-900 m-0 font-mont";
        });
        target.style.border = "none"; target.style.background = "transparent";
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
        
        let gridHtml = '<div class="grid gap-1 p-6 bg-white rounded-2xl shadow-sm border border-gray-200" style="grid-template-columns: repeat(12, 40px);">';
        for(let y=0; y<12; y++) {
            for(let x=0; x<12; x++) {
                let cell = cwData.find(c => c.x === x && c.y === y);
                if(cell) gridHtml += `<div class="cw-play-wrapper"><span class="cw-number">${cell.num || ''}</span><input type="text" maxlength="1" class="cw-play-cell font-mont" data-ans="${cell.char}" oninput="checkCrossword(this)"></div>`;
                else gridHtml += `<div class="w-10 h-10"></div>`;
            }
        }
        gridHtml += '</div>';
        
        let cluesHtml = (cwShowClues && cwClues.length > 0) ? `<div class="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mt-6"><h3 class="font-black text-blue-900 border-b border-gray-100 pb-2 mb-4 uppercase font-mont">Définitions</h3><div class="flex flex-col md:flex-row flex-wrap gap-4 text-sm text-gray-700">` + cwClues.map(c => `<div class="w-full md:w-[45%] bg-slate-50 p-3 rounded-lg"><b class="text-blue-800">${c.num}. ${c.dir === 'h' ? 'Horizontal' : 'Vertical'} :</b> ${c.clue}</div>`).join('') + `</div></div>` : '';
        
        stage.innerHTML = `<div class="flex flex-col items-center w-full">${labelHtml}${gridHtml}${cluesHtml}</div>`;
        document.getElementById('nav-step').innerHTML = ''; return;
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
        let boardHtml = '<div class="w-full flex flex-wrap justify-center gap-6 p-4">';
        items.forEach(it => {
            const shadowImg = dbImg[it + '_shadow'] ? `<img src="${dbImg[it + '_shadow']}" class="w-full h-full object-contain pointer-events-none opacity-40">` : `<span class="text-[10px] text-gray-400 font-bold uppercase text-center">📷 Ombre<br>${it}</span>`;
            boardHtml += `<div id="target-${it}" class="w-32 h-32 md:w-40 md:h-40 border-4 border-dashed border-gray-300 rounded-2xl flex items-center justify-center bg-white cursor-pointer relative transition-all" onclick="pickImg('${it.replace(/'/g, "\\'")}_shadow')" data-expected="${it.replace(/"/g, '&quot;')}">${shadowImg}</div>`;
        });
        boardHtml += '</div>';
        stage.insertAdjacentHTML('beforeend', boardHtml);

        const shuffled = [...items].sort(()=>Math.random()-0.5);
        pool.innerHTML = shuffled.map(it => {
            const stickerImg = dbImg[it] ? `<img src="${dbImg[it]}" class="w-full h-full object-contain pointer-events-none">` : `<span class="text-[10px] text-gray-500 font-bold uppercase text-center">📷 Sticker<br>${it}</span>`;
            return `<div class="w-24 h-24 md:w-32 md:h-32 bg-white border-2 border-gray-200 rounded-xl shadow-md cursor-grab p-2 flex items-center justify-center transition-all hover:border-blue-400" data-word="${it.replace(/"/g, '&quot;')}" onclick="pickImg('${it.replace(/'/g, "\\'")}')">${stickerImg}</div>`;
        }).join('');

        document.getElementById('nav-step').innerHTML = '';
        setupSortable('autocollantes', null);
    }
    else if(type === 'dressing') {
        const getImg = (key) => (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images[key] : dbImg[key];
        const bgImage = getImg('mapper_bg');
        const bg = bgImage ? `<img src="${bgImage}" class="absolute inset-0 w-full h-full object-cover">` : `<div class="p-10 text-gray-400">Nessuno Sfondo</div>`;
        
        let zonesHtml = '';
        const zoneList = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.mappedZones : mappedZones;
        
        zoneList.forEach(z => {
            const boxStyle = 'border-2 border-dashed border-orange-400 bg-orange-100/50 shadow-sm';
            let targetDiv = `<div id="target-${z.word}" data-expected="${z.word.replace(/"/g, '&quot;')}" class="flex-grow h-full rounded-xl flex items-center justify-center transition-all duration-300 ${boxStyle}"></div>`;
            let labelHtml = '';

            if (z.label) {
                if (z.label.includes('...')) {
                    const parts = z.label.split('...');
                    labelHtml = `<span class="text-xl md:text-3xl font-black text-white drop-shadow-md whitespace-nowrap font-mont" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${parts[0].trim()}</span>` + 
                                targetDiv + 
                                `<span class="text-xl md:text-3xl font-black text-white drop-shadow-md whitespace-nowrap font-mont" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${parts[1].trim()}</span>`;
                } else {
                    labelHtml = `<span class="text-xl md:text-3xl font-black text-white drop-shadow-md whitespace-nowrap font-mont" style="text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${z.label.trim()}</span>` + targetDiv;
                }
            } else {
                labelHtml = targetDiv;
            }

            zonesHtml += `<div class="absolute flex items-center gap-3" style="left:${z.left}; top:${z.top}; width:${z.width}; height:${z.height}">${labelHtml}</div>`;
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

        // Desktop/tablet: percorso ad anello sul perimetro di una griglia a 3 colonne.
        // Mobile: serpentina compatta a 2 colonne, per mantenere le tessere leggibili.
        function buildDesktopDominoPath(count) {
            if (count <= 0) return [];
            const cols = Math.min(3, Math.max(1, count));
            if (count <= cols) return Array.from({length: count}, (_, i) => ({x:i, y:0, o:'h'}));

            const rows = Math.max(3, Math.ceil((count - 2) / 2));
            const path = [];
            for (let x = 0; x < cols; x++) path.push({x, y:0, o:'h'});
            for (let y = 1; y < rows; y++) path.push({x:cols-1, y, o:'v'});
            for (let x = cols - 2; x >= 0; x--) path.push({x, y:rows-1, o:x === 0 ? 'v' : 'h'});
            for (let y = rows - 2; y >= 1; y--) path.push({x:0, y, o:'v'});
            return path.slice(0, count);
        }

        function buildMobileDominoPath(count) {
            if (count <= 0) return [];
            const path = [];
            let x = 0, y = 0, dir = 1;
            while (path.length < count) {
                // Coppia orizzontale.
                path.push({x, y, o:'h'});
                if (path.length >= count) break;
                x = dir > 0 ? 1 : 0;
                path.push({x, y, o:'h'});
                if (path.length >= count) break;

                // Due passi verticali prima della prossima coppia orizzontale.
                y += 1;
                path.push({x, y, o:'v'});
                if (path.length >= count) break;
                y += 1;
                path.push({x, y, o:'v'});
                if (path.length >= count) break;

                dir *= -1;
                x = dir > 0 ? 0 : 1;
            }
            return path.slice(0, count);
        }

        function pathDirection(a, b) {
            if (!a || !b) return '';
            if (b.x === a.x + 1 && b.y === a.y) return 'right';
            if (b.x === a.x - 1 && b.y === a.y) return 'left';
            if (b.y === a.y + 1 && b.x === a.x) return 'down';
            if (b.y === a.y - 1 && b.x === a.x) return 'up';
            return '';
        }

        // L'immagine di ogni tessera rappresenta la parola della tessera precedente.
        // Per questo deve stare sul lato da cui arriva la catena: sinistra/destra/sopra/sotto.
        function entrySide(prev, current, fallbackOrientation) {
            const dir = pathDirection(prev, current);
            if (dir === 'right') return 'left';
            if (dir === 'left') return 'right';
            if (dir === 'down') return 'top';
            if (dir === 'up') return 'bottom';
            return fallbackOrientation === 'v' ? 'top' : 'left';
        }

        const desktopPath = buildDesktopDominoPath(items.length);
        const mobilePath = buildMobileDominoPath(items.length);

        // Oltre all'orientamento, allineiamo geometricamente le due META' che devono
        // combaciare quando il percorso gira: la parola della tessera precedente e
        // l'immagine della tessera successiva. Lo shift viene propagato lungo il lato
        // del circuito, cosi' non si perde l'allineamento dopo una curva.
        function dominoAnchorOffsets(orientation, entry, mobile = false) {
            if (mobile) {
                if (orientation === 'h') {
                    // 140px: immagine 46%, testo 54%
                    return entry === 'right'
                        ? {entry:{x: 37.8, y:0}, exit:{x:-32.2, y:0}}
                        : {entry:{x:-37.8, y:0}, exit:{x: 32.2, y:0}};
                }
                // 122px: immagine 54%, testo 46%
                return entry === 'bottom'
                    ? {entry:{x:0, y: 28.1}, exit:{x:0, y:-32.9}}
                    : {entry:{x:0, y:-28.1}, exit:{x:0, y: 32.9}};
            }

            if (orientation === 'h') {
                // 205px: immagine 48%, testo 52%
                return entry === 'right'
                    ? {entry:{x: 53.3, y:0}, exit:{x:-49.2, y:0}}
                    : {entry:{x:-53.3, y:0}, exit:{x: 49.2, y:0}};
            }
            // 140px: immagine 55%, testo 45%
            return entry === 'bottom'
                ? {entry:{x:0, y: 31.5}, exit:{x:0, y:-38.5}}
                : {entry:{x:0, y:-31.5}, exit:{x:0, y: 38.5}};
        }

        function computeDominoShifts(path, mobile = false) {
            if (!path.length) return [];
            const entries = path.map((p, i) => {
                const prev = i > 0 ? path[i-1] : null;
                return entrySide(prev, p, p.o);
            });
            const shifts = [{x:0, y:0}];
            for (let i = 1; i < path.length; i++) {
                const prev = path[i-1], curr = path[i];
                const dir = pathDirection(prev, curr);
                const prevA = dominoAnchorOffsets(prev.o, entries[i-1], mobile);
                const currA = dominoAnchorOffsets(curr.o, entries[i], mobile);
                const s = {x: shifts[i-1].x, y: shifts[i-1].y};

                // In un movimento verticale deve coincidere la X delle due meta'.
                if (dir === 'down' || dir === 'up') {
                    s.x = shifts[i-1].x + prevA.exit.x - currA.entry.x;
                }
                // In un movimento orizzontale deve coincidere la Y delle due meta'.
                if (dir === 'right' || dir === 'left') {
                    s.y = shifts[i-1].y + prevA.exit.y - currA.entry.y;
                }
                shifts.push(s);
            }
            return shifts;
        }

        const desktopShifts = computeDominoShifts(desktopPath, false);
        const mobileShifts = computeDominoShifts(mobilePath, true);
        const dCols = desktopPath.length ? Math.max(...desktopPath.map(p => p.x)) + 1 : 1;
        const dRows = desktopPath.length ? Math.max(...desktopPath.map(p => p.y)) + 1 : 1;
        const mCols = mobilePath.length ? Math.max(...mobilePath.map(p => p.x)) + 1 : 1;
        const mRows = mobilePath.length ? Math.max(...mobilePath.map(p => p.y)) + 1 : 1;

        let dominoChainHtml = `<div class="domino-chain" id="domino-board" style="--d-cols:${dCols}; --d-rows:${dRows}; --m-cols:${mCols}; --m-rows:${mRows};">`;

        items.forEach((w, i) => {
            const d = desktopPath[i];
            const m = mobilePath[i];
            const dNext = i < items.length - 1 ? pathDirection(d, desktopPath[i+1]) : pathDirection(d, desktopPath[0]);
            const mNext = i < items.length - 1 ? pathDirection(m, mobilePath[i+1]) : '';

            const dPrev = i > 0 ? desktopPath[i-1] : (pathDirection(desktopPath[desktopPath.length - 1], d) ? desktopPath[desktopPath.length - 1] : null);
            const mPrev = i > 0 ? mobilePath[i-1] : null;
            const dEntry = entrySide(dPrev, d, d.o);
            const mEntry = entrySide(mPrev, m, m.o);

            const dClose = i === items.length - 1 && dNext ? ' domino-closes-loop' : '';
            const slotClasses = `domino-slot orient-d-${d.o} orient-m-${m.o} entry-d-${dEntry} entry-m-${mEntry} next-d-${dNext || 'none'} next-m-${mNext || 'none'}${dClose}`;
            const ds = desktopShifts[i] || {x:0,y:0};
            const ms = mobileShifts[i] || {x:0,y:0};
            const slotStyle = `--d-col:${d.x+1}; --d-row:${d.y+1}; --m-col:${m.x+1}; --m-row:${m.y+1}; --d-shift-x:${ds.x.toFixed(1)}px; --d-shift-y:${ds.y.toFixed(1)}px; --m-shift-x:${ms.x.toFixed(1)}px; --m-shift-y:${ms.y.toFixed(1)}px;`;

            if (i === 0) {
                // La prima tessera è già data: è una vera tessera del domino, non un segnaposto.
                const imgNeeded = items[items.length - 1];
                const imgSrc = getImg(imgNeeded);
                const imgContent = imgSrc ? `<img src="${imgSrc}" class="object-contain w-full h-full pointer-events-none">` : `<span class="domino-img-placeholder">📷<br>${imgNeeded}</span>`;
                const imgClick = isPlayerMode() ? '' : ` onclick="pickImg('${imgNeeded.replace(/'/g, "\\'")}')"`;
                dominoChainHtml += `<div class="${slotClasses}" style="${slotStyle}"><div class="domino-tile domino-starter cursor-default"><div class="tile-img"${imgClick}>${imgContent}</div><div class="tile-text">${w}</div></div></div>`;
            } else {
                dominoChainHtml += `<div class="${slotClasses}" style="${slotStyle}"><div id="target-${w}" class="drop-target" data-expected="${w.replace(/"/g, '&quot;')}"></div></div>`;
            }
        });

        dominoChainHtml += `</div>`;
        stage.insertAdjacentHTML('beforeend', `<div class="w-full flex justify-center px-1 md:px-4">${dominoChainHtml}</div>`);

        // La prima tessera è già collocata sul tabellone; nel pool restano le altre.
        const poolItems = items.slice(1).sort(()=>Math.random()-0.5);
        pool.innerHTML = poolItems.map((it) => {
            const i = items.indexOf(it);
            const imgNeeded = items[i-1];
            const imgSrc = getImg(imgNeeded);
            const imgContent = imgSrc ? `<img src="${imgSrc}" class="object-contain w-full h-full pointer-events-none">` : `<span class="domino-img-placeholder">📷<br>${imgNeeded}</span>`;
            const imgClick = isPlayerMode() ? '' : ` onclick="pickImg('${imgNeeded.replace(/'/g, "\\'")}')"`;
            return `<div class="domino-tile domino-pool-tile shadow-lg hover:shadow-xl transition cursor-grab" data-word="${it.replace(/"/g, '&quot;')}"><div class="tile-img"${imgClick}>${imgContent}</div><div class="tile-text">${it}</div></div>`;
        }).join('');

        document.getElementById('nav-step').innerHTML = '';
        setupSortable('domino', null);
    }
    else if(type === 'anagramme') {
        const shuffled = word.split('').sort(()=>Math.random()-0.5);
        const imgContent = dbImg[word] ? `<img src="${dbImg[word]}" class="h-full w-full object-contain pointer-events-none">` : '📷 Foto';
        stage.insertAdjacentHTML('beforeend', `<div class="flex flex-col items-center gap-8">
            <div class="w-40 h-40 border-4 border-white rounded-2xl overflow-hidden bg-white shadow-lg flex justify-center items-center cursor-pointer" onclick="pickImg('${word.replace(/'/g, "\\'")}')">${imgContent}</div>
            <div id="target" class="flex gap-2 min-h-[60px] min-w-[300px] items-center justify-center p-4 bg-white rounded-xl shadow-inner border-2 border-gray-200">` 
                + shuffled.map(l => `<div class="letter-tile text-xl shadow-md cursor-grab" data-letter="${l.replace(/"/g, '&quot;')}">${l.toLowerCase()}</div>`).join('') + 
            `</div>
            <button id="check-btn" onclick="checkOrder('anagramme')" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-md transition transform hover:scale-105 font-mont uppercase">Vérifier</button>
        </div>`);
        pool.innerHTML = '';
        setupSortable('anagramme', word);
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
        const targetWords = mode === 'domino' ? itemArray.slice(1) : (mode === 'autocollantes' ? itemArray : zoneList.map(z => z.word));

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
                                e.item.className = "w-full h-full flex items-center justify-center p-0 m-0 border-0 bg-transparent shadow-none font-black text-2xl md:text-3xl text-white drop-shadow-md font-mont uppercase";
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
    if(['crossword','domino','autocollantes','dressing'].includes(type)) { document.getElementById('nav-step').innerHTML = ''; return; }
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
        mappedZones: mappedZones, cwData: cwData, cwClues: cwClues, rebusData: rebusData, 
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
        <div id="end-score" class="w-full max-w-md flex flex-col items-center hidden mt-2"></div>
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
