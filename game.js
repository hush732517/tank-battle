'use strict';

/* =====================================================================
 *  坦克大战 Tank Battle
 *  纯原生 JavaScript + Canvas 实现，无任何依赖。
 *  打开 index.html 即可游玩。
 * ===================================================================== */

// ---------------------------------------------------------------- 常量 --
const TILE = 32;          // 每个格子像素
const COLS = 15;          // 地图列数
const ROWS = 15;          // 地图行数
const HUD_W = 184;        // 右侧信息栏宽度
const W = COLS * TILE + HUD_W;   // 画布总宽
const H = ROWS * TILE;           // 画布总高

// 格子类型
const EMPTY = 0;
const BRICK = 1;
const STEEL = 2;
const WATER = 3;
const GRASS = 4;
const BASE  = 5;

// 方向
const DIRS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1  },
  left:  { dx: -1, dy: 0  },
  right: { dx: 1,  dy: 0  },
};
const DIR_ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
const DIRS_ALL = ['up', 'down', 'left', 'right'];

// 地图（. 空  # 砖  @ 钢  ~ 水  % 草  B 基地）
const MAP = [
  "...............",
  "...............",
  ".#.#.#.#.#.#.#.",
  "...............",
  ".#.#.#.#.#.#.#.",
  "..%..%...%..%..",
  ".###.......###.",
  ".@...........@.",
  ".###..~~~..###.",
  "..%...%%%...%..",
  "...............",
  "..#..#####..#..",
  "..#..#...#..#..",
  "......###......",
  "......#B#......",
];

const BASE_X = 7;         // 基地坐标（格子）
const BASE_Y = 14;
const SPAWN_POINTS = [0, 7, 14]; // 敌方出生点（列）

// 敌方类型
const ENEMY_TYPES = {
  basic: { hp: 1, speed: 95,  bulletSpeed: 260, color: '#d7dee3', name: '普通' },
  fast:  { hp: 1, speed: 175, bulletSpeed: 260, color: '#5bd8f0', name: '快速' },
  power: { hp: 1, speed: 95,  bulletSpeed: 420, color: '#f0a030', name: '火力' },
  armor: { hp: 3, speed: 75,  bulletSpeed: 300, color: '#5ac85a', name: '装甲' },
};

// 玩家武器等级
const WEAPONS = [
  { level: 0, maxBullets: 1, speed: 320, reload: 0.45, steel: false }, // 未使用
  { level: 1, maxBullets: 1, speed: 340, reload: 0.45, steel: false },
  { level: 2, maxBullets: 2, speed: 420, reload: 0.32, steel: false },
  { level: 3, maxBullets: 3, speed: 520, reload: 0.24, steel: true  },
];

// 道具
const POWERUP_TYPES = ['star', 'shield', 'life', 'bomb', 'freeze'];
const POWERUP_META = {
  star:   { label: '★', color: '#ffd23f', text: '武器升级' },
  shield: { label: '▲', color: '#4fc3f7', text: '护盾' },
  life:   { label: '♥', color: '#ff5b6a', text: '加命' },
  bomb:   { label: '●', color: '#cfd8dc', text: '炸弹' },
  freeze: { label: '❄', color: '#7ee6e6', text: '冰冻' },
};

// ---------------------------------------------------------------- 画布 --
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W;
canvas.height = H;

// ---------------------------------------------------------------- 状态 --
let grid = [];            // 二维格子类型数组
let player = null;
let enemies = [];
let bullets = [];
let powerups = [];
let particles = [];

let state = 'menu';       // menu | playing | levelclear | gameover
let level = 1;
let score = 0;
let highScore = 0;
let lives = 3;
let enemiesTotal = 0;     // 本关敌人总数
let enemiesLeft = 0;      // 剩余待出生敌人
let spawnTimer = 0;
let levelIntro = 0;       // 关卡提示显示计时
let freezeTimer = 0;      // 敌人冰冻剩余时间
let baseAlive = true;

let muted = false;
let paused = false;
let time = 0;             // 全局计时（用于动画）

try { highScore = parseInt(localStorage.getItem('tankHighScore') || '0', 10) || 0; } catch (e) { highScore = 0; }

// ---------------------------------------------------------------- 音效 --
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(freq, dur, type, vol, slide) {
  if (muted) return;
  try {
    ensureAudio();
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* 忽略音频错误 */ }
}
function sfx(name) {
  switch (name) {
    case 'shoot':   beep(240, 0.08, 'square', 0.08, -90); break;
    case 'boom':    beep(110, 0.32, 'sawtooth', 0.22, -70); break;
    case 'hit':     beep(520, 0.05, 'square', 0.10, 0); break;
    case 'pickup':  beep(620, 0.10, 'triangle', 0.16, 240); break;
    case 'base':    beep(80, 0.9, 'sawtooth', 0.28, -40); break;
    case 'start':   beep(440, 0.12, 'triangle', 0.18, 0); break;
    case 'die':     beep(200, 0.4, 'sawtooth', 0.2, -140); break;
  }
}

// ---------------------------------------------------------------- 工具 --
function rnd(a, b) { return a + Math.random() * (b - a); }
function rndInt(a, b) { return Math.floor(rnd(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

// ---------------------------------------------------------------- 地图 --
function buildGrid() {
  grid = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const c = MAP[y][x];
      let t = EMPTY;
      if (c === '#') t = BRICK;
      else if (c === '@') t = STEEL;
      else if (c === '~') t = WATER;
      else if (c === '%') t = GRASS;
      else if (c === 'B') t = BASE;
      row.push(t);
    }
    grid.push(row);
  }
}

function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return STEEL; // 边界视为墙
  return grid[ty][tx];
}

function tileSolidForTank(t) {
  return t === BRICK || t === STEEL || t === WATER || t === BASE;
}

// ---------------------------------------------------------------- 坦克 --
function spawnTank(tx, ty, opts) {
  return {
    kind: opts.kind,             // 'player' | 'enemy'
    tx: tx, ty: ty,
    x: tx * TILE, y: ty * TILE,  // 像素坐标（动画插值）
    dir: 'up', desired: 'down',
    moving: false,
    speed: opts.speed,
    hp: opts.hp || 1,
    color: opts.color,
    type: opts.type || null,
    alive: true,
    cooldown: 0,
    fireTimer: rnd(0.5, 1.5),     // 敌人开火计时
    thinkTimer: rnd(0.3, 1.0),    // 敌人转向计时
    shield: 0,                    // 护盾剩余时间
    bulletSpeed: opts.bulletSpeed || 320,
    steel: opts.steel || false,
  };
}

function allTanks() {
  const list = [];
  if (player && player.alive) list.push(player);
  for (const e of enemies) if (e.alive) list.push(e);
  return list;
}

// 某个格子是否被坦克占用（用于移动判断）
function occupied(nx, ny, self) {
  for (const t of allTanks()) {
    if (t === self) continue;
    // 目标格子 或 当前正在过渡的格子
    if ((t.tx === nx && t.ty === ny)) return true;
    if (t.moving && Math.round(t.x / TILE) === nx && Math.round(t.y / TILE) === ny) return true;
  }
  return false;
}

// 格子是否可进入
function isFree(nx, ny, self) {
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return false;
  if (tileSolidForTank(tileAt(nx, ny))) return false;
  return !occupied(nx, ny, self);
}

function advanceTank(t, dt) {
  if (!t.moving) return;
  const step = t.speed * dt;
  const gx = t.tx * TILE, gy = t.ty * TILE;
  if (t.dir === 'up')    { t.y -= step; if (t.y <= gy) { t.y = gy; t.moving = false; } }
  else if (t.dir === 'down')  { t.y += step; if (t.y >= gy) { t.y = gy; t.moving = false; } }
  else if (t.dir === 'left')  { t.x -= step; if (t.x <= gx) { t.x = gx; t.moving = false; } }
  else                        { t.x += step; if (t.x >= gx) { t.x = gx; t.moving = false; } }
}

function updateTankMove(t) {
  if (t.moving) return;
  if (!t.desired) return;
  const d = DIRS[t.desired];
  const nx = t.tx + d.dx, ny = t.ty + d.dy;
  t.dir = t.desired;
  if (isFree(nx, ny, t)) {
    t.tx = nx;
    t.ty = ny;
    t.moving = true;
  }
}

function centerOf(t) {
  return { x: t.x + TILE / 2, y: t.y + TILE / 2 };
}

// ---------------------------------------------------------------- 子弹 --
function canFire(t) {
  let count = 0;
  for (const b of bullets) if (b.alive && b.owner === t) count++;
  if (t.kind === 'player') return count < WEAPONS[playerWeaponLevel()].maxBullets;
  return count < 1; // 敌人最多同时一发
}

function playerWeaponLevel() {
  return clamp(player.weaponLevel || 1, 1, 3);
}

function fire(t) {
  if (t.cooldown > 0) return;
  if (!canFire(t)) return;
  t.cooldown = (t.kind === 'player') ? WEAPONS[playerWeaponLevel()].reload : 0.9;
  const c = centerOf(t);
  const d = DIRS[t.dir];
  const speed = (t.kind === 'player') ? WEAPONS[playerWeaponLevel()].speed : t.bulletSpeed;
  bullets.push({
    x: c.x + d.dx * (TILE / 2),
    y: c.y + d.dy * (TILE / 2),
    dir: t.dir,
    speed: speed,
    owner: t,
    ownerKind: t.kind,
    steel: (t.kind === 'player') ? WEAPONS[playerWeaponLevel()].steel : false,
    alive: true,
  });
  sfx('shoot');
}

function updateBullets(dt) {
  for (const b of bullets) {
    if (!b.alive) continue;
    const d = DIRS[b.dir];
    b.x += d.dx * b.speed * dt;
    b.y += d.dy * b.speed * dt;

    // 出界
    if (b.x < 0 || b.y < 0 || b.x >= COLS * TILE || b.y >= ROWS * TILE) {
      b.alive = false;
      continue;
    }

    // 与格子碰撞
    const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
    const tile = tileAt(tx, ty);
    if (tile === BRICK) {
      destroyBrick(tx, ty);
      b.alive = false;
      continue;
    } else if (tile === STEEL) {
      if (b.steel) { destroySteel(tx, ty); }
      else sfx('hit');
      spawnSpark(b.x, b.y);
      b.alive = false;
      continue;
    } else if (tile === BASE) {
      b.alive = false;
      if (b.ownerKind === 'enemy') destroyBase();
      else spawnSpark(b.x, b.y);
      continue;
    }

    // 与坦克碰撞
    for (const t of allTanks()) {
      if (b.ownerKind === t.kind) continue; // 不误伤友军
      if (bulletHitsTank(b, t)) {
        b.alive = false;
        hitTank(t, b);
        break;
      }
    }
    if (!b.alive) continue;

    // 子弹互撞（玩家子弹与敌方子弹相互抵消）
    for (const o of bullets) {
      if (o === b || !o.alive) continue;
      if (o.ownerKind === b.ownerKind) continue;
      if (Math.abs(o.x - b.x) < 6 && Math.abs(o.y - b.y) < 6) {
        b.alive = false; o.alive = false;
        spawnSpark(b.x, b.y);
        break;
      }
    }
  }
  bullets = bullets.filter(b => b.alive);
}

function bulletHitsTank(b, t) {
  const pad = 4;
  return b.x >= t.x + pad && b.x <= t.x + TILE - pad &&
         b.y >= t.y + pad && b.y <= t.y + TILE - pad;
}

function hitTank(t, b) {
  if (t.shield > 0) { sfx('hit'); spawnSpark(b.x, b.y); return; }
  t.hp -= 1;
  if (t.hp > 0) {
    sfx('hit');
    spawnSpark(b.x, b.y);
    t.color = ENEMY_TYPES.armor.color; // 装甲挨打后颜色变化
    return;
  }
  destroyTank(t);
}

function destroyTank(t) {
  if (!t.alive) return;
  t.alive = false;
  spawnExplosion(t.x + TILE / 2, t.y + TILE / 2, t.color || '#ffd23f', 1.0);
  sfx('boom');
  if (t.kind === 'enemy') {
    const meta = ENEMY_TYPES[t.type] || ENEMY_TYPES.basic;
    const pts = { basic: 100, fast: 200, power: 300, armor: 400 }[t.type] || 100;
    score += pts;
    updateHighScore();
    // 概率掉落道具
    if (Math.random() < 0.18 && tileAt(t.tx, t.ty) === EMPTY) {
      dropPowerup(t.tx, t.ty);
    }
    enemies = enemies.filter(e => e !== t);
    checkLevelClear();
  } else {
    lives--;
    sfx('die');
    if (lives <= 0) {
      gameOver();
    } else {
      respawnPlayer();
    }
  }
}

function respawnPlayer() {
  player = spawnTank(4, 14, {
    kind: 'player', speed: 150, hp: 1, color: '#ffd23f',
    bulletSpeed: 320, weaponLevel: 1,
  });
  player.shield = 3; // 重生无敌
  player.dir = 'up'; player.desired = 'up';
}

// ---------------------------------------------------------------- 墙体 --
function destroyBrick(tx, ty) {
  grid[ty][tx] = EMPTY;
  spawnExplosion(tx * TILE + TILE / 2, ty * TILE + TILE / 2, '#c96f3a', 0.5);
  sfx('hit');
}

function destroySteel(tx, ty) {
  grid[ty][tx] = EMPTY;
  spawnExplosion(tx * TILE + TILE / 2, ty * TILE + TILE / 2, '#9aa7b0', 0.5);
  sfx('hit');
}

function destroyBase() {
  if (!baseAlive) return;
  baseAlive = false;
  grid[BASE_Y][BASE_X] = EMPTY;
  spawnExplosion(BASE_X * TILE + TILE / 2, BASE_Y * TILE + TILE / 2, '#ff5b6a', 2.0);
  sfx('base');
  gameOver();
}

// ---------------------------------------------------------------- 道具 --
function dropPowerup(tx, ty) {
  const type = POWERUP_TYPES[rndInt(0, POWERUP_TYPES.length - 1)];
  powerups.push({ tx, ty, type, x: tx * TILE, y: ty * TILE, alive: true });
}

function collectPowerups() {
  if (!player) return;
  const px = player.tx, py = player.ty;
  for (const p of powerups) {
    if (!p.alive) continue;
    if (p.tx === px && p.ty === py) {
      p.alive = false;
      applyPowerup(p.type);
      sfx('pickup');
    }
  }
  powerups = powerups.filter(p => p.alive);
}

function applyPowerup(type) {
  switch (type) {
    case 'star':
      player.weaponLevel = clamp((player.weaponLevel || 1) + 1, 1, 3);
      break;
    case 'shield':
      player.shield = 8;
      break;
    case 'life':
      lives = Math.min(lives + 1, 9);
      break;
    case 'bomb':
      for (const e of enemies.slice()) if (e.alive) {
        score += 50;
        e.alive = false;
        spawnExplosion(e.x + TILE / 2, e.y + TILE / 2, '#ffffff', 1.0);
      }
      enemies = enemies.filter(e => e.alive);
      sfx('boom');
      checkLevelClear();
      break;
    case 'freeze':
      freezeTimer = 6;
      break;
  }
}

// ---------------------------------------------------------------- 粒子 --
function spawnExplosion(x, y, color, size) {
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(30, 160);
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rnd(0.25, 0.6), maxLife: 0.6,
      color, size: rnd(2, 5) * size,
    });
  }
}

function spawnSpark(x, y) {
  for (let i = 0; i < 5; i++) {
    const a = rnd(0, Math.PI * 2);
    const sp = rnd(20, 90);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: rnd(0.1, 0.25), maxLife: 0.25, color: '#ffffff', size: rnd(1.5, 3),
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.92;
    p.vy *= 0.92;
    p.life -= dt;
  }
  particles = particles.filter(p => p.life > 0);
}

// ---------------------------------------------------------------- 敌人 --
function pickEnemyType() {
  const r = Math.random();
  if (level >= 3 && r < 0.18) return 'armor';
  if (level >= 2 && r < 0.38) return 'power';
  if (r < 0.60) return 'basic';
  if (r < 0.82) return 'fast';
  return 'power';
}

function spawnEnemy() {
  if (enemiesLeft <= 0) return;
  if (enemies.length >= 4) return; // 场上最多 4 个
  const freePoints = SPAWN_POINTS.filter(p => isFree(p, 0, null));
  if (freePoints.length === 0) return;
  const sx = freePoints[rndInt(0, freePoints.length - 1)];
  const type = pickEnemyType();
  const meta = ENEMY_TYPES[type];
  const e = spawnTank(sx, 0, {
    kind: 'enemy', speed: meta.speed + (level - 1) * 6,
    hp: meta.hp, color: meta.color, type: type,
    bulletSpeed: meta.bulletSpeed,
  });
  e.dir = 'down'; e.desired = 'down';
  enemies.push(e);
  enemiesLeft--;
}

function enemyThink(e) {
  // 一定概率朝基地推进，其余随机
  if (Math.random() < 0.32) {
    const cx = e.tx * TILE + TILE / 2;
    const bx = BASE_X * TILE + TILE / 2;
    const dx = bx - cx;
    if (e.ty >= BASE_Y - 2 || Math.abs(dx) < TILE) e.desired = 'down';
    else e.desired = dx > 0 ? 'right' : 'left';
  } else {
    e.desired = DIRS_ALL[rndInt(0, 3)];
  }
}

function updateEnemies(dt) {
  const frozen = freezeTimer > 0;
  for (const e of enemies) {
    if (!e.alive) continue;
    e.cooldown -= dt;
    if (frozen) {
      advanceTank(e, 0); // 不动
      continue;
    }
    // AI 转向
    e.thinkTimer -= dt;
    if (e.thinkTimer <= 0) {
      e.thinkTimer = rnd(0.4, 1.2);
      enemyThink(e);
    }
    // 若当前方向被堵，换方向
    if (!e.moving) {
      const d = DIRS[e.desired];
      if (!isFree(e.tx + d.dx, e.ty + d.dy, e)) {
        enemyThink(e);
      }
    }
    updateTankMove(e);
    advanceTank(e, dt);
    // 开火
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      e.fireTimer = rnd(1.0, 2.2);
      fire(e);
    }
  }
}

// ---------------------------------------------------------------- 玩家 --
const heldDirs = [];
let fireHeld = false;

function updatePlayer(dt) {
  if (!player || !player.alive) return;
  player.cooldown -= dt;
  if (player.shield > 0) player.shield -= dt;

  if (heldDirs.length > 0) player.desired = heldDirs[heldDirs.length - 1];
  else player.desired = null;

  updateTankMove(player);
  advanceTank(player, dt);

  if (fireHeld) fire(player);
}

// ---------------------------------------------------------------- 关卡 --
function initLevel(n) {
  level = n;
  buildGrid();
  enemies = [];
  bullets = [];
  powerups = [];
  baseAlive = true;
  freezeTimer = 0;
  spawnTimer = 1.2;
  enemiesTotal = 8 + level * 2;
  enemiesLeft = enemiesTotal;
  levelIntro = 1.8;

  respawnPlayer();
  player.weaponLevel = clamp(player.weaponLevel || 1, 1, 3);
  state = 'playing';
}

function updateSpawning(dt) {
  if (enemiesLeft <= 0) return;
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer = rnd(1.6, 3.0);
    spawnEnemy();
  }
}

function checkLevelClear() {
  if (state !== 'playing') return;
  if (enemiesLeft <= 0 && enemies.length === 0) {
    state = 'levelclear';
    sfx('start');
  }
}

function nextLevel() {
  initLevel(level + 1);
}

// ---------------------------------------------------------------- 流程 --
function startGame() {
  score = 0;
  lives = 3;
  initLevel(1);
  sfx('start');
}

function gameOver() {
  state = 'gameover';
  updateHighScore();
}

function updateHighScore() {
  if (score > highScore) {
    highScore = score;
    try { localStorage.setItem('tankHighScore', String(highScore)); } catch (e) {}
  }
}

// ---------------------------------------------------------------- 主循环 --
let last = performance.now();

function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;

  if (!paused) {
    time += dt;

    if (state === 'playing') {
      updatePlayer(dt);
      updateEnemies(dt);
      updateSpawning(dt);
      updateBullets(dt);
      collectPowerups();
      if (freezeTimer > 0) freezeTimer -= dt;
      if (levelIntro > 0) levelIntro -= dt;
    }

    updateParticles(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- 渲染 --
function render() {
  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = '#0d0d0f';
  ctx.fillRect(0, 0, W, H);

  drawTilesBase();
  drawBullets();
  drawTanks();
  drawPowerups();
  drawTilesGrass();
  drawParticles();
  drawHUD();
  drawOverlay();
}

function drawTilesBase() {
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      const t = grid[ty][tx];
      const x = tx * TILE, y = ty * TILE;
      if (t === BRICK) drawBrick(x, y);
      else if (t === STEEL) drawSteel(x, y);
      else if (t === WATER) drawWater(x, y, tx, ty);
      else if (t === BASE) drawBase(x, y);
      else if (t === EMPTY) {
        // 场地暗色底纹
        ctx.fillStyle = '#18181c';
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }
}

function drawTilesGrass() {
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (grid[ty][tx] === GRASS) drawGrass(tx * TILE, ty * TILE, tx, ty);
    }
  }
}

function drawBrick(x, y) {
  ctx.fillStyle = '#a33a1f';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#c96f3a';
  const rows = 4, cols = 2;
  const hh = TILE / rows, hw = TILE / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ox = (r % 2 === 0) ? 0 : hw / 2;
      ctx.fillRect(x + c * hw + ox, y + r * hh, hw - 1, hh - 1);
    }
  }
}

function drawSteel(x, y) {
  ctx.fillStyle = '#7d8a93';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#b6c2ca';
  ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
  ctx.fillStyle = '#5c6870';
  ctx.fillRect(x + 6, y + 6, TILE - 12, TILE - 12);
}

function drawWater(x, y, tx, ty) {
  const w = (Math.floor(time * 2 + tx + ty) % 2 === 0);
  ctx.fillStyle = w ? '#1f4f8f' : '#17518f';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = w ? '#3f7fd0' : '#2f6ab8';
  ctx.fillRect(x + 4, y + 4, TILE - 8, 3);
  ctx.fillRect(x + 10, y + 14, TILE - 16, 3);
  ctx.fillRect(x + 2, y + 24, TILE - 8, 3);
}

function drawGrass(x, y, tx, ty) {
  ctx.fillStyle = '#2f6a2f';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#3f8a3f';
  for (let i = 0; i < 6; i++) {
    const gx = x + ((i * 7 + tx * 3) % TILE);
    const gy = y + ((i * 11 + ty * 5) % TILE);
    ctx.fillRect(gx, gy, 2, 4);
  }
}

function drawBase(x, y) {
  ctx.fillStyle = '#23262b';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#ffd23f';
  // 旗帜
  ctx.fillRect(x + TILE / 2 - 2, y + 4, 4, TILE - 8);
  ctx.fillStyle = '#ff5b6a';
  ctx.beginPath();
  ctx.moveTo(x + TILE / 2, y + 4);
  ctx.lineTo(x + TILE / 2 + 12, y + 10);
  ctx.lineTo(x + TILE / 2, y + 16);
  ctx.closePath();
  ctx.fill();
}

function drawTank(t) {
  ctx.save();
  ctx.translate(t.x + TILE / 2, t.y + TILE / 2);
  ctx.rotate(DIR_ANGLE[t.dir] || 0);

  const blink = t.shield > 0 && Math.floor(time * 8) % 2 === 0;
  const body = blink ? '#ffffff' : t.color;

  // 履带
  ctx.fillStyle = '#1c1c20';
  ctx.fillRect(-14, -14, 6, 28);
  ctx.fillRect(8, -14, 6, 28);
  ctx.fillStyle = '#34343a';
  ctx.fillRect(-14, -12, 2, 24);
  ctx.fillRect(18, -12, 2, 24);

  // 车体
  ctx.fillStyle = body;
  ctx.fillRect(-9, -12, 18, 24);

  // 炮管
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(-2, -18, 4, 8);

  // 炮塔
  ctx.fillStyle = body;
  ctx.fillRect(-6, -14, 12, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-6, -14, 12, 3);

  ctx.restore();
}

function drawBullets() {
  for (const b of bullets) {
    if (!b.alive) continue;
    ctx.fillStyle = '#fff8d0';
    ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
  }
}

function drawPowerups() {
  for (const p of powerups) {
    if (!p.alive) continue;
    const x = p.x, y = p.y;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x + 4, y + 4, TILE - 8, TILE - 8);
    const meta = POWERUP_META[p.type];
    ctx.fillStyle = meta.color;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.label, x + TILE / 2, y + TILE / 2 + 1);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.4 * pulse).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const hx = COLS * TILE;
  // 面板背景
  ctx.fillStyle = '#16161a';
  ctx.fillRect(hx, 0, HUD_W, H);
  ctx.fillStyle = '#23252b';
  ctx.fillRect(hx + 8, 8, HUD_W - 16, H - 16);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = 24;

  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.fillText('坦克大战', hx + 24, y);
  y += 40;

  ctx.fillStyle = '#9aa4ad';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('分数 SCORE', hx + 24, y);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillText(String(score), hx + 24, y + 18);
  y += 52;

  ctx.fillStyle = '#9aa4ad';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('最高分 BEST', hx + 24, y);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillText(String(highScore), hx + 24, y + 18);
  y += 46;

  // 生命
  ctx.fillStyle = '#9aa4ad';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('生命 LIVES', hx + 24, y);
  for (let i = 0; i < lives; i++) {
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(hx + 24 + (i % 5) * 22, y + 22 + Math.floor(i / 5) * 22, 16, 16);
    ctx.fillStyle = '#1c1c20';
    ctx.fillRect(hx + 26 + (i % 5) * 22, y + 24 + Math.floor(i / 5) * 22, 4, 12);
    ctx.fillRect(hx + 34 + (i % 5) * 22, y + 24 + Math.floor(i / 5) * 22, 4, 12);
  }
  y += 62;

  // 关卡
  ctx.fillStyle = '#9aa4ad';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('关卡 LEVEL', hx + 24, y);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText(String(level), hx + 24, y + 18);
  y += 50;

  // 剩余敌人
  ctx.fillStyle = '#9aa4ad';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('敌人 ENEMIES', hx + 24, y);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText(String(Math.max(0, enemiesLeft + enemies.length)), hx + 24, y + 18);
  y += 52;

  // 武器等级
  ctx.fillStyle = '#9aa4ad';
  ctx.font = '13px "Segoe UI", sans-serif';
  ctx.fillText('武器 POWER', hx + 24, y);
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillText('★'.repeat(playerWeaponLevel()), hx + 24, y + 18);
  y += 56;

  // 操作说明
  ctx.fillStyle = '#6a737c';
  ctx.font = '12px "Segoe UI", sans-serif';
  ctx.fillText('方向键 / WASD  移动', hx + 24, y);
  ctx.fillText('空格 / J  射击', hx + 24, y + 18);
  ctx.fillText('P  暂停   M  静音', hx + 24, y + 36);
  ctx.fillText(muted ? '声音：关' : '声音：开', hx + 24, y + 54);
}

function drawOverlay() {
  if (paused) {
    dim();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.fillText('已暂停', W / 2, H / 2 - 10);
    ctx.fillStyle = '#9aa4ad';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('按 P 继续', W / 2, H / 2 + 34);
    return;
  }
  if (state === 'menu') {
    dim();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.fillText('坦克大战', W / 2, H / 2 - 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('保护基地，消灭所有敌人', W / 2, H / 2 - 10);
    ctx.fillStyle = '#9aa4ad';
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillText('方向键移动 · 空格射击', W / 2, H / 2 + 30);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    const blink = Math.floor(time * 2) % 2 === 0;
    if (blink) ctx.fillText('按 Enter 开始', W / 2, H / 2 + 80);
  } else if (state === 'levelclear') {
    dim();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 34px "Segoe UI", sans-serif';
    ctx.fillText('关卡 ' + level + ' 完成！', W / 2, H / 2 - 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillText('准备进入下一关…', W / 2, H / 2 + 28);
  } else if (state === 'gameover') {
    dim();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff5b6a';
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.fillText('游戏结束', W / 2, H / 2 - 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px "Segoe UI", sans-serif';
    ctx.fillText('得分：' + score, W / 2, H / 2 - 10);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    const blink = Math.floor(time * 2) % 2 === 0;
    if (blink) ctx.fillText('按 Enter 重新开始', W / 2, H / 2 + 40);
  }

  // 关卡提示
  if (state === 'playing' && levelIntro > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(W / 2 - 120, H / 2 - 40, 240, 80);
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 30px "Segoe UI", sans-serif';
    ctx.fillText('关卡 ' + level, W / 2, H / 2);
  }
}

function dim() {
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- 输入 --
const KEY_DIR = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

function isFireKey(code) { return code === 'Space' || code === 'KeyJ'; }

window.addEventListener('keydown', (e) => {
  if (e.code in KEY_DIR) {
    e.preventDefault();
    const dir = KEY_DIR[e.code];
    if (!heldDirs.includes(dir)) heldDirs.push(dir);
    ensureAudio();
    return;
  }
  if (isFireKey(e.code)) {
    e.preventDefault();
    fireHeld = true;
    ensureAudio();
    if (state === 'menu') { startGame(); }
    return;
  }
  if (e.code === 'Enter') {
    e.preventDefault();
    if (state === 'menu' || state === 'gameover') startGame();
    else if (state === 'levelclear') nextLevel();
    return;
  }
  if (e.code === 'KeyP') {
    e.preventDefault();
    if (state === 'playing' || paused) paused = !paused;
  }
  if (e.code === 'KeyM') {
    muted = !muted;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code in KEY_DIR) {
    const dir = KEY_DIR[e.code];
    const i = heldDirs.indexOf(dir);
    if (i >= 0) heldDirs.splice(i, 1);
  }
  if (isFireKey(e.code)) fireHeld = false;
});

canvas.addEventListener('mousedown', () => {
  ensureAudio();
  if (state === 'menu') startGame();
});

// ---------------------------------------------------------------- 启动 --
requestAnimationFrame((now) => { last = now; loop(now); });
