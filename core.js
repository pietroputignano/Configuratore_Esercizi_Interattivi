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
    document.querySelectorAll('.type-sel').forEach(s => { s.innerHTML = types.map(t=>`${t.n}`).join(''); });
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
        html += `
Parola: ${word}
`;
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
    z.innerHTML = `
                   
                   
`;
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
function buildCWGrid() { let html = ''; for(let y=0; y<12; y++) { for(let x=0; x<12; x++) { html += `
`; } } document.getElementById('cw-builder-grid').innerHTML = html; }
function findCWWords() {
    let grid = []; for(let y=0; y<12; y++) { grid[y] = []; for(let x=0; x<12; x++) { grid[y][x] = document.querySelector(`.cw-cell[data-x="${x}"][data-y="${y}"]`).value.trim().toUpperCase(); } }
    let words = []; let counter = 1;
    for(let y=0; y<12; y++) { let currWord = ""; let startX = -1; for(let x=0; x<=12; x++) { if(x<12 && grid[y][x]) { if(currWord === "") startX = x; currWord += grid[y][x]; } else { if(currWord.length > 1) words.push({ word: currWord, x: startX, y: y, dir: 'h' }); currWord = ""; } } }
    for(let x=0; x<12; x++) { let currWord = ""; let startY = -1; for(let y=0; y<=12; y++) { if(y<12 && grid[y][x]) { if(currWord === "") startY = y; currWord += grid[y][x]; } else { if(currWord.length > 1) words.push({ word: currWord, x: x, y: startY, dir: 'v' }); currWord = ""; } } }
    if(words.length === 0) return;
    let starts = {}; words.forEach(w => { let key = `${w.x}-${w.y}`; if(!starts[key]) starts[key] = counter++; w.num = starts[key]; });
    document.querySelectorAll('.cw-number').forEach(e => e.remove());
    Object.keys(starts).forEach(key => { let [x,y] = key.split('-'); let cellWrap = document.querySelector(`.cw-cell[data-x="${x}"][data-y="${y}"]`).parentElement; let span = document.createElement('span'); span.className = 'cw-number'; span.innerText = starts[key]; cellWrap.appendChild(span); });
    let cluesHtml = `
Definizioni
`;
    words.sort((a,b) => a.num - b.num).forEach(w => { let label = w.dir === 'h' ? 'Orizzontale' : 'Verticale'; let prevClue = cwClues.find(c => c.word === w.word && c.dir === w.dir)?.clue || ""; cluesHtml += `
${w.num}. ${label} (${w.word})
`; });
    cluesHtml += `
`; document.getElementById('cw-clues-container').innerHTML = cluesHtml; document.getElementById('cw-clues-container').classList.remove('hidden');
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
    const type = curLvl === 'facile' ? document.getElementById('type-f').value : document.getElementById('type-d').value;
    status = new Array(items.length).fill('pending'); 
    if(type === 'domino' || type === 'autocollantes' || type === 'dressing' || type === 'crossword') errorTracker = [0]; 
    else errorTracker = new Array(items.length).fill(0);
    loadStep(0);
}

function showEndScreen() {
    document.getElementById('end-screen').classList.remove('hidden');
    const type = curLvl === 'facile' ? document.getElementById('type-f').value : document.getElementById('type-d').value;
    
    let errs = errorTracker.reduce((a, b) => a + b, 0);
    let scorePerc = Math.max(0, 100 - (errs * 10));

    let answersHtml = '

Les solutions
';
    if (type === 'crossword') {
        cwClues.forEach(c => { let dirLabel = c.dir === 'h' ? 'Horizontal' : 'Vertical'; answersHtml += `
${c.num}. ${dirLabel} : ${c.word}
`; });
    } else if (type === 'domino') {
        answersHtml += `
${items.join(' ➔ ')}
`;
    } else if (type === 'sentence_ordering' || type === 'anagramme') {
        items.forEach(it => {
            let correctSentence = type === 'sentence_ordering' ? it.split('/').map(w => w.trim()).join(' ') : it;
            answersHtml += `
${correctSentence}
`;
        });
    } else if (type === 'rebus') {
        items.forEach(it => {
            let sentence = rebusData[it] || `{${it}}`;
            let solved = sentence.replace(/{([^}]+)}/g, '$1');
            answersHtml += `
${solved}
`;
        });
    } else {
        items.forEach(it => {
            answersHtml += `
${it}
`;
        });
    }
    answersHtml += '
';

    setTimeout(() => {
        document.getElementById('score-bar').style.width = scorePerc + '%';
        document.getElementById('score-text').innerText = scorePerc + '%';
    }, 100);

    const imgHigh = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images['score_high'] : dbImg['score_high'];
    const imgLow = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images['score_low'] : dbImg['score_low'];
    const visualContainer = document.getElementById('visual-container');
    
    if (visualContainer) {
        if (scorePerc >= 50 && imgHigh) {
            visualContainer.innerHTML = ``;
        } else if (scorePerc < 50 && imgLow) {
            visualContainer.innerHTML = ``;
        } else {
            let mascotFace = scorePerc >= 80 ? '🤩' : (scorePerc >= 50 ? '😊' : '👦🏼');
            let mascotText = scorePerc >= 80 ? 'Bravo !' : (scorePerc >= 50 ? 'Bien
joué !' : 'Essaie
encore !');
            visualContainer.innerHTML = `
${mascotText}
${mascotFace}
`;
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
    const type = curLvl === 'facile' ? document.getElementById('type-f').value : document.getElementById('type-d').value;
    
    const conInput = document.getElementById(curLvl === 'facile' ? 'con-f' : 'con-d');
    document.getElementById('res-consigne').innerText = conInput.value.trim() !== '' ? conInput.value : conInput.placeholder;
    
    stage.innerHTML = '';
    pool.innerHTML = '';

    // Generatore del bottone Lettura Completa
    let ttsText = "";
    if (typeof GAME_CONFIG !== 'undefined') { ttsText = GAME_CONFIG.levels[curLvl].ttsContext; } 
    else { ttsText = document.getElementById('tts-context-' + (curLvl === 'facile' ? 'f' : 'd'))?.value; }

    if (ttsText && ttsText.trim() !== '') {
        const safeText = ttsText.replace(/'/g, "\\'").replace(/"/g, '"');
        stage.insertAdjacentHTML('afterbegin', `📢 Écoute Tout`);
    }
    
   if(type === 'crossword') {
        if(cwData.length === 0) { stage.insertAdjacentHTML('beforeend', "
Usa il Costruttore Cruciverba (🧩).
"); return; }
        
        let labelHtml = cwVerbLabel ? `
${cwVerbLabel}
` : '';
        
        let gridHtml = '
';
        for(let y=0; y<12; y++) {
            for(let x=0; x<12; x++) {
                let cell = cwData.find(c => c.x === x && c.y === y);
                if(cell) gridHtml += `
${cell.num || ''}
`;
                else gridHtml += `
`;
            }
        }
        gridHtml += '
';
        
        let cluesHtml = (cwShowClues && cwClues.length > 0) ? `

Définitions
` + cwClues.map(c => `
${c.num}. ${c.dir === 'h' ? 'Horizontal' : 'Vertical'} : ${c.clue}
`).join('') + `
` : '';
        
        stage.insertAdjacentHTML('beforeend', `
${labelHtml}${gridHtml}${cluesHtml}
`);
        document.getElementById('nav-step').innerHTML = ''; return;
    }

    if(items.length === 0) return;
    const word = items[idx];

    let stepAudioHtml = '';
    const stepAudioKey = word + '_audio';
    const audioSrc = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.audio[stepAudioKey] : dbAud[stepAudioKey];
    
    if (audioSrc && type !== 'dressing') {
        stepAudioHtml = `▶ ÉCOUTE`;
    } else if (['sentence_ordering', 'anagramme', 'rebus'].includes(type)) {
        let safeWord = word.replace(/'/g, "\\'").replace(/"/g, '"').replace(/\//g, ' ');
        if (type === 'rebus') {
            const rData = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.rebusData : rebusData;
            safeWord = (rData[word] || word).replace(/[{}]/g, '').replace(/'/g, "\\'");
        }
        stepAudioHtml = `▶ ÉCOUTE`;
    }

    if(type === 'autocollantes') {
        let boardHtml = '
';
        items.forEach(it => {
            const shadowImg = dbImg[it + '_shadow'] ? `` : `📷 Ombre
${it}`;
            boardHtml += `
${shadowImg}
`;
        });
        boardHtml += '
';
        stage.insertAdjacentHTML('beforeend', boardHtml);

        const shuffled = [...items].sort(()=>Math.random()-0.5);
        pool.innerHTML = shuffled.map(it => {
            const stickerImg = dbImg[it] ? `` : `📷 Sticker
${it}`;
            return `
${stickerImg}
`;
        }).join('');

        document.getElementById('nav-step').innerHTML = '';
        setupSortable('autocollantes', null);
    }
    else if(type === 'dressing') {
        const getImg = (key) => (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.images[key] : dbImg[key];
        const bgImage = getImg('mapper_bg');
        const bg = bgImage ? `` : `
Nessuno Sfondo
`;
        
        let zonesHtml = '';
        const zoneList = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.mappedZones : mappedZones;
        
        zoneList.forEach(z => {
            const boxStyle = 'border-2 border-dashed border-orange-400 bg-orange-100/50 shadow-sm';
            let targetDiv = `
`;
            let labelHtml = '';

            if (z.label) {
                if (z.label.includes('...')) {
                    const parts = z.label.split('...');
                    labelHtml = `${parts[0].trim()}` + 
                                targetDiv + 
                                `${parts[1].trim()}`;
                } else {
                    labelHtml = `${z.label.trim()}` + targetDiv;
                }
            } else {
                labelHtml = targetDiv;
            }

            zonesHtml += `
${labelHtml}
`;
        });

        stage.insertAdjacentHTML('beforeend', `
${bg}${zonesHtml}
`);
        
        const shuffled = [...items].sort(()=>Math.random()-0.5);
        pool.innerHTML = shuffled.map(it => {
            const stickerImg = getImg(it);
            if (stickerImg) { return `
`; } 
            else { return `
${it}
`; }
        }).join('');
        document.getElementById('nav-step').innerHTML = ''; setupSortable('dressing', null);
    }
    else if(type === 'domino') {
        let targetSequence = [];
        for(let i = 1; i < items.length; i++) targetSequence.push(items[i]);
        if(items.length > 0) targetSequence.push(items[0]);

        let dominoChainHtml = `

            

                
▶

                
${items[0]}

            
`;
        targetSequence.forEach(w => {
            dominoChainHtml += `
➔
`;
            dominoChainHtml += `
`;
        });
        dominoChainHtml += `
`;
        stage.insertAdjacentHTML('beforeend', `
${dominoChainHtml}
`);
        
        const poolItems = [...items].sort(()=>Math.random()-0.5);
        pool.innerHTML = poolItems.map((it) => {
            let i = items.indexOf(it);
            const imgNeeded = i === 0 ? items[items.length-1] : items[i-1];
            const imgContent = dbImg[imgNeeded] ? `` : `📷
${imgNeeded}`;
            return `

${imgContent}
${it}
`;
        }).join('');
        document.getElementById('nav-step').innerHTML = '';
        setupSortable('domino', null);
    }
    else if(type === 'anagramme') {
        const shuffled = word.split('').sort(()=>Math.random()-0.5);
        const imgContent = dbImg[word] ? `` : '📷 Foto';
        stage.insertAdjacentHTML('beforeend', `

            
${imgContent}

            
` 
                + shuffled.map(l => `
${l.toLowerCase()}
`).join('') + 
            `

            Vérifier
        
`);
        pool.innerHTML = '';
        setupSortable('anagramme', word);
    }
    else if(type === 'sentence_ordering') {
        const chunks = word.split('/').map(c => c.trim());
        const imgContent = dbImg[word] ? `` : '📷 Foto';
        const shuffled = [...chunks].sort(()=>Math.random()-0.5);
        stage.insertAdjacentHTML('beforeend', `

${imgContent}

            
` 
                + shuffled.map(c => `
${c}
`).join('') + 
            `

            Vérifier
        
`);
        pool.innerHTML = '';
        setupSortable('sentence_ordering', word);
    }
    else if(type === 'rebus') {
        const sentence = rebusData[word] || `{${word}}`;
        const text = sentence.replace(/{([^}]+)}/g, `
`);
        const imgContent = dbImg[word] ? `` : '📷 Immagine
(Opzionale)';
        stage.insertAdjacentHTML('beforeend', `

${imgContent}
${text}
`);
        const shuffledItems = [...items].sort(() => Math.random() - 0.5);
        pool.innerHTML = shuffledItems.map(it => `
${it}
`).join('');
        setupSortable('rebus', word);
    }

    if (stepAudioHtml !== '') { stage.insertAdjacentHTML('afterbegin', stepAudioHtml); }
}

function setupSortable(mode, targetWord) {
    const pool = document.getElementById('pool'); 
    
    if (mode === 'autocollantes' || mode === 'dressing' || mode === 'domino') {
        if(!pool) return;
        new Sortable(pool, { group: 'game', sort: false, animation: 150, onStart: () => playSound('drag'), onEnd: () => playSound('drop') });
        
        const itemArray = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.items : items;
        const zoneList = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.mappedZones : mappedZones;
        const targetWords = (mode === 'autocollantes' || mode === 'domino') ? itemArray : zoneList.map(z => z.word);

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
                } else { e.item.remove(); validate(false); }
            } else { e.item.remove(); validate(false); }
        }
    });
}

function validate(correct) {
    const type = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.levels[curLvl].type : document.getElementById('type-' + curLvl).value;
    const itemsArr = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.items : items;
    
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
    const type = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.levels[curLvl].type : document.getElementById('type-' + curLvl).value;
    const itemsArr = (typeof GAME_CONFIG !== 'undefined') ? GAME_CONFIG.items : items;
    if(['crossword','domino','autocollantes','dressing'].includes(type)) { document.getElementById('nav-step').innerHTML = ''; return; }
    document.getElementById('nav-step').innerHTML = itemsArr.map((_, i) => `
${i+1}
`).join(''); 
}

function switchLvl(l) { 
    curLvl = l; 
    document.getElementById('btn-f-view').className = l==='facile' ? 'px-5 py-2 rounded-full text-xs font-black bg-[#2753F4] text-white shadow-sm transition uppercase tracking-wide' : 'px-5 py-2 rounded-full text-xs font-black text-[#2753F4] hover:bg-blue-100 transition uppercase tracking-wide bg-transparent';
    document.getElementById('btn-d-view').className = l==='difficile' ? 'px-5 py-2 rounded-full text-xs font-black bg-[#2753F4] text-white shadow-sm transition uppercase tracking-wide' : 'px-5 py-2 rounded-full text-xs font-black text-[#2753F4] hover:bg-blue-100 transition uppercase tracking-wide bg-transparent';
    if (typeof GAME_CONFIG === 'undefined') { initGame(); startGame(); } else { startGame(); }
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
    const typeF = document.getElementById('type-f').value; const typeD = document.getElementById('type-d').value;
    
    const listF = document.getElementById('items-list-f');
    const itemsFRaw = listF.value.trim() !== '' ? listF.value : listF.placeholder;
    const itemsF = itemsFRaw.split(';').map(i=>i.trim()).filter(i=>i);

    const listD = document.getElementById('items-list-d');
    const itemsDRaw = listD.value.trim() !== '' ? listD.value : listD.placeholder;
    const itemsD = itemsDRaw.split(';').map(i=>i.trim()).filter(i=>i);

    if(itemsF.length === 0 && typeF !== 'crossword' && typeD !== 'crossword') { alert("Dati mancanti!"); return; }
    const zip = new JSZip(); const assetsFolder = zip.folder("assets"); const jsFolder = zip.folder("js");

    function dataURLtoBlob(url) { let arr = url.split(','), mime = arr[0].match(/:(.*?);/)[1]; let bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n); while(n--){ u8arr[n] = bstr.charCodeAt(n); } return new Blob([u8arr], {type:mime}); }
    let expImg = {}; for(let k in dbImg) { if(!dbImg[k]) continue; let ext = dbImg[k].match(/data:image\/(.*);base64/)[1]; let name = `${k.replace(/[^a-z0-9_]/gi,'_')}.${ext}`; assetsFolder.file(name, dataURLtoBlob(dbImg[k])); expImg[k] = `assets/${name}`; }
    let expAud = {}; for(let k in dbAud) { if(!dbAud[k]) continue; let ext = dbAud[k].includes('mpeg') ? 'mp3' : 'wav'; let name = `${k.replace(/[^a-z0-9_]/gi,'_')}.${ext}`; assetsFolder.file(name, dataURLtoBlob(dbAud[k])); expAud[k] = `assets/${name}`; }

    const inTitre = document.getElementById('in-titre');
    const titreText = inTitre.value.trim() !== '' ? inTitre.value : inTitre.placeholder;
    
    const inUnite = document.getElementById('in-unite');
    const uniteText = inUnite.value.trim() !== '' ? inUnite.value : inUnite.placeholder;

    const inLecon = document.getElementById('in-lecon');
    const leconText = inLecon.value.trim() !== '' ? inLecon.value : inLecon.placeholder;

    const conF = document.getElementById('con-f');
    const conFText = conF.value.trim() !== '' ? conF.value : conF.placeholder;

    const conD = document.getElementById('con-d');
    const conDText = conD.value.trim() !== '' ? conD.value : conD.placeholder;

    const ttsF = document.getElementById('tts-context-f') ? document.getElementById('tts-context-f').value.trim() : '';
    const ttsD = document.getElementById('tts-context-d') ? document.getElementById('tts-context-d').value.trim() : '';

    const gameConfig = { 
        unite: uniteText, 
        uniteColor: document.getElementById('in-color').value || '#E84C7B',
        showLecon: document.getElementById('in-show-lecon').checked,
        lecon: leconText,
        titre: titreText, 
        cwVerbLabel: cwVerbLabel,
        cwShowClues: cwShowClues,
        mappedZones: mappedZones, cwData: cwData, cwClues: cwClues, rebusData: rebusData, images: expImg, audio: expAud, 
        levels: { facile: { type: typeF, consigne: conFText, ttsContext: ttsF, items: itemsF }, difficile: { type: typeD, consigne: conDText, ttsContext: ttsD, items: itemsD } } 
    };
    jsFolder.file("config.js", `const GAME_CONFIG = ${JSON.stringify(gameConfig, null, 2)};`);

    let playerHTML = '\n\n\n\n\n\n
