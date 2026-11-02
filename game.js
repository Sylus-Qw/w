/* =========================================================
   果漾消消乐 · Fruit Splash
   纯原生 HTML / CSS / JavaScript，无外部依赖
   ========================================================= */
(() => {
  'use strict';

  /* ---------------- 常量 ---------------- */
  const ROWS = 8;
  const COLS = 8;
  const TYPES = 6;
  const BASE_MOVES = 24;
  const BASE_TARGET = 5000;
  const TARGET_STEP = 1500;
  const START_HINTS = 3;
  const START_SHUFFLES = 2;
  const LS_BEST = 'fruitSplash.best';
  const LS_SOUND = 'fruitSplash.sound';
  const FRUIT_NAMES = ['草莓', '橙子', '柠檬', '猕猴桃', '蓝莓', '葡萄'];

  /* ---------------- DOM ---------------- */
  const $ = (id) => document.getElementById(id);
  const dom = {
    board: $('board'),
    boardGrid: $('boardGrid'),
    tileLayer: $('tileLayer'),
    effects: $('effects'),
    comboBanner: $('comboBanner'),
    levelNum: $('levelNum'),
    movesNum: $('movesNum'),
    movesPill: $('movesPill'),
    scoreNum: $('scoreNum'),
    hudTarget: $('hudTarget'),
    hudProgress: $('hudProgress'),
    progressFill: $('progressFill'),
    sideLevel: $('sideLevel'),
    targetNum: $('targetNum'),
    sideScore: $('sideScore'),
    sideProgress: $('sideProgress'),
    progressPercent: $('progressPercent'),
    bestScore: $('bestScore'),
    comboBest: $('comboBest'),
    hintBtn: $('hintBtn'),
    hintCount: $('hintCount'),
    shuffleBtn: $('shuffleBtn'),
    shuffleCount: $('shuffleCount'),
    restartBtn: $('restartBtn'),
    pauseBtn: $('pauseBtn'),
    soundBtn: $('soundBtn'),
    soundIconUse: $('soundIconUse'),
    overlay: $('overlay'),
    overlayCard: $('overlayCard'),
    toast: $('toast'),
  };

  /* ---------------- 状态 ---------------- */
  let board = [];
  const tileEls = new Map();
  let nextCellId = 1;

  let phase = 'intro';
  let busy = false;
  let selected = null;

  let level = 1;
  let movesLeft = BASE_MOVES;
  let levelScore = 0;
  let target = BASE_TARGET;
  let hintsLeft = START_HINTS;
  let shufflesLeft = START_SHUFFLES;
  let bestScore = 0;
  let maxCombo = 1;

  let soundOn = true;
  let audioCtx = null;
  let toastTimer = null;
  let hintTimer = null;
  let hintClearTimer = null;
  let pointerStart = null;
  let dragTriggered = false;

  /* ---------------- 本地存储 ---------------- */
  function loadStore(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function saveStore(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (_) { /* 忽略无痕模式限制 */ }
  }

  /* ---------------- 工具 ---------------- */
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const cellKey = (r, c) => `${r},${c}`;
  const parseKey = (key) => {
    const [r, c] = key.split(',').map(Number);
    return { r, c };
  };
  const isAdjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  const randomType = () => Math.floor(Math.random() * TYPES);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  /* ---------------- 音效 ---------------- */
  function getAudioContext() {
    if (!soundOn) return null;
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    } catch (_) {
      return null;
    }
  }

  function tone(freq, duration = 0.1, options = {}) {
    if (!soundOn) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const { type = 'sine', volume = 0.035, delay = 0, slideTo = null } = options;
    try {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(30, freq), start);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), start + duration);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.04);
    } catch (_) { /* 忽略音频错误 */ }
  }

  function playSound(name, value = 0) {
    if (!soundOn) return;
    switch (name) {
      case 'swap':
        tone(330, 0.07, { type: 'sine', volume: 0.025, slideTo: 460 });
        tone(520, 0.08, { type: 'triangle', volume: 0.018, delay: 0.05 });
        break;
      case 'invalid':
        tone(190, 0.13, { type: 'sawtooth', volume: 0.02, slideTo: 130 });
        break;
      case 'match': {
        const base = 430 + Math.min(value, 6) * 55;
        tone(base, 0.1, { type: 'sine', volume: 0.035 });
        tone(base * 1.26, 0.12, { type: 'triangle', volume: 0.028, delay: 0.055 });
        tone(base * 1.58, 0.13, { type: 'sine', volume: 0.02, delay: 0.11 });
        break;
      }
      case 'special':
        [523, 659, 784, 1046].forEach((freq, i) => {
          tone(freq, 0.16, { type: 'triangle', volume: 0.028, delay: i * 0.055 });
        });
        break;
      case 'rainbow':
        [392, 523, 659, 784, 1046, 1318].forEach((freq, i) => {
          tone(freq, 0.22, { type: 'sine', volume: 0.024, delay: i * 0.045 });
        });
        break;
      case 'hint':
        tone(880, 0.11, { type: 'sine', volume: 0.022 });
        tone(1174, 0.16, { type: 'sine', volume: 0.018, delay: 0.09 });
        break;
      case 'shuffle':
        tone(300, 0.18, { type: 'triangle', volume: 0.02, slideTo: 680 });
        tone(700, 0.16, { type: 'sine', volume: 0.018, delay: 0.12, slideTo: 420 });
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((freq, i) => {
          tone(freq, 0.3, { type: 'triangle', volume: 0.034, delay: i * 0.11 });
        });
        break;
      case 'lose':
        [392, 330, 262, 196].forEach((freq, i) => {
          tone(freq, 0.26, { type: 'sine', volume: 0.028, delay: i * 0.12 });
        });
        break;
      case 'start':
        [392, 523, 659, 784].forEach((freq, i) => {
          tone(freq, 0.18, { type: 'triangle', volume: 0.03, delay: i * 0.07 });
        });
        break;
      default:
        break;
    }
  }

  function updateSoundUI() {
    dom.soundIconUse.setAttribute('href', soundOn ? '#icon-sound' : '#icon-mute');
    dom.soundBtn.setAttribute('aria-pressed', String(soundOn));
    dom.soundBtn.setAttribute('aria-label', soundOn ? '关闭音效' : '开启音效');
  }

  function toggleSound() {
    soundOn = !soundOn;
    saveStore(LS_SOUND, soundOn ? '1' : '0');
    updateSoundUI();
    if (soundOn) {
      getAudioContext();
      playSound('hint');
      showToast('音效已开启');
    } else {
      showToast('音效已关闭');
    }
    scheduleHint();
  }

  /* ---------------- HUD / 提示 ---------------- */
  function updateHUD() {
    dom.levelNum.textContent = String(level).padStart(2, '0');
    dom.sideLevel.textContent = String(level);
    dom.movesNum.textContent = String(movesLeft);
    dom.movesPill.classList.toggle('low', movesLeft <= 5);
    dom.scoreNum.textContent = fmt(levelScore);
    dom.sideScore.textContent = fmt(levelScore);
    dom.hudTarget.textContent = fmt(target);
    dom.targetNum.textContent = fmt(target);
    dom.bestScore.textContent = fmt(Math.max(bestScore, levelScore));
    dom.comboBest.textContent = String(maxCombo);
    dom.hintCount.textContent = String(hintsLeft);
    dom.shuffleCount.textContent = String(shufflesLeft);

    const percent = clamp((levelScore / target) * 100, 0, 100);
    dom.progressFill.style.width = `${percent}%`;
    dom.sideProgress.style.width = `${percent}%`;
    dom.progressPercent.textContent = `${Math.floor(percent)}%`;
    dom.hudProgress.setAttribute('aria-valuemax', String(target));
    dom.hudProgress.setAttribute('aria-valuenow', String(Math.min(levelScore, target)));

    dom.hintBtn.disabled = hintsLeft <= 0 || phase !== 'playing';
    dom.shuffleBtn.disabled = shufflesLeft <= 0 || phase !== 'playing';
    dom.pauseBtn.disabled = phase === 'intro' || phase === 'levelComplete' || phase === 'gameOver';
  }

  function bumpScore() {
    dom.scoreNum.classList.remove('bump');
    void dom.scoreNum.offsetWidth;
    dom.scoreNum.classList.add('bump');
  }

  function addScore(points) {
    if (points <= 0) return;
    levelScore += points;
    if (levelScore > bestScore) {
      bestScore = levelScore;
      saveStore(LS_BEST, bestScore);
    }
    updateHUD();
    bumpScore();
  }

  function showToast(message, duration = 2200) {
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), duration);
  }

  function clearHintHighlight() {
    dom.tileLayer.querySelectorAll('.tile.hinted').forEach((el) => el.classList.remove('hinted'));
    clearTimeout(hintClearTimer);
    hintClearTimer = null;
  }

  function scheduleHint() {
    clearTimeout(hintTimer);
    if (phase !== 'playing' || busy) return;
    hintTimer = setTimeout(() => {
      if (phase === 'playing' && !busy) showHint(false);
    }, 12000);
  }

  /* ---------------- 弹窗 ---------------- */
  function openOverlay(html) {
    dom.overlayCard.innerHTML = html;
    dom.overlay.classList.add('visible');
    if (dom.overlay.getAttribute('aria-hidden') !== 'false') {
      dom.overlay.setAttribute('aria-hidden', 'false');
    }
    requestAnimationFrame(() => {
      const primary = dom.overlayCard.querySelector('.primary-btn');
      if (primary) primary.focus({ preventScroll: true });
    });
  }

  function closeOverlay() {
    dom.overlay.classList.remove('visible');
    dom.overlay.setAttribute('aria-hidden', 'true');
  }

  function starMarkup(count = 0) {
    return [1, 2, 3].map((i) => `
      <svg class="star${i <= count ? ' lit' : ''}" viewBox="0 0 24 24" aria-hidden="true">
        <use href="#icon-star"></use>
      </svg>`).join('');
  }

  function showIntro() {
    phase = 'intro';
    openOverlay(`
      <div class="eyebrow">MATCH 3 · JUICE</div>
      <div class="hero-fruits" aria-hidden="true">
        <span class="hero-fruit"><svg viewBox="0 0 100 100"><use href="#fruit-0"></use></svg></span>
        <span class="hero-fruit"><svg viewBox="0 0 100 100"><use href="#fruit-1"></use></svg></span>
        <span class="hero-fruit"><svg viewBox="0 0 100 100"><use href="#fruit-5"></use></svg></span>
      </div>
      <h2>果漾消消乐</h2>
      <p>交换相邻水果，连成三个或更多，<br>让整页果汁都炸开！</p>
      <button class="primary-btn" type="button" data-action="start">开始游戏 <span aria-hidden="true">→</span></button>
      <div class="mini-tips">
        <span>🍓 三连消除</span>
        <span>⚡ 连击加分</span>
        <span>🌈 五连彩虹</span>
      </div>
      <p class="intro-note">每关 ${BASE_MOVES} 步 · 达成目标分数即可过关</p>
    `);
    updateHUD();
  }

  function showPause() {
    phase = 'paused';
    busy = true;
    clearHintHighlight();
    clearTimeout(hintTimer);
    updateHUD();
    openOverlay(`
      <div class="eyebrow">PAUSED</div>
      <h2>休息一下</h2>
      <p>果汁已经暂停，<br>准备好后继续消消乐吧。</p>
      <button class="primary-btn" type="button" data-action="resume">继续游戏</button>
      <button class="ghost-btn" type="button" data-action="restart">重开本关</button>
    `);
  }

  function showRestartConfirm() {
    if (phase !== 'playing' && phase !== 'paused') return;
    phase = 'confirm';
    busy = true;
    clearHintHighlight();
    clearTimeout(hintTimer);
    updateHUD();
    openOverlay(`
      <div class="eyebrow">NEW START</div>
      <h2>重开本关？</h2>
      <p>本关分数和剩余步数会重置，<br>当前进度不会保留哦。</p>
      <button class="primary-btn" type="button" data-action="restart">确认重开</button>
      <button class="ghost-btn" type="button" data-action="resume">继续游戏</button>
    `);
  }

  function showLevelComplete(stars, bonus) {
    phase = 'levelComplete';
    busy = true;
    clearHintHighlight();
    clearTimeout(hintTimer);
    updateHUD();
    playSound('win');
    openOverlay(`
      <div class="eyebrow">LEVEL CLEAR</div>
      <h2>果汁满溢！</h2>
      <div class="result-stars" aria-label="${stars} 星通关">${starMarkup(stars)}</div>
      <div class="result-score">本关最终得分<strong>${fmt(levelScore)}</strong></div>
      <div class="result-grid">
        <div><span>剩余步数奖励</span><b>+${fmt(bonus)}</b></div>
        <div><span>过关目标</span><b>${fmt(target)}</b></div>
      </div>
      <button class="primary-btn" type="button" data-action="next">下一关 · 第 ${level + 1} 关</button>
      <button class="ghost-btn" type="button" data-action="replay">再玩一次本关</button>
    `);
  }

  function showGameOver(gap) {
    phase = 'gameOver';
    busy = true;
    clearHintHighlight();
    clearTimeout(hintTimer);
    updateHUD();
    playSound('lose');
    openOverlay(`
      <div class="eyebrow">GAME OVER</div>
      <h2>还差一点点…</h2>
      <p>目标就在眼前，<br>再来一次一定能过关！</p>
      <div class="result-score">本关得分<strong>${fmt(levelScore)}</strong></div>
      <div class="result-grid">
        <div><span>距离目标</span><b>${fmt(gap)}</b></div>
        <div><span>最高单关</span><b>${fmt(bestScore)}</b></div>
      </div>
      <button class="primary-btn" type="button" data-action="retry">再试一次</button>
    `);
  }

  /* ---------------- 棋盘生成 ---------------- */
  function makeCell(type = randomType(), special = null) {
    return { id: nextCellId++, type, special };
  }

  function typeAt(grid, r, c) {
    const cell = grid?.[r]?.[c];
    if (!cell || cell.special === 'rainbow' || cell.type === null || cell.type === undefined) return -1;
    return cell.type;
  }

  function createEmptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function createNoMatchGrid() {
    const grid = createEmptyGrid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const banned = new Set();
        if (c >= 2) {
          const a = typeAt(grid, r, c - 1);
          const b = typeAt(grid, r, c - 2);
          if (a === b && a >= 0) banned.add(a);
        }
        if (r >= 2) {
          const a = typeAt(grid, r - 1, c);
          const b = typeAt(grid, r - 2, c);
          if (a === b && a >= 0) banned.add(a);
        }
        let type = randomType();
        let guard = 0;
        while (banned.has(type) && guard++ < 30) type = randomType();
        grid[r][c] = makeCell(type);
      }
    }
    return grid;
  }

  function makePlayableBoard() {
    for (let attempt = 0; attempt < 120; attempt++) {
      const grid = createNoMatchGrid();
      if (findRuns(grid).length === 0 && findPossibleMove(grid)) return grid;
    }
    // 极端情况下放弃无匹配约束，保证可玩
    const grid = createEmptyGrid();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) grid[r][c] = makeCell();
    }
    return grid;
  }

  /* ---------------- 棋盘渲染 ---------------- */
  function createBoardBackground() {
    dom.boardGrid.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('span');
        cell.className = `cell${(r + c) % 2 ? ' alt' : ''}`;
        frag.appendChild(cell);
      }
    }
    dom.boardGrid.appendChild(frag);
  }

  function fruitMarkup(type) {
    return `<svg class="fruit-svg" viewBox="0 0 100 100" aria-hidden="true"><use href="#fruit-${type}"></use></svg>`;
  }

  function paintGem(el, cell) {
    const gem = el.querySelector('.gem');
    if (!gem) return;
    if (cell.special === 'rainbow') {
      gem.className = 'gem special-rainbow';
      gem.innerHTML = '<svg class="fruit-svg" viewBox="0 0 100 100" aria-hidden="true"><use href="#icon-sparkle"></use></svg>';
      el.dataset.type = 'rainbow';
      el.setAttribute('aria-label', '彩虹水果，与任意水果交换可消除同类');
    } else {
      let cls = `gem type-${cell.type}`;
      if (cell.special) cls += ` special-${cell.special}`;
      gem.className = cls;
      gem.innerHTML = fruitMarkup(cell.type);
      el.dataset.type = String(cell.type);
      const specialName = cell.special === 'row' ? '横线爆破水果' : cell.special === 'col' ? '竖线爆破水果' : FRUIT_NAMES[cell.type];
      el.setAttribute('aria-label', specialName);
    }
  }

  function createTile(cell) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile';
    el.dataset.id = String(cell.id);
    el.innerHTML = '<span class="gem"></span>';
    paintGem(el, cell);
    return el;
  }

  function setTilePosition(el, r, c, duration = null) {
    if (!el) return;
    if (duration !== null) el.style.transitionDuration = `${duration}ms`;
    el.style.setProperty('--r', String(r));
    el.style.setProperty('--c', String(c));
  }

  function addTile(cell, r, c, spawnRow = null) {
    const el = createTile(cell);
    el.style.setProperty('--c', String(c));
    el.style.setProperty('--r', String(spawnRow === null ? r : spawnRow));
    dom.tileLayer.appendChild(el);
    tileEls.set(cell.id, el);
    if (spawnRow !== null) {
      el.classList.add('dropping');
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.setProperty('--r', String(r));
      }));
      setTimeout(() => el.classList.remove('dropping'), 700);
    }
    return el;
  }

  function renderBoard(drop = true) {
    dom.tileLayer.innerHTML = '';
    dom.effects.innerHTML = '';
    tileEls.clear();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        const spawn = drop ? r - ROWS - 1 - Math.random() * 2 : null;
        addTile(cell, r, c, spawn);
      }
    }
  }

  function syncTilePositions() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (!cell) continue;
        const el = tileEls.get(cell.id);
        if (el) setTilePosition(el, r, c);
      }
    }
  }

  function getTileAt(r, c) {
    const cell = board?.[r]?.[c];
    return cell ? tileEls.get(cell.id) : null;
  }

  function clearSelection() {
    if (selected) {
      const el = getTileAt(selected.r, selected.c);
      if (el) el.classList.remove('selected');
    }
    selected = null;
  }

  function selectCell(r, c) {
    clearSelection();
    selected = { r, c };
    const el = getTileAt(r, c);
    if (el) el.classList.add('selected');
  }

  /* ---------------- 匹配检测 ---------------- */
  function findRuns(grid = board) {
    const runs = [];

    for (let r = 0; r < ROWS; r++) {
      let c = 0;
      while (c < COLS) {
        const type = typeAt(grid, r, c);
        if (type < 0) { c++; continue; }
        let end = c + 1;
        while (end < COLS && typeAt(grid, r, end) === type) end++;
        if (end - c >= 3) {
          const cells = [];
          for (let i = c; i < end; i++) cells.push({ r, c: i });
          runs.push({ orientation: 'h', type, cells });
        }
        c = end;
      }
    }

    for (let c = 0; c < COLS; c++) {
      let r = 0;
      while (r < ROWS) {
        const type = typeAt(grid, r, c);
        if (type < 0) { r++; continue; }
        let end = r + 1;
        while (end < ROWS && typeAt(grid, end, c) === type) end++;
        if (end - r >= 3) {
          const cells = [];
          for (let i = r; i < end; i++) cells.push({ r: i, c });
          runs.push({ orientation: 'v', type, cells });
        }
        r = end;
      }
    }

    return runs;
  }

  function findPossibleMove(grid = board) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = grid[r][c];
        if (!a) continue;

        if (c + 1 < COLS) {
          const b = grid[r][c + 1];
          if (b) {
            if (a.special === 'rainbow' || b.special === 'rainbow') return { a: { r, c }, b: { r, c: c + 1 } };
            if (a.type !== b.type) {
              grid[r][c] = b; grid[r][c + 1] = a;
              const hasRun = findRuns(grid).length > 0;
              grid[r][c] = a; grid[r][c + 1] = b;
              if (hasRun) return { a: { r, c }, b: { r, c: c + 1 } };
            }
          }
        }

        if (r + 1 < ROWS) {
          const b = grid[r + 1][c];
          if (b) {
            if (a.special === 'rainbow' || b.special === 'rainbow') return { a: { r, c }, b: { r: r + 1, c } };
            if (a.type !== b.type) {
              grid[r][c] = b; grid[r + 1][c] = a;
              const hasRun = findRuns(grid).length > 0;
              grid[r][c] = a; grid[r + 1][c] = b;
              if (hasRun) return { a: { r, c }, b: { r: r + 1, c } };
            }
          }
        }
      }
    }
    return null;
  }

  /* ---------------- 消除计划 ---------------- */
  function chooseAnchor(run, swapCells) {
    if (swapCells && swapCells.length) {
      const hit = run.cells.find((p) => swapCells.some((s) => s.r === p.r && s.c === p.c));
      if (hit) return hit;
    }
    return run.cells[Math.floor(run.cells.length / 2)];
  }

  function mostCommonType() {
    const counts = Array(TYPES).fill(0);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const type = typeAt(board, r, c);
        if (type >= 0) counts[type]++;
      }
    }
    let best = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] > counts[best]) best = i;
    }
    return best;
  }

  function buildClearPlan(runs, swapCells = null) {
    const clearSet = new Set();
    const matchedCount = new Set();

    for (const run of runs) {
      for (const pos of run.cells) {
        matchedCount.add(cellKey(pos.r, pos.c));
        clearSet.add(cellKey(pos.r, pos.c));
      }
    }

    // 4 连生成条纹，5 连及以上生成彩虹
    const anchorMap = new Map();
    for (const run of runs) {
      if (run.cells.length < 4) continue;
      const anchor = chooseAnchor(run, swapCells);
      const key = cellKey(anchor.r, anchor.c);
      const special = run.cells.length >= 5 ? 'rainbow' : (run.orientation === 'h' ? 'row' : 'col');
      const existing = anchorMap.get(key);
      if (existing) {
        if (special === 'rainbow') {
          existing.special = 'rainbow';
          existing.type = null;
        }
      } else {
        anchorMap.set(key, {
          r: anchor.r,
          c: anchor.c,
          special,
          type: special === 'rainbow' ? null : run.type,
        });
      }
    }

    const protectedKeys = new Set(anchorMap.keys());
    for (const key of protectedKeys) clearSet.delete(key);

    // 连锁引爆棋盘上已有的特殊水果
    const effects = { beams: [], flashes: [] };
    const triggered = new Set();
    const queue = [...clearSet];

    while (queue.length) {
      const key = queue.pop();
      if (triggered.has(key)) continue;
      const { r, c } = parseKey(key);
      const cell = board?.[r]?.[c];
      if (!cell || !cell.special || protectedKeys.has(key)) continue;
      triggered.add(key);

      const affected = [];
      if (cell.special === 'row' || cell.special === 'col') {
        effects.beams.push({ orientation: cell.special === 'row' ? 'h' : 'v', r, c });
        if (cell.special === 'row') {
          for (let i = 0; i < COLS; i++) affected.push(cellKey(r, i));
        } else {
          for (let i = 0; i < ROWS; i++) affected.push(cellKey(i, c));
        }
      } else if (cell.special === 'rainbow') {
        const wanted = mostCommonType();
        effects.flashes.push({ r, c, rainbow: true });
        for (let rr = 0; rr < ROWS; rr++) {
          for (let cc = 0; cc < COLS; cc++) {
            if (typeAt(board, rr, cc) === wanted) affected.push(cellKey(rr, cc));
          }
        }
      }

      for (const targetKey of affected) {
        if (protectedKeys.has(targetKey)) continue;
        if (!clearSet.has(targetKey)) {
          clearSet.add(targetKey);
          queue.push(targetKey);
        }
      }
    }

    return {
      clearSet,
      anchors: [...anchorMap.values()],
      protectedKeys,
      effects,
      matchedCount: matchedCount.size,
      triggered: triggered.size,
    };
  }

  /* ---------------- 视觉特效 ---------------- */
  const PARTICLE_COLORS = [
    ['#ff9db2', '#ff4f74', '#ffd5df'],
    ['#ffc46b', '#ff961f', '#ffe0a8'],
    ['#ffec79', '#ffd02a', '#fff8bd'],
    ['#b6ea7a', '#72bf3a', '#e6ffc2'],
    ['#8fc9ff', '#3f7dff', '#d6e9ff'],
    ['#d3a4ff', '#9850e8', '#f0dcff'],
  ];
  const RAINBOW_COLORS = ['#ffd85e', '#ff7a9c', '#c08cff', '#6cc7ff', '#7be4ae', '#ffe36e'];

  function spawnParticles(r, c, cell) {
    const colors = cell?.special === 'rainbow'
      ? RAINBOW_COLORS
      : PARTICLE_COLORS[cell?.type ?? 0] || RAINBOW_COLORS;
    const amount = window.innerWidth < 620 ? 5 : 7;
    const left = `${((c + 0.5) / COLS) * 100}%`;
    const top = `${((r + 0.5) / ROWS) * 100}%`;

    for (let i = 0; i < amount; i++) {
      const particle = document.createElement('span');
      const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.8;
      const distance = 24 + Math.random() * 44;
      particle.className = `particle${i % 3 === 0 ? ' spark' : ''}`;
      particle.style.left = left;
      particle.style.top = top;
      particle.style.setProperty('--size', `${4 + Math.random() * 6}px`);
      particle.style.setProperty('--pc', colors[Math.floor(Math.random() * colors.length)]);
      particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      particle.style.setProperty('--dy', `${Math.sin(angle) * distance + 12}px`);
      particle.style.setProperty('--rot', `${Math.random() * 360}deg`);
      particle.style.animationDelay = `${Math.random() * 0.05}s`;
      dom.effects.appendChild(particle);
      setTimeout(() => particle.remove(), 1000);
    }
  }

  function spawnBeam(orientation, r, c) {
    const beam = document.createElement('span');
    beam.className = `fx-beam ${orientation === 'h' ? 'horizontal' : 'vertical'}`;
    if (orientation === 'h') beam.style.setProperty('--row', String(r));
    else beam.style.setProperty('--col', String(c));
    dom.effects.appendChild(beam);
    setTimeout(() => beam.remove(), 620);
  }

  function spawnFlash(r, c) {
    const flash = document.createElement('span');
    flash.className = 'fx-flash';
    flash.style.setProperty('--row', String(r));
    flash.style.setProperty('--col', String(c));
    dom.effects.appendChild(flash);
    setTimeout(() => flash.remove(), 650);
  }

  function spawnFloatScore(points, r, c) {
    const label = document.createElement('span');
    label.className = 'float-score';
    label.textContent = `+${fmt(points)}`;
    label.style.setProperty('--row', String(clamp(r, 1, ROWS - 2)));
    label.style.setProperty('--col', String(clamp(c, 1, COLS - 2)));
    dom.effects.appendChild(label);
    setTimeout(() => label.remove(), 1100);
  }

  function showCombo(cascade) {
    if (cascade < 2) return;
    const banner = dom.comboBanner;
    banner.textContent = cascade >= 5 ? `果汁暴击 ×${cascade}!` : `连击 ×${cascade}!`;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    setTimeout(() => banner.classList.remove('show'), 1050);
  }

  /* ---------------- 重力与补充 ---------------- */
  async function dropAndRefill() {
    const missing = Array(COLS).fill(0);

    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const cell = board[r][c];
        if (!cell) continue;
        if (write !== r) {
          board[write][c] = cell;
          board[r][c] = null;
        }
        write--;
      }
      missing[c] = write + 1;
    }

    syncTilePositions();

    for (let c = 0; c < COLS; c++) {
      const count = missing[c];
      if (!count) continue;
      for (let r = count - 1; r >= 0; r--) {
        const cell = makeCell();
        board[r][c] = cell;
        const spawnRow = r - count - Math.random() * 0.6;
        addTile(cell, r, c, spawnRow);
      }
    }

    await sleep(520);
  }

  /* ---------------- 执行消除 ---------------- */
  async function executeClear(plan, cascade) {
    const { clearSet, anchors, effects, matchedCount } = plan;
    if (!clearSet.size && !anchors.length) return 0;

    const multiplier = clamp(1 + (cascade - 1) * 0.5, 1, 4.5);
    const totalTiles = clearSet.size + anchors.length;
    const points = Math.round(totalTiles * 70 * multiplier);

    maxCombo = Math.max(maxCombo, cascade);
    addScore(points);

    const firstKey = clearSet.values().next().value || cellKey(anchors[0].r, anchors[0].c);
    const firstPos = parseKey(firstKey);
    spawnFloatScore(points, firstPos.r, firstPos.c);

    if (cascade >= 2) showCombo(cascade);

    if (effects.beams.length || effects.flashes.length || plan.triggered) {
      playSound('special');
      if (plan.triggered || effects.flashes.length) playSound('rainbow');
    } else {
      playSound('match', cascade);
    }

    for (const beam of effects.beams) spawnBeam(beam.orientation, beam.r, beam.c);
    for (const flash of effects.flashes) spawnFlash(flash.r, flash.c);

    for (const key of clearSet) {
      const { r, c } = parseKey(key);
      const cell = board?.[r]?.[c];
      if (!cell) continue;
      const el = tileEls.get(cell.id);
      if (el) el.classList.add('clearing');
      spawnParticles(r, c, cell);
    }

    await sleep(320);

    // 清除棋盘格与 DOM
    for (const key of clearSet) {
      const { r, c } = parseKey(key);
      const cell = board?.[r]?.[c];
      if (!cell) continue;
      const el = tileEls.get(cell.id);
      if (el) el.remove();
      tileEls.delete(cell.id);
      board[r][c] = null;
    }

    // 特殊水果升级 / 保留
    for (const anchor of anchors) {
      const cell = board?.[anchor.r]?.[anchor.c];
      if (!cell) continue;
      if (anchor.special === 'rainbow') {
        cell.special = 'rainbow';
        cell.type = null;
      } else {
        cell.special = anchor.special;
        cell.type = anchor.type;
      }
      const el = tileEls.get(cell.id);
      if (el) {
        paintGem(el, cell);
        el.classList.add('upgraded');
        setTimeout(() => el.classList.remove('upgraded'), 620);
      }
      spawnParticles(anchor.r, anchor.c, cell);
    }

    await sleep(90);
    await dropAndRefill();
    return points;
  }

  /* ---------------- 结算循环 ---------------- */
  async function resolveBoard(swapCells = null) {
    let cascade = 0;
    let guard = 0;

    while (guard++ < 30) {
      const runs = findRuns();
      if (!runs.length) break;
      cascade++;
      const plan = buildClearPlan(runs, cascade === 1 ? swapCells : null);
      await executeClear(plan, cascade);
      swapCells = null;
    }

    return cascade;
  }

  function completeLevel() {
    const bonus = Math.max(0, movesLeft) * 90;
    if (bonus) addScore(bonus);
    if (levelScore > bestScore) {
      bestScore = levelScore;
      saveStore(LS_BEST, bestScore);
    }
    const stars = movesLeft >= 8 ? 3 : movesLeft >= 4 ? 2 : 1;
    showLevelComplete(stars, bonus);
  }

  function failLevel() {
    const gap = Math.max(0, target - levelScore);
    showGameOver(gap);
  }

  async function finishTurn() {
    if (levelScore >= target) {
      await sleep(420);
      completeLevel();
      return;
    }
    if (movesLeft <= 0) {
      await sleep(320);
      failLevel();
      return;
    }

    if (!findPossibleMove()) {
      showToast('没有可消除的组合，自动洗牌中…', 1800);
      await sleep(300);
      await shuffleBoard(false, true);
    }

    busy = false;
    if (phase === 'playing') {
      updateHUD();
      scheduleHint();
    }
  }

  /* ---------------- 交换与回合 ---------------- */
  function swapBoardCells(a, b) {
    const temp = board[a.r][a.c];
    board[a.r][a.c] = board[b.r][b.c];
    board[b.r][b.c] = temp;
  }

  async function animateSwap(a, b, duration = 190) {
    swapBoardCells(a, b);
    syncTilePositions();
    await sleep(duration);
  }

  async function activateRainbowSwap(a, b) {
    const cellA = board[a.r][a.c];
    const cellB = board[b.r][b.c];
    const aRainbow = cellA?.special === 'rainbow';
    const bRainbow = cellB?.special === 'rainbow';
    if (!aRainbow && !bRainbow) return;

    const clearSet = new Set();
    const flashes = [];
    const triggered = new Set();

    if (aRainbow && bRainbow) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c]) clearSet.add(cellKey(r, c));
        }
      }
      flashes.push({ r: a.r, c: a.c, rainbow: true }, { r: b.r, c: b.c, rainbow: true });
      triggered.add(cellKey(a.r, a.c));
      triggered.add(cellKey(b.r, b.c));
    } else {
      const rainbowPos = aRainbow ? a : b;
      const otherPos = aRainbow ? b : a;
      const otherCell = board[otherPos.r][otherPos.c];
      const wanted = otherCell && otherCell.type !== null && otherCell.type !== undefined
        ? otherCell.type
        : mostCommonType();

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (typeAt(board, r, c) === wanted) clearSet.add(cellKey(r, c));
        }
      }
      clearSet.add(cellKey(rainbowPos.r, rainbowPos.c));
      flashes.push({ r: rainbowPos.r, c: rainbowPos.c, rainbow: true });
      triggered.add(cellKey(rainbowPos.r, rainbowPos.c));
    }

    // 被彩虹波及的条纹水果也会连锁触发
    const effects = { beams: [], flashes };
    const queue = [...clearSet];
    while (queue.length) {
      const key = queue.pop();
      if (triggered.has(key)) continue;
      const { r, c } = parseKey(key);
      const cell = board?.[r]?.[c];
      if (!cell || !cell.special) continue;
      if (cell.special === 'row' || cell.special === 'col') {
        triggered.add(key);
        effects.beams.push({ orientation: cell.special === 'row' ? 'h' : 'v', r, c });
        if (cell.special === 'row') {
          for (let i = 0; i < COLS; i++) {
            const k = cellKey(r, i);
            if (!clearSet.has(k)) { clearSet.add(k); queue.push(k); }
          }
        } else {
          for (let i = 0; i < ROWS; i++) {
            const k = cellKey(i, c);
            if (!clearSet.has(k)) { clearSet.add(k); queue.push(k); }
          }
        }
      } else {
        triggered.add(key);
      }
    }

    playSound('rainbow');
    const plan = {
      clearSet,
      anchors: [],
      protectedKeys: new Set(),
      effects,
      matchedCount: clearSet.size,
      triggered: triggered.size,
    };
    await executeClear(plan, 1);
  }

  async function attemptSwap(a, b) {
    if (phase !== 'playing' || busy) return;
    if (!isAdjacent(a, b)) return;
    const cellA = board?.[a.r]?.[a.c];
    const cellB = board?.[b.r]?.[b.c];
    if (!cellA || !cellB) return;

    busy = true;
    clearTimeout(hintTimer);
    clearHintHighlight();
    clearSelection();
    getAudioContext();
    playSound('swap');

    const elA = tileEls.get(cellA.id);
    const elB = tileEls.get(cellB.id);
    if (elA) elA.style.zIndex = '6';
    if (elB) elB.style.zIndex = '6';

    await animateSwap(a, b);
    if (elA) elA.style.zIndex = '';
    if (elB) elB.style.zIndex = '';

    const hasRainbow = cellA.special === 'rainbow' || cellB.special === 'rainbow';

    if (hasRainbow) {
      movesLeft = Math.max(0, movesLeft - 1);
      updateHUD();
      await activateRainbowSwap(a, b);
      await resolveBoard();
      await finishTurn();
      return;
    }

    const runs = findRuns();
    if (!runs.length) {
      playSound('invalid');
      dom.board.classList.add('invalid');
      if (elA) elA.classList.add('shaking');
      if (elB) elB.classList.add('shaking');
      await sleep(160);
      await animateSwap(a, b, 170);
      dom.board.classList.remove('invalid');
      if (elA) elA.classList.remove('shaking');
      if (elB) elB.classList.remove('shaking');
      busy = false;
      if (phase === 'playing') {
        updateHUD();
        scheduleHint();
      }
      return;
    }

    movesLeft = Math.max(0, movesLeft - 1);
    updateHUD();
    await resolveBoard([a, b]);
    await finishTurn();
  }

  /* ---------------- 洗牌 ---------------- */
  function buildShuffledBoard() {
    const specials = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell?.special) specials.push({ r, c, special: cell.special, type: cell.type });
      }
    }

    for (let attempt = 0; attempt < 140; attempt++) {
      const grid = createNoMatchGrid();
      for (const special of specials) {
        const cell = grid[special.r][special.c];
        if (!cell) continue;
        cell.special = special.special;
        cell.type = special.special === 'rainbow' ? null : special.type;
      }
      if (findRuns(grid).length === 0 && findPossibleMove(grid)) return grid;
    }

    return makePlayableBoard();
  }

  async function shuffleBoard(manual = true, auto = false) {
    if (!auto) {
      if (phase !== 'playing' || busy) return;
      if (manual && shufflesLeft <= 0) {
        showToast('本关洗牌次数已经用完啦');
        return;
      }
    }

    busy = true;
    clearTimeout(hintTimer);
    clearHintHighlight();
    clearSelection();
    pointerStart = null;
    dragTriggered = false;

    if (manual) {
      shufflesLeft = Math.max(0, shufflesLeft - 1);
      updateHUD();
      playSound('shuffle');
    }

    dom.board.classList.add('shuffling');
    await sleep(220);

    board = buildShuffledBoard();
    dom.effects.innerHTML = '';
    renderBoard(true);
    dom.board.classList.remove('shuffling');
    await sleep(520);

    updateHUD();
    if (manual) showToast('洗牌完成，继续加油！');

    busy = false;
    if (phase === 'playing') scheduleHint();
  }

  /* ---------------- 提示 ---------------- */
  function showHint(manual = true) {
    if (phase !== 'playing' || busy) return;
    clearHintHighlight();

    const move = findPossibleMove();
    if (!move) {
      showToast('暂时没有可消除的组合，正在自动洗牌…');
      shuffleBoard(false, true);
      return;
    }

    if (manual) {
      if (hintsLeft <= 0) {
        showToast('本关提示次数已经用完啦');
        return;
      }
      hintsLeft = Math.max(0, hintsLeft - 1);
      updateHUD();
    }

    for (const pos of [move.a, move.b]) {
      const el = getTileAt(pos.r, pos.c);
      if (el) el.classList.add('hinted');
    }

    playSound('hint');
    hintClearTimer = setTimeout(clearHintHighlight, 3000);
    scheduleHint();
  }

  /* ---------------- 关卡流程 ---------------- */
  function resetLevelStats() {
    target = BASE_TARGET + (level - 1) * TARGET_STEP;
    levelScore = 0;
    movesLeft = BASE_MOVES;
    hintsLeft = START_HINTS;
    shufflesLeft = START_SHUFFLES;
    maxCombo = 1;
  }

  async function setupLevel() {
    phase = 'busy';
    busy = true;
    selected = null;
    pointerStart = null;
    dragTriggered = false;
    clearTimeout(hintTimer);
    clearTimeout(hintClearTimer);
    dom.comboBanner.classList.remove('show');
    resetLevelStats();
    updateHUD();

    board = makePlayableBoard();
    dom.effects.innerHTML = '';
    renderBoard(true);
    await sleep(700);

    busy = false;
    phase = 'playing';
    updateHUD();
    scheduleHint();
  }

  async function startGame() {
    if (phase !== 'intro') return;
    closeOverlay();
    playSound('start');
    level = 1;
    await setupLevel();
    showToast('拖动或点击交换相邻水果，连成三个就能消除！', 2800);
  }

  async function nextLevel() {
    closeOverlay();
    level += 1;
    await setupLevel();
    showToast(`第 ${level} 关 · 目标 ${fmt(target)} 分`, 2200);
  }

  async function replayLevel() {
    closeOverlay();
    await setupLevel();
  }

  async function restartLevel() {
    closeOverlay();
    await setupLevel();
  }

  function resumeGame() {
    if (phase !== 'paused' && phase !== 'confirm') return;
    closeOverlay();
    phase = 'playing';
    busy = false;
    updateHUD();
    scheduleHint();
  }

  /* ---------------- 指针 / 触控操作 ---------------- */
  function cellFromPointer(event) {
    const rect = dom.board.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    return {
      r: clamp(Math.floor((y / rect.height) * ROWS), 0, ROWS - 1),
      c: clamp(Math.floor((x / rect.width) * COLS), 0, COLS - 1),
    };
  }

  function findCellPositionById(id) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]?.id === Number(id)) return { r, c };
      }
    }
    return null;
  }

  function handleTap(r, c) {
    if (phase !== 'playing' || busy) return;
    clearTimeout(hintTimer);
    const pos = { r, c };

    if (selected && selected.r === r && selected.c === c) {
      clearSelection();
      scheduleHint();
      return;
    }

    if (selected && isAdjacent(selected, pos)) {
      const from = selected;
      clearSelection();
      attemptSwap(from, pos);
      return;
    }

    selectCell(r, c);
    if (soundOn) tone(560, 0.045, { type: 'sine', volume: 0.012 });
    scheduleHint();
  }

  function onPointerDown(event) {
    if (phase !== 'playing' || busy) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const pos = cellFromPointer(event);
    if (!pos) return;
    event.preventDefault();
    pointerStart = { ...pos, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    dragTriggered = false;
    clearTimeout(hintTimer);
    clearHintHighlight();
    try { dom.board.setPointerCapture(event.pointerId); } catch (_) { /* 忽略 */ }
  }

  function onPointerMove(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId || dragTriggered) return;
    if (phase !== 'playing' || busy) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 17) return;

    let target = null;
    if (Math.abs(dx) >= Math.abs(dy)) {
      target = { r: pointerStart.r, c: pointerStart.c + (dx > 0 ? 1 : -1) };
    } else {
      target = { r: pointerStart.r + (dy > 0 ? 1 : -1), c: pointerStart.c };
    }
    if (target.r < 0 || target.r >= ROWS || target.c < 0 || target.c >= COLS) return;

    dragTriggered = true;
    const from = { r: pointerStart.r, c: pointerStart.c };
    pointerStart = null;
    attemptSwap(from, target);
  }

  function onPointerUp(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    const start = pointerStart;
    pointerStart = null;
    if (dragTriggered) return;
    if (phase !== 'playing' || busy) return;

    const pos = cellFromPointer(event);
    if (!pos) return;

    if (pos.r !== start.r || pos.c !== start.c) {
      if (isAdjacent(start, pos)) attemptSwap(start, pos);
      else handleTap(start.r, start.c);
    } else {
      handleTap(start.r, start.c);
    }
  }

  function cancelPointer() {
    pointerStart = null;
    dragTriggered = false;
  }

  /* ---------------- 结算弹窗后的按钮 ---------------- */
  function onOverlayAction(action) {
    switch (action) {
      case 'start':
        startGame();
        break;
      case 'resume':
        resumeGame();
        break;
      case 'restart':
        restartLevel();
        break;
      case 'next':
        nextLevel();
        break;
      case 'replay':
        replayLevel();
        break;
      case 'retry':
        replayLevel();
        break;
      default:
        break;
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    dom.board.addEventListener('pointerdown', onPointerDown);
    dom.board.addEventListener('pointermove', onPointerMove);
    dom.board.addEventListener('pointerup', onPointerUp);
    dom.board.addEventListener('pointercancel', cancelPointer);

    dom.tileLayer.addEventListener('click', (event) => {
      if (event.detail !== 0) return; // 键盘触发才处理，鼠标/触控由 pointer 事件负责
      const tile = event.target.closest('.tile');
      if (!tile) return;
      const pos = findCellPositionById(tile.dataset.id);
      if (pos) handleTap(pos.r, pos.c);
    });

    dom.soundBtn.addEventListener('click', toggleSound);

    dom.pauseBtn.addEventListener('click', () => {
      if (phase === 'playing' && !busy) showPause();
      else if (phase === 'paused') resumeGame();
    });

    dom.hintBtn.addEventListener('click', () => {
      if (phase !== 'playing' || busy) return;
      showHint(true);
    });

    dom.shuffleBtn.addEventListener('click', () => {
      if (phase !== 'playing' || busy) return;
      shuffleBoard(true, false);
    });

    dom.restartBtn.addEventListener('click', () => {
      if (phase === 'playing' || phase === 'paused') showRestartConfirm();
    });

    dom.overlayCard.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      onOverlayAction(button.dataset.action);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (phase === 'playing' && !busy) showPause();
      else if (phase === 'paused' || phase === 'confirm') resumeGame();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && phase === 'playing' && !busy) showPause();
    });

    window.addEventListener('resize', () => {
      // CSS 百分比坐标会自动适配，这里仅清理可能残留的指针状态
      cancelPointer();
    }, { passive: true });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    bestScore = Number(loadStore(LS_BEST, 0)) || 0;
    soundOn = loadStore(LS_SOUND, '1') !== '0';
    updateSoundUI();

    createBoardBackground();
    bindEvents();

    level = 1;
    resetLevelStats();
    board = makePlayableBoard();
    renderBoard(true);
    updateHUD();
    showIntro();

    dom.overlay.setAttribute('aria-hidden', 'false');
    dom.pauseBtn.disabled = true;
  }

  init();
})();
