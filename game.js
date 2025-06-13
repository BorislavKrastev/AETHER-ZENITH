// --- Game Configuration & Constants ---
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const PLAYER_BASE_SPEED = 5;
const PLAYER_LASER_COOLDOWN_BASE = 200; // ms
const PLAYER_LASER_SPEED = 10;
const PLAYER_LASER_DAMAGE = 10;
const PLAYER_MAX_HEALTH_BASE = 100;
const PLAYER_INVULNERABILITY_DURATION = 1500; // ms

const ENEMY_SPEED_BASE = 1.5;
const ENEMY_HEALTH_BASE = 10;
const ENEMY_LASER_SPEED = 5;
const ENEMY_LASER_DAMAGE = 10;
const ENEMY_RAM_DAMAGE = 20;

const MAX_ENEMIES_ON_SCREEN_BASE = 8;
const ENEMY_SPAWN_INTERVAL_BASE = 1500; // ms

const PARTICLE_LIFESPAN_BASE = 60; // frames
const SCREEN_SHAKE_MAGNITUDE_BASE = 5;
const SCREEN_SHAKE_DURATION_BASE = 20; // frames

const LEVEL_UP_SCORE_THRESHOLD = 1000;
const CREDIT_PER_SCORE_POINT = 0.1; // 1 credit for every 10 score points

// Weapon Types
const WEAPON_TYPE = {
    BASIC: 'basic',
    SPREAD: 'spread',
    HEAVY: 'heavy'
};

// PowerUp Types
const POWERUP_TYPE = {
    SPREAD_SHOT: 'spread_shot',
    HEAVY_LASER: 'heavy_laser',
    SHIELD: 'shield',
    HEALTH: 'health_pack'
};

// Game States
const GAME_STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'game_over',
    UPGRADES: 'upgrades',
};

// Get DOM Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const healthBar = document.getElementById('healthBar');
const weaponNameDisplay = document.getElementById('weaponName');

const mainMenu = document.getElementById('main-menu');
const pauseMenu = document.getElementById('pause-menu');
const gameOverScreen = document.getElementById('game-over-screen');
const upgradeMenu = document.getElementById('upgrade-menu');

const startButton = document.getElementById('startButton');
const upgradeButton = document.getElementById('upgradeButton');
// const settingsButton = document.getElementById('settingsButton'); // Removed as no settings
const resumeButton = document.getElementById('resumeButton');
const restartFromPauseButton = document.getElementById('restartFromPauseButton');
const mainMenuFromPauseButton = document.getElementById('mainMenuFromPauseButton');
const restartButton = document.getElementById('restartButton');
const mainMenuButton = document.getElementById('mainMenuButton');
const backToMainMenuButton = document.getElementById('backToMainMenuButton');

const finalScoreDisplay = document.getElementById('final-score');
const levelAchievedDisplay = document.getElementById('level-achieved');
const levelUpNotification = document.getElementById('level-up-notification');
const powerupNotification = document.getElementById('powerup-notification');
const hitIndicator = document.getElementById('hit-indicator');

const creditsAmountDisplay = document.getElementById('creditsAmount');
const hullLevelDisplay = document.getElementById('hullLevel');
const engineLevelDisplay = document.getElementById('engineLevel');
const weaponLevelDisplay = document.getElementById('weaponLevel');
const upgradeBuyButtons = document.querySelectorAll('.upgrade-buy-btn');


canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// --- Global Game State Variables ---
let currentGameState = GAME_STATE.MENU; // Start directly at menu
let score = 0;
let credits = 0;
let level = 1;
let lastPlayerLaserTime = 0;
let lastEnemySpawnTime = 0;
let animationFrameId;
let player;

// Game Entities (arrays to hold objects)
let playerLasers = [];
let enemies = [];
let enemyLasers = [];
let particles = [];
let powerups = [];

// Background stars (for parallax - no image needed)
let backgroundStars = [];

// Screen shake state
let screenShake = {
    magnitude: 0,
    duration: 0
};

// Player upgrade stats (persistent conceptually, use localStorage in real game)
let playerUpgrades = {
    hull: { level: 1, maxLevel: 5, costs: [500, 1000, 2000, 3500, 5000], healthBonus: 20 },
    engine: { level: 1, maxLevel: 5, costs: [750, 1500, 2500, 4000, 6000], speedBonus: 0.5 },
    weapon: { level: 1, maxLevel: 5, costs: [1000, 2000, 3500, 5000, 7500], cooldownReduction: 20 }
};

// --- Input Handling ---
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if ((e.code === 'Space' || e.code === 'Escape' || e.code === 'KeyP') && currentGameState === GAME_STATE.PLAYING) {
        e.preventDefault(); // Prevent scrolling
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    // Pause/Resume on 'Esc' or 'P'
    if ((e.code === 'Escape' || e.code === 'KeyP') && currentGameState === GAME_STATE.PLAYING) {
        pauseGame();
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && currentGameState === GAME_STATE.PAUSED) {
        resumeGame();
    }
});

// --- Classes for Game Entities ---

class Player {
    constructor() {
        this.width = 50;
        this.height = 50;
        this.x = (CANVAS_WIDTH - this.width) / 2;
        this.y = CANVAS_HEIGHT - this.height - 30;
        this.speed = PLAYER_BASE_SPEED + (playerUpgrades.engine.level - 1) * playerUpgrades.engine.speedBonus;
        this.maxHealth = PLAYER_MAX_HEALTH_BASE + (playerUpgrades.hull.level - 1) * playerUpgrades.hull.healthBonus;
        this.health = this.maxHealth;
        this.weaponType = WEAPON_TYPE.BASIC;
        this.invulnerable = false;
        this.invulnerableTimer = 0;
        this.blink = false; // For invulnerability visual feedback
        this.shieldActive = false;
    }

    update() {
        // Movement
        if (keys['ArrowLeft'] || keys['KeyA']) {
            this.x -= this.speed;
        }
        if (keys['ArrowRight'] || keys['KeyD']) {
            this.x += this.speed;
        }
        // Boundary check
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > CANVAS_WIDTH) this.x = CANVAS_WIDTH - this.width;

        // Shooting
        const currentTime = Date.now();
        const effectiveCooldown = PLAYER_LASER_COOLDOWN_BASE - (playerUpgrades.weapon.level - 1) * playerUpgrades.weapon.cooldownReduction;
        if (keys['Space'] && currentTime - lastPlayerLaserTime > effectiveCooldown) {
            this.shoot();
            lastPlayerLaserTime = currentTime;
        }

        // Invulnerability timer
        if (this.invulnerable) {
            this.invulnerableTimer -= 1000 / 60; // Decrement by frame time
            this.blink = Math.floor(this.invulnerableTimer / 100) % 2 === 0; // Blink every 100ms
            if (this.invulnerableTimer <= 0) {
                this.invulnerable = false;
                this.blink = false;
            }
        }

        // Thruster particles
        if (currentGameState === GAME_STATE.PLAYING) {
            particles.push(new Particle(
                this.x + this.width / 2,
                this.y + this.height,
                { min: 3, max: 6 },
                ['#00FFFF', '#0099FF'], // Cyan/Blue for thrusters
                (Math.random() - 0.5) * 1, // Slight horizontal drift
                Math.random() * 2 + 2, // Upwards movement
                0.8, // Initial alpha
                40, // Lifespan
                0 // Gravity
            ));
        }
    }

    draw() {
        ctx.save();
        if (this.invulnerable && this.blink) {
            ctx.globalAlpha = 0.4; // Make player semi-transparent when invulnerable
        }
        // Player Ship (simple rectangle with a cockpit/nose)
        ctx.fillStyle = '#00bcd4'; // Cyan
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y); // Top center
        ctx.lineTo(this.x + this.width, this.y + this.height); // Bottom right
        ctx.lineTo(this.x + this.width * 0.7, this.y + this.height * 0.8); // Inner right wing
        ctx.lineTo(this.x + this.width * 0.3, this.y + this.height * 0.8); // Inner left wing
        ctx.lineTo(this.x, this.y + this.height); // Bottom left
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw shield if active
        if (this.shieldActive) {
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore(); // Restore alpha and other settings
    }

    shoot() {
        // No soundManager.play('sfxPlayerLaser');
        switch (this.weaponType) {
            case WEAPON_TYPE.BASIC:
                playerLasers.push(new Projectile(this.x + this.width / 2 - 2, this.y, 4, 15, PLAYER_LASER_SPEED, PLAYER_LASER_DAMAGE, 'player'));
                break;
            case WEAPON_TYPE.SPREAD:
                playerLasers.push(new Projectile(this.x + this.width / 2 - 2, this.y, 4, 15, PLAYER_LASER_SPEED, PLAYER_LASER_DAMAGE, 'player')); // Center
                playerLasers.push(new Projectile(this.x + this.width / 2 - 15, this.y + 10, 4, 15, PLAYER_LASER_SPEED * 0.9, PLAYER_LASER_DAMAGE, 'player', -2)); // Left
                playerLasers.push(new Projectile(this.x + this.width / 2 + 10, this.y + 10, 4, 15, PLAYER_LASER_SPEED * 0.9, PLAYER_LASER_DAMAGE, 'player', 2)); // Right
                break;
            case WEAPON_TYPE.HEAVY:
                playerLasers.push(new Projectile(this.x + this.width / 2 - 5, this.y - 10, 10, 30, PLAYER_LASER_SPEED * 0.7, PLAYER_LASER_DAMAGE * 2, 'player'));
                break;
        }
    }

    takeDamage(amount) {
        if (this.shieldActive) {
            this.shieldActive = false; // Shield absorbs one hit
            showPowerupNotification('Shield Depleted!');
            return;
        }

        if (!this.invulnerable) {
            this.health -= amount;
            if (this.health < 0) this.health = 0;
            this.invulnerable = true;
            this.invulnerableTimer = PLAYER_INVULNERABILITY_DURATION;
            showHitIndicator(); // Visual feedback for hit
            // No soundManager.play('sfxPlayerHit');
        }
    }

    // Temporarily change weapon type
    activatePowerUp(type, duration = 8000) {
        this.weaponType = type;
        showPowerupNotification(`${type.toUpperCase()} WEAPON!`);
        setTimeout(() => {
            if (this.weaponType === type) { // Only reset if this weapon is still active
                this.weaponType = WEAPON_TYPE.BASIC;
                showPowerupNotification('Weapon Reverted!');
            }
        }, duration);
    }
}

class Projectile {
    constructor(x, y, width, height, speed, damage, type, horizontalSpeed = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.damage = damage;
        this.type = type; // 'player' or 'enemy'
        this.horizontalSpeed = horizontalSpeed;
    }

    update() {
        if (this.type === 'player') {
            this.y -= this.speed;
        } else {
            this.y += this.speed;
        }
        this.x += this.horizontalSpeed;
    }

    draw() {
        ctx.fillStyle = this.type === 'player' ? '#ffeb3b' : '#ff007f';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        // Add a glow for lasers
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.type === 'player' ? '#ffeb3b' : '#ff007f';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.shadowBlur = 0; // Reset
    }
}

// Base Enemy class
class Enemy {
    constructor(x, y, width, height, speed, health, scoreValue, color = '#ff007f') {
        this.width = width;
        this.height = height;
        this.x = x;
        this.y = y;
        this.speed = speed * (1 + (level - 1) * 0.05); // Speed increases with level
        this.health = health * level; // Health increases with level
        this.maxHealth = this.health;
        this.scoreValue = scoreValue * level;
        this.color = color;
        this.shootCooldown = 1500 + Math.random() * 2000;
        this.lastShotTime = Date.now() + Math.random() * this.shootCooldown; // Stagger initial shots
    }

    update() {
        this.y += this.speed;
    }

    draw() {
        // Simple enemy shape (e.g., triangle for forward-facing)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y + this.height); // Bottom center
        ctx.lineTo(this.x, this.y); // Top left
        ctx.lineTo(this.x + this.width, this.y); // Top right
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Enemy Health bar
        const healthBarWidth = this.width * (this.health / this.maxHealth);
        ctx.fillStyle = healthBarWidth > this.width * 0.5 ? 'lime' : healthBarWidth > this.width * 0.2 ? 'orange' : 'red';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth, 5);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.strokeRect(this.x, this.y - 10, this.width, 5);
    }

    shoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime > this.shootCooldown && this.y < CANVAS_HEIGHT - this.height) {
            enemyLasers.push(new Projectile(this.x + this.width / 2 - 2, this.y + this.height, 4, 15, ENEMY_LASER_SPEED, ENEMY_LASER_DAMAGE, 'enemy'));
            this.lastShotTime = currentTime;
            this.shootCooldown = 1000 + Math.random() * (2000 - level * 50); // Cooldown decreases with level
            if (this.shootCooldown < 500) this.shootCooldown = 500;
        }
    }
}

class BasicEnemy extends Enemy {
    constructor() {
        super(Math.random() * (CANVAS_WIDTH - 40), -40, 40, 40, ENEMY_SPEED_BASE, ENEMY_HEALTH_BASE, 10, '#ff007f');
    }
    update() {
        super.update();
        this.shoot();
    }
}

class ChargerEnemy extends Enemy {
    constructor() {
        super(Math.random() * (CANVAS_WIDTH - 50), -50, 50, 50, ENEMY_SPEED_BASE * 1.5, ENEMY_HEALTH_BASE * 2, 25, '#FF4500'); // Orange-red color
        this.chargeSpeed = this.speed * 2;
        this.charging = false;
        this.chargeTimer = 0;
        this.chargeDelay = 1000 + Math.random() * 2000;
    }

    update() {
        super.update();
        // Simple charge logic: if player is below and somewhat aligned, charge
        if (!this.charging && this.y > CANVAS_HEIGHT / 4 && Math.abs((this.x + this.width / 2) - (player.x + player.width / 2)) < 50) {
            this.chargeTimer += 1000 / 60;
            if (this.chargeTimer > this.chargeDelay) {
                this.charging = true;
                this.chargeTimer = 0;
            }
        }
        if (this.charging) {
            this.y += this.chargeSpeed - this.speed; // Add extra speed
        }
    }
    // Chargers don't shoot by default, they ram
    shoot() {}
    draw() {
        // Charger: diamond shape
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y);
        ctx.lineTo(this.x + this.width, this.y + this.height / 2);
        ctx.lineTo(this.x + this.width / 2, this.y + this.height);
        ctx.lineTo(this.x, this.y + this.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Health bar
        const healthBarWidth = this.width * (this.health / this.maxHealth);
        ctx.fillStyle = healthBarWidth > this.width * 0.5 ? 'lime' : healthBarWidth > this.width * 0.2 ? 'orange' : 'red';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth, 5);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.strokeRect(this.x, this.y - 10, this.width, 5);
    }
}

class ShooterEnemy extends Enemy {
    constructor() {
        super(Math.random() * (CANVAS_WIDTH - 60), -60, 60, 60, ENEMY_SPEED_BASE * 0.8, ENEMY_HEALTH_BASE * 1.5, 20, '#8A2BE2'); // Blue-violet color
        this.shootCooldown = 800 + Math.random() * 1500; // Faster shooting
    }
    update() {
        super.update();
        this.shoot();
    }
    draw() {
        // Shooter: hexagon shape
        ctx.fillStyle = this.color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 3 * i;
            const x = this.x + this.width / 2 + this.width / 2 * Math.cos(angle);
            const y = this.y + this.height / 2 + this.height / 2 * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Health bar
        const healthBarWidth = this.width * (this.health / this.maxHealth);
        ctx.fillStyle = healthBarWidth > this.width * 0.5 ? 'lime' : healthBarWidth > this.width * 0.2 ? 'orange' : 'red';
        ctx.fillRect(this.x, this.y - 10, healthBarWidth, 5);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.strokeRect(this.x, this.y - 10, this.width, 5);
    }
}


class PowerUp {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.speed = 2;
        this.type = type;
    }

    draw() {
        let color = 'white';
        let symbol = ''; // Text symbol for the powerup
        switch (this.type) {
            case POWERUP_TYPE.SPREAD_SHOT: color = 'cyan'; symbol = 'S'; break;
            case POWERUP_TYPE.HEAVY_LASER: color = 'orange'; symbol = 'H'; break;
            case POWERUP_TYPE.SHIELD: color = 'lightblue'; symbol = 'D'; break;
            case POWERUP_TYPE.HEALTH: color = 'lime'; symbol = '+'; break;
        }

        ctx.fillStyle = color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        ctx.fillStyle = 'black';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(symbol, this.x + this.width / 2, this.y + this.height / 2);
    }

    update() {
        this.y += this.speed;
    }
}


class Particle {
    constructor(x, y, sizeRange, colors, speedX, speedY, alpha, lifespan, gravity = 0.1) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * (sizeRange.max - sizeRange.min) + sizeRange.min;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.speedX = speedX;
        this.speedY = speedY;
        this.alpha = alpha;
        this.lifespan = lifespan; // in frames
        this.life = 0;
        this.gravity = gravity;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedY += this.gravity; // Apply gravity
        this.life++;
        this.alpha = 1 - (this.life / this.lifespan); // Fade out
        if (this.alpha < 0) this.alpha = 0; // Prevent negative alpha
        this.size *= 0.98; // Shrink
    }

    draw() {
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1; // Reset alpha
    }
}

// For multi-layer parallax background (now purely generative)
class BackgroundStar {
    constructor(x, y, size, speed, color = 'white') {
        this.x = x;
        this.y = y;
        this.size = size;
        this.speed = speed;
        this.color = color;
    }

    update() {
        this.y += this.speed;
        if (this.y > CANVAS_HEIGHT) {
            this.y = 0;
            this.x = Math.random() * CANVAS_WIDTH;
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }
}


// --- Game Functions ---

function initializeGame() {
    score = 0;
    credits = getCredits(); // Load existing credits
    level = 1;
    playerLasers = [];
    enemies = [];
    enemyLasers = [];
    particles = [];
    powerups = [];
    player = new Player(); // Re-initialize player to apply upgrades
    lastPlayerLaserTime = Date.now();
    lastEnemySpawnTime = Date.now();
    player.weaponType = WEAPON_TYPE.BASIC; // Reset weapon type
    updateHUD();
    generateBackgroundStars(); // Generate stars for the background
}

function startGame() {
    initializeGame();
    showGameScreen();
    currentGameState = GAME_STATE.PLAYING;
    animate();
}

function pauseGame() {
    // No soundManager.stopMusic();
    currentGameState = GAME_STATE.PAUSED;
    showPauseMenu();
    cancelAnimationFrame(animationFrameId);
}

function resumeGame() {
    // No soundManager.play('sfxUiClick');
    // No soundManager.playMusic('musicGameLoop');
    currentGameState = GAME_STATE.PLAYING;
    showGameScreen();
    animate();
}

function gameOver() {
    // No soundManager.stopMusic();
    currentGameState = GAME_STATE.GAME_OVER;
    cancelAnimationFrame(animationFrameId);
    showGameOverScreen();
}

function spawnEnemy() {
    if (enemies.length >= MAX_ENEMIES_ON_SCREEN_BASE + level) return; // Cap based on level

    const enemyTypes = [BasicEnemy];
    // Introduce other enemy types as levels progress
    if (level >= 2) enemyTypes.push(ChargerEnemy);
    if (level >= 3) enemyTypes.push(ShooterEnemy);

    const enemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
    enemies.push(new enemyType());
}

function checkCollisions() {
    // Player Lasers vs Enemies
    for (let l = playerLasers.length - 1; l >= 0; l--) {
        const laser = playerLasers[l];
        for (let e = enemies.length - 1; e >= 0; e--) {
            const enemy = enemies[e];
            if (
                laser.x < enemy.x + enemy.width &&
                laser.x + laser.width > enemy.x &&
                laser.y < enemy.y + enemy.height &&
                laser.y + laser.height > enemy.y
            ) {
                // Collision!
                playerLasers.splice(l, 1); // Remove laser
                enemy.health -= laser.damage; // Apply laser damage

                if (enemy.health <= 0) {
                    // Enemy destroyed
                    score += enemy.scoreValue;
                    credits += enemy.scoreValue * CREDIT_PER_SCORE_POINT;
                    saveCredits(credits); // Save credits
                    createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width);
                    // No soundManager.play('sfxEnemyExplosion');

                    // Drop PowerUp
                    if (Math.random() < 0.2 + level * 0.02) { // Chance to drop power-up
                        const powerupTypes = [POWERUP_TYPE.SPREAD_SHOT, POWERUP_TYPE.HEAVY_LASER, POWERUP_TYPE.SHIELD, POWERUP_TYPE.HEALTH];
                        const droppedType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
                        powerups.push(new PowerUp(enemy.x + enemy.width / 2 - 15, enemy.y + enemy.height / 2 - 15, droppedType));
                    }
                    enemies.splice(e, 1); // Remove enemy
                    break; // Only one enemy hit per laser
                } else {
                    // Particle effect for hit
                    particles.push(new Particle(
                        laser.x + laser.width / 2, laser.y,
                        { min: 1, max: 3 }, ['#ffeb3b', '#ffa500'],
                        (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1, 20, 0.05
                    ));
                }
            }
        }
    }

    // Enemy Lasers vs Player
    for (let l = enemyLasers.length - 1; l >= 0; l--) {
        const laser = enemyLasers[l];
        if (
            laser.x < player.x + player.width &&
            laser.x + laser.width > player.x &&
            laser.y < player.y + player.height &&
            laser.y + laser.height > player.y
        ) {
            // Collision!
            enemyLasers.splice(l, 1); // Remove laser
            player.takeDamage(laser.damage);
            initiateScreenShake(SCREEN_SHAKE_MAGNITUDE_BASE, SCREEN_SHAKE_DURATION_BASE);
            if (player.health <= 0) {
                gameOver();
            }
        }
    }

    // Enemy vs Player (ramming)
    for (let e = enemies.length - 1; e >= 0; e--) {
        const enemy = enemies[e];
        if (
            player.x < enemy.x + enemy.width &&
            player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height &&
            player.y + player.height > enemy.y
        ) {
            // Collision!
            player.takeDamage(ENEMY_RAM_DAMAGE); // Ramming damage
            score += enemy.scoreValue / 2; // Half score for ramming
            credits += (enemy.scoreValue / 2) * CREDIT_PER_SCORE_POINT;
            saveCredits(credits);
            createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width);
            // No soundManager.play('sfxEnemyExplosion');
            initiateScreenShake(SCREEN_SHAKE_MAGNITUDE_BASE * 1.5, SCREEN_SHAKE_DURATION_BASE * 1.5);
            enemies.splice(e, 1); // Remove enemy
            if (player.health <= 0) {
                gameOver();
            }
        }
    }

    // Player vs PowerUps
    for (let p = powerups.length - 1; p >= 0; p--) {
        const powerup = powerups[p];
        if (
            player.x < powerup.x + powerup.width &&
            player.x + player.width > powerup.x &&
            player.y < powerup.y + powerup.height &&
            player.y + powerup.height > player.y
        ) {
            // No soundManager.play('sfxPowerupPickup');
            switch (powerup.type) {
                case POWERUP_TYPE.SPREAD_SHOT:
                    player.activatePowerUp(WEAPON_TYPE.SPREAD);
                    break;
                case POWERUP_TYPE.HEAVY_LASER:
                    player.activatePowerUp(WEAPON_TYPE.HEAVY);
                    break;
                case POWERUP_TYPE.SHIELD:
                    player.shieldActive = true;
                    showPowerupNotification('Shield Activated!');
                    break;
                case POWERUP_TYPE.HEALTH:
                    player.health = Math.min(player.maxHealth, player.health + 50); // Restore 50 health
                    showPowerupNotification('Health Restored!');
                    break;
            }
            powerups.splice(p, 1); // Remove power-up
        }
    }
}

function createExplosion(x, y, size) {
    const numParticles = 20 + Math.floor(Math.random() * 10);
    const colors = ['#FF4500', '#FFA500', '#FFD700', '#FFFF00']; // Red-orange-yellow hues
    for (let i = 0; i < numParticles; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (size / 10) + 1; // Speed scales with explosion size
        particles.push(new Particle(
            x, y, { min: 2, max: 6 }, colors,
            Math.cos(angle) * speed, Math.sin(angle) * speed,
            1, PARTICLE_LIFESPAN_BASE, 0.1 // Small gravity for a falling effect
        ));
    }
}

function generateBackgroundStars() {
    backgroundStars = [];
    // Distant, slow stars (many, small)
    for (let i = 0; i < 150; i++) {
        backgroundStars.push(new BackgroundStar(
            Math.random() * CANVAS_WIDTH,
            Math.random() * CANVAS_HEIGHT,
            Math.random() * 1 + 0.5, // Size
            Math.random() * 0.5 + 0.2, // Speed
            'rgba(255, 255, 255, 0.4)' // Faint white
        ));
    }
    // Closer, faster stars (fewer, larger)
    for (let i = 0; i < 70; i++) {
        backgroundStars.push(new BackgroundStar(
            Math.random() * CANVAS_WIDTH,
            Math.random() * CANVAS_HEIGHT,
            Math.random() * 1.5 + 1, // Size
            Math.random() * 1.5 + 0.5, // Speed
            'rgba(255, 255, 255, 0.7)' // Brighter white
        ));
    }
    // Very close, very fast stars (few, large, bright)
    for (let i = 0; i < 30; i++) {
        backgroundStars.push(new BackgroundStar(
            Math.random() * CANVAS_WIDTH,
            Math.random() * CANVAS_HEIGHT,
            Math.random() * 2 + 1.5, // Size
            Math.random() * 2 + 1, // Speed
            'rgba(255, 255, 255, 0.9)' // Brightest white
        ));
    }
}


function updateHUD() {
    scoreDisplay.textContent = score;
    levelDisplay.textContent = level;
    healthBar.style.width = `${player.health / player.maxHealth * 100}%`;
    if (player.health / player.maxHealth > 0.6) {
        healthBar.style.backgroundColor = '#4CAF50'; // Green
    } else if (player.health / player.maxHealth > 0.25) {
        healthBar.style.backgroundColor = '#FFC107'; // Orange
    } else {
        healthBar.style.backgroundColor = '#F44336'; // Red
    }

    // Update weapon name text only (no icon)
    let weaponDisplayName = 'Basic';
    switch (player.weaponType) {
        case WEAPON_TYPE.SPREAD:
            weaponDisplayName = 'Spread';
            break;
        case WEAPON_TYPE.HEAVY:
            weaponDisplayName = 'Heavy';
            break;
    }
    weaponNameDisplay.textContent = weaponDisplayName;
}

function checkLevelUp() {
    const nextLevelScore = level * LEVEL_UP_SCORE_THRESHOLD;
    if (score >= nextLevelScore) {
        level++;
        player.health = player.maxHealth; // Restore health on level up
        showLevelUpNotification();
        // No soundManager.play('sfxPowerupPickup'); // Use powerup sound for level up
    }
}

function initiateScreenShake(magnitude, duration) {
    screenShake.magnitude = magnitude;
    screenShake.duration = duration;
}

// --- Upgrade System ---
function saveCredits(amount) {
    localStorage.setItem('aetherZenithCredits', amount);
}

function getCredits() {
    return parseInt(localStorage.getItem('aetherZenithCredits') || '0');
}

function saveUpgrades() {
    localStorage.setItem('aetherZenithUpgrades', JSON.stringify(playerUpgrades));
}

function loadUpgrades() {
    const savedUpgrades = JSON.parse(localStorage.getItem('aetherZenithUpgrades'));
    if (savedUpgrades) {
        // Merge saved levels into default structure
        for (const type in savedUpgrades) {
            if (playerUpgrades[type]) {
                playerUpgrades[type].level = savedUpgrades[type].level;
            }
        }
    }
}

function updateUpgradeMenu() {
    creditsAmountDisplay.textContent = credits;
    hullLevelDisplay.textContent = `Lv.${playerUpgrades.hull.level}`;
    engineLevelDisplay.textContent = `Lv.${playerUpgrades.engine.level}`;
    weaponLevelDisplay.textContent = `Lv.${playerUpgrades.weapon.level}`;

    upgradeBuyButtons.forEach(button => {
        const type = button.dataset.upgradeType;
        const currentLevel = playerUpgrades[type].level;
        const maxLevel = playerUpgrades[type].maxLevel;
        const cost = playerUpgrades[type].costs[currentLevel - 1]; // Costs are 0-indexed based on current level

        if (currentLevel >= maxLevel) {
            button.textContent = 'MAX LEVEL';
            button.classList.add('disabled');
        } else {
            button.textContent = `Upgrade (${cost} Cr)`;
            if (credits >= cost) {
                button.classList.remove('disabled');
            } else {
                button.classList.add('disabled');
            }
        }
    });
}

function applyUpgrade(type) {
    const upgrade = playerUpgrades[type];
    if (upgrade.level < upgrade.maxLevel) {
        const cost = upgrade.costs[upgrade.level - 1];
        if (credits >= cost) {
            credits -= cost;
            upgrade.level++;
            // No soundManager.play('sfxUiClick'); // Use UI click for success
            saveCredits(credits);
            saveUpgrades();
            updateUpgradeMenu();
            // Re-initialize player properties if game was active/player existed
            if (player) {
                player.speed = PLAYER_BASE_SPEED + (playerUpgrades.engine.level - 1) * playerUpgrades.engine.speedBonus;
                player.maxHealth = PLAYER_MAX_HEALTH_BASE + (playerUpgrades.hull.level - 1) * playerUpgrades.hull.healthBonus;
                player.health = Math.min(player.health, player.maxHealth); // Don't overfill health
                updateHUD();
            }
        } else {
            // Not enough credits, provide feedback (e.g., flash button red)
            console.log('Not enough credits!');
        }
    }
}

// --- UI/UX Functions ---

function showScreen(screenElement) {
    // Hide all menu screens
    document.querySelectorAll('.menu-screen').forEach(screen => {
        screen.classList.remove('active');
    });
    hud.classList.remove('active'); // Hide HUD by default

    // Show the requested screen
    if (screenElement) {
        screenElement.classList.add('active');
    }
    // Show HUD only during PLAYING state
    if (currentGameState === GAME_STATE.PLAYING) {
        hud.classList.add('active');
    }
}

function showMainMenu() {
    // No musicManager.stopMusic() / playMusic()
    showScreen(mainMenu);
    currentGameState = GAME_STATE.MENU;
}

function showGameScreen() {
    showScreen(null); // Hide all menus
    hud.classList.add('active'); // Show HUD
}

function showPauseMenu() {
    showScreen(pauseMenu);
}

function showGameOverScreen() {
    showScreen(gameOverScreen);
    finalScoreDisplay.textContent = score;
    levelAchievedDisplay.textContent = level;
}

function showUpgradeMenu() {
    // No soundManager.play('sfxUiClick');
    showScreen(upgradeMenu);
    currentGameState = GAME_STATE.UPGRADES;
    updateUpgradeMenu();
}

function showLevelUpNotification() {
    levelUpNotification.classList.add('show');
    setTimeout(() => {
        levelUpNotification.classList.remove('show');
    }, 1500); // Display for 1.5 seconds
}

function showPowerupNotification(message) {
    powerupNotification.querySelector('span').textContent = message;
    powerupNotification.classList.add('show');
    setTimeout(() => {
        powerupNotification.classList.remove('show');
    }, 1200); // Display for 1.2 seconds
}

function showHitIndicator() {
    hitIndicator.classList.remove('active'); // Reset animation
    void hitIndicator.offsetWidth; // Trigger reflow
    hitIndicator.classList.add('active');
}

// --- Main Game Loop ---
function animate() {
    if (currentGameState !== GAME_STATE.PLAYING && currentGameState !== GAME_STATE.PAUSED) return; // Allow animation to run even when paused for background

    // Apply screen shake translation
    let offsetX = 0;
    let offsetY = 0;
    if (screenShake.duration > 0) {
        offsetX = (Math.random() - 0.5) * screenShake.magnitude;
        offsetY = (Math.random() - 0.5) * screenShake.magnitude;
        screenShake.duration--;
    }
    ctx.save(); // Save the context before applying translation
    ctx.translate(offsetX, offsetY);

    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Update and draw background stars
    backgroundStars.forEach(star => {
        star.update();
        star.draw();
    });

    if (currentGameState === GAME_STATE.PLAYING) {
        // Update & Draw Player
        player.update();

        // Update & Draw Player Lasers
        for (let i = playerLasers.length - 1; i >= 0; i--) {
            const laser = playerLasers[i];
            laser.update();
            if (laser.y < -laser.height || laser.x < -laser.width || laser.x > CANVAS_WIDTH + laser.width) {
                playerLasers.splice(i, 1);
            }
        }

        // Spawn Enemies
        const currentTime = Date.now();
        const spawnInterval = ENEMY_SPAWN_INTERVAL_BASE - (level * 50); // Interval decreases with level
        if (spawnInterval < 500) spawnInterval = 500; // Minimum spawn interval
        if (currentTime - lastEnemySpawnTime > spawnInterval) {
            spawnEnemy();
            lastEnemySpawnTime = currentTime;
        }

        // Update & Draw Enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            enemy.update();
            if (enemy.y > CANVAS_HEIGHT) {
                enemies.splice(i, 1); // Remove enemy if it goes off screen
                player.takeDamage(10); // Player takes damage if enemy escapes
                if (player.health <= 0) {
                    gameOver();
                }
            }
        }

        // Update & Draw Enemy Lasers
        for (let i = enemyLasers.length - 1; i >= 0; i--) {
            const laser = enemyLasers[i];
            laser.update();
            if (laser.y > CANVAS_HEIGHT) {
                enemyLasers.splice(i, 1);
            }
        }

        // Update & Draw Powerups
        for (let i = powerups.length - 1; i >= 0; i--) {
            const powerup = powerups[i];
            powerup.update();
            if (powerup.y > CANVAS_HEIGHT) {
                powerups.splice(i, 1);
            }
        }

        // Update & Draw Particles (explosions, thrusters)
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            particle.update();
            if (particle.life >= particle.lifespan || particle.alpha <= 0) {
                particles.splice(i, 1);
            }
        }

        // Check for Collisions (only when playing)
        checkCollisions();

        // Update HUD
        updateHUD();

        // Check for Level Up
        checkLevelUp();
    }

    // Draw all entities (even if paused, for static image)
    // Draw order matters: background, then enemies, then player, then lasers, then particles, then powerups
    backgroundStars.forEach(star => star.draw()); // Drawn again after update, but within the shake context
    enemies.forEach(enemy => enemy.draw());
    player.draw();
    playerLasers.forEach(laser => laser.draw());
    enemyLasers.forEach(laser => laser.draw());
    powerups.forEach(powerup => powerup.draw());
    particles.forEach(particle => particle.draw());


    ctx.restore(); // Restore the canvas context to remove screen shake translation

    animationFrameId = requestAnimationFrame(animate);
}

// --- Event Listeners ---
startButton.addEventListener('click', () => { startGame(); });
restartButton.addEventListener('click', () => { startGame(); });
restartFromPauseButton.addEventListener('click', () => { startGame(); });
resumeButton.addEventListener('click', () => { resumeGame(); });
upgradeButton.addEventListener('click', () => { showUpgradeMenu(); });
backToMainMenuButton.addEventListener('click', () => { showMainMenu(); });
mainMenuButton.addEventListener('click', () => { showMainMenu(); });
mainMenuFromPauseButton.addEventListener('click', () => { showMainMenu(); });

upgradeBuyButtons.forEach(button => {
    button.addEventListener('click', (event) => {
        const type = event.target.dataset.upgradeType;
        if (!event.target.classList.contains('disabled')) {
            applyUpgrade(type);
        }
    });
});


// --- Initial Setup ---
loadUpgrades(); // Load player upgrades from localStorage
generateBackgroundStars(); // Create initial background stars
showMainMenu(); // Show main menu on page load