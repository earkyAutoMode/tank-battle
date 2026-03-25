// 坦克大战 (Battle City) - 核心逻辑 (Pure JS)

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const uiOverlay = document.getElementById('ui-overlay');
const statusOverlay = document.getElementById('status-overlay');
const statusText = document.getElementById('status-text');
const finalScoreEl = document.getElementById('final-score');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const enemyCountEl = document.getElementById('enemy-count');

// 游戏常量
const GRID_SIZE = 24; // 每个网格大小
const MAP_COLS = 26; // 624 / 24
const MAP_ROWS = 26; 
const TANK_SIZE = 48; // 坦克跨度 2x2 网格
const BULLET_SIZE = 6;
const TANK_SPEED = 2;
const BULLET_SPEED = 5;

// 地图元素枚举
const EMPTY = 0, BRICK = 1, STEEL = 2, BASE = 3, PLAYER_SPAWN = 4, ENEMY_SPAWN = 5;

// 方向常量
const UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;

// 游戏状态
let gameRunning = false;
let score = 0;
let lives = 3;
let enemiesToSpawn = 10;
let activeEnemies = [];
let bullets = [];
let player = null;
let mapData = [];

// 键盘控制
const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// 基础关卡地图布局 (26x26)
function generateMap() {
    const map = Array(MAP_ROWS).fill(0).map(() => Array(MAP_COLS).fill(EMPTY));
    
    // 围墙边缘 (简单起见不做，只做内部元素)
    
    // 基地老鹰 (位置固定在底部中央)
    map[25][12] = BASE;
    map[25][13] = BASE;
    map[24][12] = BASE;
    map[24][13] = BASE;
    
    // 基地保护砖墙
    const baseProtection = [[23,11],[23,12],[23,13],[23,14],[24,11],[24,14],[25,11],[25,14]];
    baseProtection.forEach(([r,c]) => map[r][c] = BRICK);

    // 随机生成一些砖墙和钢墙
    for(let i=0; i<MAP_ROWS-4; i+=2) {
        for(let j=0; j<MAP_COLS; j+=2) {
            if(Math.random() < 0.3) {
                const type = Math.random() < 0.8 ? BRICK : STEEL;
                map[i][j] = type;
                map[i+1][j] = type;
                map[i][j+1] = type;
                map[i+1][j+1] = type;
            }
        }
    }
    
    // 清除玩家和敌人出生点
    for(let r=0; r<4; r++) for(let c=0; c<4; c++) map[r][c] = EMPTY; // 敌人 spawn
    for(let r=MAP_ROWS-4; r<MAP_ROWS; r++) for(let c=8; c<18; c++) {
        if(map[r][c] !== BASE) map[r][c] = EMPTY;
    }
    
    return map;
}

// 坦克基类
class Tank {
    constructor(x, y, color, isPlayer = false) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.dir = UP;
        this.size = TANK_SIZE;
        this.speed = TANK_SPEED;
        this.isPlayer = isPlayer;
        this.cooldown = 0;
        this.lastShot = 0;
    }

    draw() {
        ctx.fillStyle = this.color;
        // 简单画个坦克外形
        ctx.fillRect(this.x, this.y, this.size, this.size);
        
        // 画炮管
        ctx.fillStyle = "#fff";
        const centerX = this.x + this.size / 2;
        const centerY = this.y + this.size / 2;
        const barrelLen = 15;
        const barrelWidth = 6;

        if (this.dir === UP) ctx.fillRect(centerX - barrelWidth/2, this.y - barrelLen, barrelWidth, barrelLen + 10);
        if (this.dir === DOWN) ctx.fillRect(centerX - barrelWidth/2, this.y + this.size - 10, barrelWidth, barrelLen + 10);
        if (this.dir === LEFT) ctx.fillRect(this.x - barrelLen, centerY - barrelWidth/2, barrelLen + 10, barrelWidth);
        if (this.dir === RIGHT) ctx.fillRect(this.x + this.size - 10, centerY - barrelWidth/2, barrelLen + 10, barrelWidth);
    }

    move() {
        let nextX = this.x;
        let nextY = this.y;

        if (this.dir === UP) nextY -= this.speed;
        if (this.dir === DOWN) nextY += this.speed;
        if (this.dir === LEFT) nextX -= this.speed;
        if (this.dir === RIGHT) nextX += this.speed;

        if (!this.checkCollision(nextX, nextY)) {
            this.x = nextX;
            this.y = nextY;
            return true;
        }
        return false;
    }

    checkCollision(nx, ny) {
        // 边界检测
        if (nx < 0 || nx + this.size > canvas.width || ny < 0 || ny + this.size > canvas.height) return true;

        // 地图元素检测 (检测坦克覆盖的所有网格)
        const colStart = Math.floor(nx / GRID_SIZE);
        const colEnd = Math.floor((nx + this.size - 1) / GRID_SIZE);
        const rowStart = Math.floor(ny / GRID_SIZE);
        const rowEnd = Math.floor((ny + this.size - 1) / GRID_SIZE);

        for (let r = rowStart; r <= rowEnd; r++) {
            for (let c = colStart; c <= colEnd; c++) {
                if (mapData[r][c] === BRICK || mapData[r][c] === STEEL || mapData[r][c] === BASE) {
                    return true;
                }
            }
        }

        // 坦克间碰撞 (此处略去简化版逻辑，只做墙体碰撞)
        return false;
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShot < 800) return; // 800ms 冷却
        
        this.lastShot = now;
        const centerX = this.x + this.size / 2;
        const centerY = this.y + this.size / 2;
        bullets.push(new Bullet(centerX - BULLET_SIZE/2, centerY - BULLET_SIZE/2, this.dir, this.isPlayer));
    }
}

// 子弹类
class Bullet {
    constructor(x, y, dir, isPlayer) {
        this.x = x;
        this.y = y;
        this.dir = dir;
        this.speed = BULLET_SPEED;
        this.isPlayer = isPlayer;
        this.size = BULLET_SIZE;
        this.active = true;
    }

    update() {
        if (this.dir === UP) this.y -= this.speed;
        if (this.dir === DOWN) this.y += this.speed;
        if (this.dir === LEFT) this.x -= this.speed;
        if (this.dir === RIGHT) this.x += this.speed;

        // 边界检测
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
            return;
        }

        // 地图碰撞
        const r = Math.floor(this.y / GRID_SIZE);
        const c = Math.floor(this.x / GRID_SIZE);
        
        if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) {
            const cell = mapData[r][c];
            if (cell === BRICK) {
                mapData[r][c] = EMPTY; // 摧毁砖块
                this.active = false;
            } else if (cell === STEEL) {
                this.active = false; // 钢块不坏
            } else if (cell === BASE) {
                gameOver("基地被毁！任务失败");
                this.active = false;
            }
        }

        // 坦克碰撞检测
        if (this.isPlayer) {
            activeEnemies.forEach(enemy => {
                if (this.rectIntersect(this.x, this.y, this.size, this.size, enemy.x, enemy.y, enemy.size, enemy.size)) {
                    enemy.dead = true;
                    this.active = false;
                    score += 100;
                    scoreEl.innerText = score;
                }
            });
        } else {
            if (this.rectIntersect(this.x, this.y, this.size, this.size, player.x, player.y, player.size, player.size)) {
                this.active = false;
                playerHit();
            }
        }
    }

    draw() {
        ctx.fillStyle = this.isPlayer ? "#ff0" : "#f00";
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }

    rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
    }
}

// 敌方 AI 逻辑
function updateEnemies() {
    activeEnemies = activeEnemies.filter(e => !e.dead);
    
    if (activeEnemies.length < 3 && enemiesToSpawn > 0) {
        spawnEnemy();
    }

    activeEnemies.forEach(enemy => {
        if (!enemy.move()) {
            // 撞墙随机转弯
            enemy.dir = Math.floor(Math.random() * 4);
        }
        if (Math.random() < 0.02) enemy.shoot(); // 随机射击
        if (Math.random() < 0.01) enemy.dir = Math.floor(Math.random() * 4); // 随机换向
    });

    if (enemiesToSpawn === 0 && activeEnemies.length === 0) {
        gameWin();
    }
    
    enemyCountEl.innerText = enemiesToSpawn + activeEnemies.length;
}

function spawnEnemy() {
    const spawnPoints = [[0,0], [0, canvas.width/2 - TANK_SIZE/2], [0, canvas.width - TANK_SIZE]];
    const [x, y] = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    activeEnemies.push(new Tank(x, y, "#0f0"));
    enemiesToSpawn--;
}

function playerHit() {
    lives--;
    livesEl.innerText = lives;
    if (lives <= 0) {
        gameOver("你的坦克被摧毁了！");
    } else {
        // 重生
        player.x = 9 * GRID_SIZE;
        player.y = 24 * GRID_SIZE;
    }
}

// 绘制地图
function drawMap() {
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const x = c * GRID_SIZE;
            const y = r * GRID_SIZE;
            if (mapData[r][c] === BRICK) {
                ctx.fillStyle = "#a52a2a";
                ctx.fillRect(x + 2, y + 2, GRID_SIZE - 4, GRID_SIZE - 4);
                ctx.strokeStyle = "#000";
                ctx.strokeRect(x, y, GRID_SIZE, GRID_SIZE);
            } else if (mapData[r][c] === STEEL) {
                ctx.fillStyle = "#808080";
                ctx.fillRect(x, y, GRID_SIZE, GRID_SIZE);
                ctx.strokeStyle = "#fff";
                ctx.strokeRect(x+4, y+4, GRID_SIZE-8, GRID_SIZE-8);
            } else if (mapData[r][c] === BASE) {
                ctx.fillStyle = "#ffd700";
                ctx.beginPath();
                ctx.moveTo(x + GRID_SIZE/2, y);
                ctx.lineTo(x + GRID_SIZE, y + GRID_SIZE);
                ctx.lineTo(x, y + GRID_SIZE);
                ctx.closePath();
                ctx.fill();
            }
        }
    }
}

// 游戏循环
function gameLoop() {
    if (!gameRunning) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 玩家控制
    if (keys['ArrowUp'] || keys['KeyW']) { player.dir = UP; player.move(); }
    else if (keys['ArrowDown'] || keys['KeyS']) { player.dir = DOWN; player.move(); }
    else if (keys['ArrowLeft'] || keys['KeyA']) { player.dir = LEFT; player.move(); }
    else if (keys['ArrowRight'] || keys['KeyD']) { player.dir = RIGHT; player.move(); }
    
    if (keys['Space']) player.shoot();

    // 更新逻辑
    drawMap();
    player.draw();
    updateEnemies();
    activeEnemies.forEach(e => e.draw());
    
    bullets = bullets.filter(b => b.active);
    bullets.forEach(b => {
        b.update();
        b.draw();
    });

    requestAnimationFrame(gameLoop);
}

function startGame() {
    gameRunning = true;
    score = 0;
    lives = 3;
    enemiesToSpawn = 10;
    activeEnemies = [];
    bullets = [];
    mapData = generateMap();
    player = new Tank(9 * GRID_SIZE, 24 * GRID_SIZE, "#f80", true);
    
    scoreEl.innerText = score;
    livesEl.innerText = lives;
    uiOverlay.classList.add('hidden');
    statusOverlay.classList.add('hidden');
    
    gameLoop();
}

function gameOver(text) {
    gameRunning = false;
    statusText.innerText = text;
    statusText.className = "text-4xl font-bold mb-6 text-red-500";
    finalScoreEl.innerText = "最终得分: " + score;
    statusOverlay.classList.remove('hidden');
}

function gameWin() {
    gameRunning = false;
    statusText.innerText = "胜利！摧毁了所有敌人";
    statusText.className = "text-4xl font-bold mb-6 text-yellow-500";
    finalScoreEl.innerText = "最终得分: " + score;
    statusOverlay.classList.remove('hidden');
}

startBtn.onclick = startGame;
restartBtn.onclick = startGame;
