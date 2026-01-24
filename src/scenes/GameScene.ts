// src/scenes/GameScene.ts
// Minimal playable bubble-shooter loop:
// - Prebuilds a hex/offset grid with random bubbles on top rows
// - Aim with pointer, tap/click to shoot
// - Wall bounce, snap to nearest empty cell
// - Match-3 removal (same color), basic coin reward hook (TODO: connect to GameState later)
// NOTE: Later we will move logic into systems/ (BubbleManager, ShootingSystem, LevelManager, GridSystem, MatchSystem).

import Phaser from "phaser";
import { Colors, HexColor, hexTo0x, randomBubbleHex } from "../config/colors";
import { BUBBLES, GAME, INPUT, LEVELS } from "../config/constants";
import { HUD } from "../ui/HUD";
import { ensurePhosphorTextures, getPhosphorKey, PhosphorIconId } from "../ui/phosphor";
import { EffectManager } from "../systems/EffectManager";
import { BubbleManager } from "../systems/BubbleManager";
import { LevelManager } from "../systems/LevelManager";
import { ShootingSystem } from "../systems/ShootingSystem";
import { AudioManager } from "../systems/AudioManager";
import { GameState } from "../state/GameState";

type CellKey = string;

type BubbleVisual = Phaser.GameObjects.Container & {
    base: Phaser.GameObjects.Arc;   // Asosiy shar (aylana)
    gloss?: Phaser.GameObjects.Shape; // Yaltirash (ixtiyoriy)
    shade?: Phaser.GameObjects.Shape; // Soya (ixtiyoriy)
    bubbleRadius: number;
    colorHex: HexColor;
};

type BubbleGO = BubbleVisual & {
    cellR: number;
    cellC: number;
};

type Projectile = {
    go: BubbleVisual;
    colorHex: HexColor;
    vx: number;
    vy: number;
    active: boolean;
    isBomb?: boolean;
};

type BoosterId = "colorSwap" | "aimGuide" | "bomb";

export class GameScene extends Phaser.Scene {
    private gridTopY = 140;
    private playfieldLeft = 18;
    private playfieldRight = GAME.width - 18;
    private playfieldTop = 140;
    private playfieldBottom = GAME.height - 18;

    private cols = 0;
    private maxRows = 0;

    private hSpacing = BUBBLES.diameter; // horizontal spacing
    private vSpacing = Math.round(BUBBLES.radius * Math.sqrt(3)); // hex vertical spacing

    private occupied = new Map<CellKey, BubbleGO>();

    private aimLine?: Phaser.GameObjects.Graphics;
    private aimGhost?: Phaser.GameObjects.Arc;
    private shooterX = 0;
    private shooterY = 0;
    private previewX = 0;
    private previewY = 0;
    private previewRadius = 0;
    private nextSlot?: Phaser.GameObjects.Arc;
    private nextLabel?: Phaser.GameObjects.Text;
    private swapGfx?: Phaser.GameObjects.Graphics;
    private shooterBase!: Phaser.GameObjects.Container;
    private hud?: HUD;

    private nextBubble?: BubbleVisual;
    private nextColor: HexColor = Colors.bubbles.blue;
    private queuedBubble?: BubbleVisual;
    private queuedColor: HexColor = Colors.bubbles.blue;

    private projectile: Projectile | null = null;
    private levelTargetScore = 2000; // Default
    private shotsLeft = 0;
    private level = 1;
    private score = 0;
    private gameOver = false;

    private aimGuideActive = false;
    private bombActive = false;

    // Scroll reveal system - bubbles above visibleRowOffset are hidden
    private visibleRowOffset = 0;  // How many rows are hidden above
    private totalLevelRows = 0;    // Total rows in the level
    private levelColors: HexColor[] = [];  // Store level colors

    private bubs!: BubbleManager;
    private levelMgr!: LevelManager;
    private shooter!: ShootingSystem;
    private effectManager!: EffectManager;
    private audio!: AudioManager;

    private uiContainer!: Phaser.GameObjects.Container;

    // hud removed from here to avoid duplicate

    private boosterBar?: Phaser.GameObjects.Graphics;
    private boosterUI: Partial<Record<BoosterId, Phaser.GameObjects.Container>> = {};
    private boosterCountText: Partial<Record<BoosterId, Phaser.GameObjects.Text>> = {};

    constructor() {
        super({ key: "GameScene" });
    }

    create() {
        this.effectManager = new EffectManager(this);
        this.audio = new AudioManager(this);
        this.audio.playMusic("bgm_main", 0.4);

        this.gameOver = false;
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));
        this.drawBackdrop();

        this.level = LEVELS.startLevel;
        this.maxRows = Math.min(LEVELS.difficulty.maxRows, 12);

        this.setupGridDimensions();
        this.setupShooter();
        this.setupBoosters();
        this.spawnInitialBubbles();
        this.ensureNextColorsValid();
        this.setupInput();

        this.drawHUD();
    }

    update(_t: number, dtMs: number) {
        if (this.gameOver) {
            this.aimLine?.clear();
            this.aimLine?.setVisible(false);
            this.hideAimGhost();
            return;
        }

        const dt = dtMs / 1000;

        // PUSHKA AYLANTIRISH (YANGI)
        if (this.input.activePointer && this.shooterBase) {
            const p = this.input.activePointer;

            // Shooter va Sichqoncha orasidagi burchak
            const angle = Phaser.Math.Angle.Between(this.shooterX, this.shooterY, p.worldX, p.worldY);

            // Burchakni cheklash (Pushka yerga qarab qolmasligi uchun)
            // -170 gradusdan -10 gradusgacha
            const minAngle = Phaser.Math.DegToRad(-170);
            const maxAngle = Phaser.Math.DegToRad(-10);
            const clampedAngle = Phaser.Math.Clamp(angle, minAngle, maxAngle);

            // Grafikani burish (+90 gradus qo'shamiz, chunki chizganimizda u tepaga qarab turibdi)
            this.shooterBase.setRotation(clampedAngle + Math.PI / 2);
        }

        // Update aim line when no projectile
        if (!this.projectile?.active) {
            this.aimLine?.setVisible(true);
            this.updateAimLine();
            return;
        }

        this.aimLine?.clear();
        this.aimLine?.setVisible(false);
        this.hideAimGhost();

        // Move projectile
        const p = this.projectile!;
        p.go.x += p.vx * dt;
        p.go.y += p.vy * dt;

        // Bounce off side walls
        const left = this.playfieldLeft + BUBBLES.radius;
        const right = this.playfieldRight - BUBBLES.radius;
        if (p.go.x <= left) {
            p.go.x = left;
            p.vx *= -1;
        } else if (p.go.x >= right) {
            p.go.x = right;
            p.vx *= -1;
        }

        // Hit top => snap
        if (p.go.y <= this.gridTopY + BUBBLES.radius) {
            this.snapProjectileToGrid(p.go.x, p.go.y, p.colorHex, p.isBomb);
            this.destroyProjectile();
            return;
        }

        // Hit any bubble => snap
        const hit = this.findCollisionBubble(p.go.x, p.go.y);
        if (hit) {
            this.snapProjectileToGrid(p.go.x, p.go.y, p.colorHex, p.isBomb);
            this.destroyProjectile();
            return;
        }
    }

    // -------------------------
    // Setup
    // -------------------------

    private drawBackdrop() {
        const gfx = this.add.graphics();

        // 1. Umumiy Fon (Och binafsha)
        gfx.fillStyle(hexTo0x(Colors.ui.background));
        gfx.fillRect(0, 0, GAME.width, GAME.height);

        // 2. O'yin maydoni (Markaziy qism biroz ochroq)
        // Maqsadli rasmda o'yin maydoni ajralib turadi
        const panelW = 580; // Kengroq qildim
        const panelX = (GAME.width - panelW) / 2;

        // Chap va O'ng devorlar (To'qroq rangda)
        gfx.fillStyle(0x0F172A, 0.5);
        gfx.fillRect(0, 0, panelX, GAME.height);
        gfx.fillRect(panelX + panelW, 0, panelX, GAME.height);

        // Devor chizig'i
        gfx.lineStyle(4, 0x6A80B8, 1);
        gfx.beginPath();
        gfx.moveTo(panelX, 0);
        gfx.lineTo(panelX, GAME.height);
        gfx.moveTo(panelX + panelW, 0);
        gfx.lineTo(panelX + panelW, GAME.height);
        gfx.strokePath();

        // O'yin maydoni chegaralarini yangilash
        this.playfieldLeft = panelX + 18; // Biroz ichkariga
        this.playfieldRight = panelX + panelW - 18;
        this.playfieldTop = 140;
        this.playfieldBottom = GAME.height - 18;
        this.gridTopY = this.playfieldTop;

        gfx.setDepth(-100);

        const patternGfx = this.add.graphics();
        patternGfx.setDepth(-99); // Asosiy fondan biroz tepada

        // O'yin maydoni ichiga tasodifiy doiralar chizamiz
        patternGfx.lineStyle(2, 0xFFFFFF, 0.05); // Juda xira oq chiziq

        for (let i = 0; i < 15; i++) {
            const r = Phaser.Math.Between(30, 80); // Har xil kattalikda
            const x = Phaser.Math.Between(this.playfieldLeft + 50, this.playfieldRight - 50);
            const y = Phaser.Math.Between(this.playfieldTop + 50, this.playfieldBottom - 200);

            patternGfx.strokeCircle(x, y, r);
        }
    }

    private setupGridDimensions() {
        // Fit as many columns as possible with diameter spacing.
        // Keep a small margin so bubbles don't touch screen edge.
        const usable = this.playfieldRight - this.playfieldLeft;

        // With offset rows, odd rows shift by radius; keep cols conservative.
        this.cols = Math.floor((usable - BUBBLES.radius) / this.hSpacing);
        if (this.cols < 7) this.cols = 7;
    }

    private setupShooter() {
        const pfCenter = (this.playfieldLeft + this.playfieldRight) / 2;
        this.shooterX = pfCenter;
        // Pushkani biroz yuqoriroqqa ko'taramiz
        this.shooterY = GAME.height - 130;

        // --- 1. PUSHKA (CANNON) KONTEYNERI ---
        // Agar avvalgi o'yindan qolib ketgan bo'lsa, tozalaymiz
        if (this.shooterBase) {
            this.shooterBase.destroy();
        }

        this.shooterBase = this.add.container(this.shooterX, this.shooterY);

        const cannon = this.add.graphics();

        // Pushka Og'zi (Barrel) - To'q Metallik rangda
        cannon.fillStyle(0x2C3E50, 1); // Dark Gunmetal
        cannon.lineStyle(2, 0x5D6D7E, 1); // Chetlari yaltiroq
        // (x, y, w, h, radius) - Markazdan tepaga qarab chizamiz
        cannon.fillRoundedRect(-16, -70, 32, 80, 8);
        cannon.strokeRoundedRect(-16, -70, 32, 80, 8);

        // Barrel ichki qismi (Tirqish)
        cannon.fillStyle(0x17202A, 1); // Deyarli qora
        cannon.fillRoundedRect(-8, -65, 16, 40, 4);

        // Pushka Asosi (Outer Ring)
        cannon.fillStyle(0x34495E, 1);
        cannon.fillCircle(0, 0, 42);
        cannon.lineStyle(3, 0x85929E, 1); // Kumush hoshiya
        cannon.strokeCircle(0, 0, 42);

        // Asosning ichki qismi (Inner Ring)
        cannon.fillStyle(0x1B2631, 1);
        cannon.fillCircle(0, 0, 28);

        // Yaltirash effekti (Gloss)
        cannon.fillStyle(0xFFFFFF, 0.1);
        cannon.fillCircle(-10, -10, 15);

        this.shooterBase.add(cannon);

        // MUHIM: Pushkaning chuqurligi (Depth) 20 bo'ladi
        this.shooterBase.setDepth(20);

        // --- 2. AIM LINE (Nishon chizig'i) ---
        if (this.aimLine) this.aimLine.destroy();
        this.aimLine = this.add.graphics();
        this.aimLine.setDepth(5);

        // --- 3. NEXT BUBBLE (Otishga tayyor shar) ---
        this.nextColor = this.pickAvailableColor();
        this.nextBubble = this.makeBubbleVisual(this.shooterX, this.shooterY, this.nextColor, BUBBLES.radius);

        // MUHIM TUZATISH: Pufakcha pushkaning ustida turishi uchun Depth 21 (pushkadan baland) bo'lishi SHART!
        this.nextBubble.setDepth(21);

        this.bindSwapHandler(this.nextBubble);
        this.updateBombIndicator();

        // --- 4. PREVIEW SLOT (Keyingi navbatdagi shar) ---
        this.previewX = this.shooterX + 110;
        this.previewY = this.shooterY + 20;
        this.previewRadius = Math.round(BUBBLES.radius * 0.7);

        // Eski slotni tozalash
        if (this.nextSlot) {
            this.nextSlot.destroy();
        }

        // Yangi slot chizish (Aylana)
        this.nextSlot = this.add
            .circle(this.previewX, this.previewY, this.previewRadius + 10, 0x000000, 0.3)
            .setStrokeStyle(2, 0xFFFFFF, 0.3);
        this.nextSlot.setDepth(4);

        // Swap belgisi (aylanadigan strelkalar)
        this.drawSwapHint();

        // Keyingi shar
        this.queuedColor = this.pickAvailableColor(this.nextColor);
        this.queuedBubble = this.makeBubbleVisual(this.previewX, this.previewY, this.queuedColor, this.previewRadius);
        this.queuedBubble.setDepth(5);

        this.bindSwapHandler(this.queuedBubble);
    }

    private drawSwapHint() {
        if (this.swapGfx) {
            this.swapGfx.destroy();
        }

        this.swapGfx = this.add.graphics();
        const r = this.previewRadius + 24;
        this.swapGfx.setPosition(this.previewX, this.previewY);

        // Backplate glow
        this.swapGfx.fillStyle(0xffffff, 0.05);
        this.swapGfx.fillCircle(0, 0, r + 6);
        this.swapGfx.fillStyle(0x000000, 0.18);
        this.swapGfx.fillCircle(2, 3, r + 4);

        // Shadow arc (depth)
        this.swapGfx.lineStyle(6, 0x000000, 0.25);
        this.swapGfx.beginPath();
        this.swapGfx.arc(2, 3, r, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(200), false);
        this.swapGfx.strokePath();

        // Main arcs
        this.swapGfx.lineStyle(5, 0xffffff, 0.75);
        this.swapGfx.beginPath();
        this.swapGfx.arc(0, 0, r, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(180), false);
        this.swapGfx.strokePath();

        this.swapGfx.beginPath();
        this.swapGfx.arc(0, 0, r, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(360), false);
        this.swapGfx.strokePath();

        this.swapGfx.fillStyle(0xffffff, 0.95);
        this.drawArrowHead(this.swapGfx, 0, 0, r, 20, true);
        this.drawArrowHead(this.swapGfx, 0, 0, r, 200, true);

        this.swapGfx.setDepth(4);
        this.tweens.add({
            targets: this.swapGfx,
            rotation: Phaser.Math.DegToRad(360),
            duration: 2600,
            repeat: -1,
        });
        this.tweens.add({
            targets: this.swapGfx,
            scale: { from: 0.98, to: 1.04 },
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: "Sine.InOut",
        });
    }

    private drawArrowHead(
        gfx: Phaser.GameObjects.Graphics,
        cx: number,
        cy: number,
        r: number,
        angleDeg: number,
        clockwise: boolean
    ) {
        const angle = Phaser.Math.DegToRad(angleDeg);
        const ax = cx + Math.cos(angle) * r;
        const ay = cy + Math.sin(angle) * r;

        const tangent = angle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
        const dir = new Phaser.Math.Vector2(Math.cos(tangent), Math.sin(tangent));
        const perp = new Phaser.Math.Vector2(-dir.y, dir.x);
        const size = 9;

        const tip = new Phaser.Math.Vector2(ax, ay).add(dir.clone().scale(size));
        const left = new Phaser.Math.Vector2(ax, ay)
            .add(dir.clone().scale(-size * 0.5))
            .add(perp.clone().scale(size * 0.6));
        const right = new Phaser.Math.Vector2(ax, ay)
            .add(dir.clone().scale(-size * 0.5))
            .add(perp.clone().scale(-size * 0.6));

        gfx.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    }

    private spawnInitialBubbles() {
        // Use LevelManager to get level configuration
        const params = LevelManager.getParams(this.level, this.cols);

        // Update scene config from params (e.g. shots, colors)
        this.shotsLeft = params.shots;
        this.levelColors = params.colors as HexColor[];

        // Store total rows for scroll reveal
        this.totalLevelRows = params.rows;
        this.visibleRowOffset = 0;
        this.levelTargetScore = (params.rows * params.cols * 0.5) * 10 + 1000;
        // Generate grid
        const bubbles = LevelManager.generateInitialGrid(params);

        for (const b of bubbles) {
            this.placeBubble(b.r, b.c, b.colorHex);
        }
    }

    private checkAndRevealRows() {
        // Check if top row (row 0) is empty - if so, scroll everything down and spawn new row
        let hasTopRowBubble = false;
        for (const [key, bubble] of this.occupied) {
            if (bubble.cellR === 0) {
                hasTopRowBubble = true;
                break;
            }
        }

        // If top row is empty and we still have rows to reveal, scroll down
        if (!hasTopRowBubble && this.visibleRowOffset < this.totalLevelRows) {
            this.scrollBubblesDownAndReveal();
        }
    }

    private scrollBubblesDownAndReveal() {
        // Move all existing bubbles down by 1 row
        const bubblesToMove: { bubble: BubbleGO; newR: number; newC: number }[] = [];

        for (const [key, bubble] of this.occupied) {
            bubblesToMove.push({
                bubble,
                newR: bubble.cellR + 1,
                newC: bubble.cellC
            });
        }

        // Check if any bubble would go past max rows (game over condition)
        const maxAllowedRow = this.maxRows - 2;
        for (const item of bubblesToMove) {
            if (item.newR > maxAllowedRow) {
                // Don't scroll if it would push bubbles too low
                return;
            }
        }

        // Clear occupied map
        this.occupied.clear();

        // Move bubbles to new positions
        for (const item of bubblesToMove) {
            const { bubble, newR, newC } = item;
            const { x, y } = this.cellToWorld(newR, newC);

            bubble.cellR = newR;
            bubble.cellC = newC;
            bubble.x = x;
            bubble.y = y;

            this.occupied.set(this.key(newR, newC), bubble);
        }

        // Spawn new row at the top (row 0)
        const cols = this.cols;
        for (let c = 0; c < cols; c++) {
            // Random chance to spawn (70% fill rate)
            if (Math.random() < 0.7) {
                const colorHex = this.levelColors[Math.floor(Math.random() * this.levelColors.length)] as HexColor;
                this.placeBubble(0, c, colorHex);
            }
        }

        this.visibleRowOffset++;
    }

    private setupInput() {
        this.input.mouse?.disableContextMenu();
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.gameOver) return;
            if (this.projectile?.active) return; // already shooting
            if (this.shotsLeft <= 0) return;

            if (pointer.rightButtonDown() || pointer.button === 2) {
                this.swapLoadedWithQueued();
                return;
            }

            this.fire(pointer.worldX, pointer.worldY);
        });
    }

    private setupBoosters() {
        ensurePhosphorTextures(this);
        const radius = 28; // Slightly larger buttons
        const spacing = 90; // More spacing
        const barPadding = 20;
        const barW = 100;
        const barH = spacing * 2 + radius * 2 + barPadding * 2 + 20;
        const sideGap = 20;

        let barX = this.playfieldRight + sideGap;
        if (barX + barW > GAME.width - 10) {
            barX = this.playfieldLeft - barW - sideGap;
        }
        barX = Phaser.Math.Clamp(barX, 10, GAME.width - barW - 10);

        const desiredY = this.shooterY - barH / 2;
        const barY = Phaser.Math.Clamp(
            desiredY,
            this.playfieldTop + 12,
            this.playfieldBottom - barH - 12
        );

        if (this.boosterBar) this.boosterBar.destroy();
        this.boosterBar = this.add.graphics();

        // Glassmorphism background
        this.boosterBar.fillStyle(hexTo0x(Colors.ui.panel), 0.85); // More transparent
        this.boosterBar.fillRoundedRect(barX, barY, barW, barH, 24);
        this.boosterBar.lineStyle(2, 0xffffff, 0.1); // Subtle border
        this.boosterBar.strokeRoundedRect(barX, barY, barW, barH, 24);

        // Inner detail
        this.boosterBar.fillStyle(0xffffff, 0.03);
        this.boosterBar.fillRoundedRect(barX + 8, barY + 8, barW - 16, barH - 16, 16);

        this.boosterBar.setDepth(7);

        const startX = barX + barW / 2;
        const startY = barY + barPadding + radius + 10;

        this.createBoosterButton("colorSwap", startX, startY, Colors.ui.ctaSecondary, "SWAP");
        this.createBoosterButton("aimGuide", startX, startY + spacing, Colors.ui.reward, "AIM");
        this.createBoosterButton("bomb", startX, startY + spacing * 2, Colors.ui.warning, "BOMB");

        this.updateBoosterUI();
    }

    private createBoosterButton(id: BoosterId, x: number, y: number, color: HexColor, label: string) {
        const radius = 28;
        const container = this.add.container(x, y);
        const iconId: PhosphorIconId = id === "colorSwap" ? "swap" : id === "aimGuide" ? "aim" : "bomb";

        // 1. Shadow (Tugma soyasi)
        const shadow = this.add.circle(2, 4, radius + 2, 0x000000, 0.3);

        // 2. Base (Asosiy rang)
        const base = this.add.circle(0, 0, radius, hexTo0x(color));
        // Cheti biroz ochroq
        base.setStrokeStyle(2, 0xFFFFFF, 0.3);

        // 3. Glass Effect (Tepasidagi yaltirash)
        const gloss = this.add.ellipse(-radius * 0.3, -radius * 0.4, radius * 0.8, radius * 0.5, 0xFFFFFF, 0.2);
        gloss.setRotation(Phaser.Math.DegToRad(-45));

        // 4. Icon (O'rtasidagi rasm)
        const glyph = this.add.image(0, 0, getPhosphorKey(iconId));
        glyph.setDisplaySize(32, 32);
        glyph.setTint(0xFFFFFF); // Oq rangda

        // 5. Badge (Soni yozilgan qizil dumaloqcha)
        const badgeRadius = 10;
        const badgeX = radius - 5;
        const badgeY = -radius + 5;

        const badgeBg = this.add.circle(badgeX, badgeY, badgeRadius, 0xFF3B30); // Qizil
        badgeBg.setStrokeStyle(2, 0xFFFFFF, 1);

        const count = this.add
            .text(badgeX, badgeY, String(GameState.boosters[id]), {
                fontFamily: "Arial, sans-serif",
                fontSize: "12px",
                color: "#ffffff",
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // 6. Label (Tugma nomi)
        const text = this.add
            .text(0, radius + 18, label, {
                fontFamily: "Arial, sans-serif",
                fontSize: "11px",
                color: Colors.ui.textPrimary,
                fontStyle: "bold",
                shadow: { offsetX: 0, offsetY: 1, color: "black", blur: 2, fill: true }
            })
            .setOrigin(0.5);

        // Hover effekti (Sichqoncha borganda yorishish)
        const hover = this.add.circle(0, 0, radius, 0xFFFFFF, 0.2);
        hover.setVisible(false);

        container.add([shadow, base, gloss, glyph, text, badgeBg, count, hover]);

        // Interaktivlik
        const hitArea = new Phaser.Geom.Circle(0, 0, radius + 5);
        container.setInteractive(hitArea, Phaser.Geom.Circle.Contains);
        if (container.input) container.input.cursor = "pointer";

        // Bosish va Hover hodisalari
        container.on("pointerover", () => {
            hover.setVisible(true);
            this.tweens.add({ targets: container, scale: 1.1, duration: 100 });
        });

        container.on("pointerout", () => {
            hover.setVisible(false);
            this.tweens.add({ targets: container, scale: 1, duration: 100 });
        });

        container.on("pointerdown", (p: any, lx: number, ly: number, event: any) => {
            event.stopPropagation();
            this.useBooster(id);
            // Bosish animatsiyasi
            this.tweens.add({
                targets: container,
                scale: 0.9,
                duration: 50,
                yoyo: true
            });
        });

        this.boosterUI[id] = container;
        this.boosterCountText[id] = count;
    }

    private updateBoosterUI() {
        (Object.keys(GameState.boosters) as BoosterId[]).forEach((id) => {
            const count = GameState.boosters[id];
            const container = this.boosterUI[id];
            const countText = this.boosterCountText[id];
            if (!container || !countText) return;
            countText.setText(String(count));
            container.setAlpha(count > 0 ? 1 : 0.45);
        });
    }

    private async useBooster(id: BoosterId) {
        if (this.gameOver) return;
        if (this.projectile?.active) return;
        if (GameState.boosters[id] <= 0) return;

        this.audio.play("sfx_click");

        const success = await GameState.useBooster(id);
        if (!success) return;

        if (id === "colorSwap") {
            this.swapLoadedWithQueued();
        } else if (id === "aimGuide") {
            this.aimGuideActive = true;
        } else if (id === "bomb") {
            this.bombActive = true;
            this.updateBombIndicator();
        }

        this.updateBoosterUI();
    }

    // -------------------------
    // HUD (minimal)
    // -------------------------

    private drawHUD() {
        this.hud = new HUD(this, {
            level: this.level,
            score: this.score,
            shots: this.shotsLeft,
            targetScore: this.levelTargetScore // <-- MUHIM
        });
        this.hud.setDepth(10);
    }

    // -------------------------
    // Shooting
    // -------------------------

    private updateAimLine() {
        if (!this.aimLine) return;

        const p = this.input.activePointer;
        const fromX = this.shooterX;
        const fromY = this.shooterY;

        const dir = this.getAimDirection(p.worldX, p.worldY);

        const left = this.playfieldLeft + BUBBLES.radius;
        const right = this.playfieldRight - BUBBLES.radius;
        const top = this.playfieldTop + BUBBLES.radius;
        const step = this.aimGuideActive ? 10 : 14;
        const maxSteps = this.aimGuideActive ? 120 : 90;

        let x = fromX;
        let y = fromY;
        let vx = dir.x;
        let vy = dir.y;
        let hit: { x: number; y: number } | null = null;

        this.aimLine.clear();
        this.aimLine.fillStyle(hexTo0x(this.nextColor), this.aimGuideActive ? 0.85 : 0.6);

        for (let i = 0; i < maxSteps; i++) {
            x += vx * step;
            y += vy * step;

            if (x <= left) {
                x = left;
                vx = Math.abs(vx);
            } else if (x >= right) {
                x = right;
                vx = -Math.abs(vx);
            }

            if (y <= top || this.findCollisionBubble(x, y)) {
                hit = { x, y };
                break;
            }

            if (i % 3 === 0) { // Siyrakroq nuqtalar
                // Nuqta orqasi (Border effekti uchun)
                this.aimLine.fillStyle(hexTo0x(Colors.bubbles.blue), 1);
                this.aimLine.fillCircle(x, y, 5);

                // Nuqta ichi (Oq)
                this.aimLine.fillStyle(0xffffff, 1);
                this.aimLine.fillCircle(x, y, 3);
            }
        }

        if (hit) {
            this.aimLine.fillStyle(hexTo0x(Colors.ui.textPrimary), 0.75);
            this.aimLine.fillCircle(hit.x, hit.y, 4);
            this.aimLine.fillStyle(hexTo0x(this.nextColor), 0.9);
            this.aimLine.fillCircle(hit.x, hit.y, 2.5);
            this.updateAimGhost(hit.x, hit.y);
        } else {
            this.hideAimGhost();
        }
    }

    private fire(targetX: number, targetY: number) {
        if (!this.nextBubble) return;

        this.audio.play("sfx_shoot");

        // Direction from shooter to target
        const dir = this.getAimDirection(targetX, targetY);

        // Create projectile bubble
        const colorHex = this.nextColor;
        const firedBubble = this.nextBubble;
        firedBubble.disableInteractive();
        this.projectile = {
            go: firedBubble,
            colorHex,
            vx: dir.x * BUBBLES.launchSpeedPxPerSec,
            vy: dir.y * BUBBLES.launchSpeedPxPerSec,
            active: true,
            isBomb: this.bombActive,
        };
        this.projectile.go.setDepth(7);
        this.nextBubble = undefined;

        // Consume shot
        this.shotsLeft -= 1;
        this.hud?.setShots(this.shotsLeft);

        // Prepare next
        if (this.aimGuideActive) {
            this.aimGuideActive = false;
        }
        if (this.bombActive) {
            this.bombActive = false;
            this.updateBombIndicator();
        }
        this.promoteQueuedBubble();

        // Quick feedback
        this.tweens.add({
            targets: this.projectile.go,
            scale: { from: 0.9, to: 1 },
            duration: 80,
            ease: "Quad.Out",
        });

        // If no shots left after firing and nothing matches, we will show lose when projectile resolves
    }

    private getAimDirection(targetX: number, targetY: number): Phaser.Math.Vector2 {
        const dx = targetX - this.shooterX;
        const dy = targetY - this.shooterY;

        let angleDeg = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
        const min = -INPUT.aim.maxAngleDeg;
        const max = -INPUT.aim.minAngleDeg;
        angleDeg = Phaser.Math.Clamp(angleDeg, min, max);

        const angle = Phaser.Math.DegToRad(angleDeg);
        return new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle));
    }

    private updateAimGhost(worldX: number, worldY: number) {
        const best = this.findNearestEmptyCell(worldX, worldY);
        if (!best) {
            this.hideAimGhost();
            return;
        }

        const { x, y } = this.cellToWorld(best.r, best.c);

        if (!this.aimGhost) {
            this.aimGhost = this.add.circle(x, y, BUBBLES.radius, hexTo0x(this.nextColor), 0.35);
            this.aimGhost.setStrokeStyle(3, hexTo0x(Colors.ui.textSecondary), 0.5);
            this.aimGhost.setDepth(4);
        } else {
            this.aimGhost.setPosition(x, y);
            this.aimGhost.setFillStyle(hexTo0x(this.nextColor), 0.35);
        }

        this.aimGhost.setVisible(true);
    }

    private hideAimGhost() {
        if (this.aimGhost) this.aimGhost.setVisible(false);
    }

    private addScore(amount: number, x?: number, y?: number) {
        const safe = Math.max(0, Math.floor(amount));
        if (!safe) return;

        this.score += safe;
        this.hud?.setScore(this.score);
        this.hud?.setScore(this.score);
        if (x === undefined || y === undefined) return;

        this.effectManager.spawnFloatingText(x, y, `+${safe}`, 0xffd700);
    }

    private playPop(bubble: BubbleGO) {
        const x = bubble.x;
        const y = bubble.y;
        const radius = bubble.bubbleRadius ?? BUBBLES.radius;
        const color = bubble.colorHex;

        this.spawnPopBurst(x, y, color, radius);

        this.tweens.add({
            targets: bubble,
            scale: 0,
            alpha: 0,
            duration: 200,
            ease: "Back.In",
            onComplete: () => bubble.destroy(),
        });
    }

    private spawnPopBurst(x: number, y: number, colorHex: HexColor, radius: number) {
        this.effectManager.spawnPopParticles(x, y, colorHex, 10);

        // Simple ring expand for extra impact
        const ring = this.add.circle(x, y, radius, 0xffffff, 0);
        ring.setStrokeStyle(3, hexTo0x(colorHex), 0.8);
        ring.setDepth(9);

        this.tweens.add({
            targets: ring,
            scale: 1.5,
            alpha: 0,
            duration: 300,
            ease: "Quad.Out",
            onComplete: () => ring.destroy(),
        });
    }


    private removeFloatingBubbles(): number {
        const connected = new Set<CellKey>();
        const queue: Array<{ r: number; c: number }> = [];

        for (let c = 0; c < this.cols; c++) {
            const k = this.key(0, c);
            if (this.occupied.has(k)) {
                connected.add(k);
                queue.push({ r: 0, c });
            }
        }

        while (queue.length) {
            const cur = queue.shift()!;
            for (const nb of this.neighbors(cur.r, cur.c)) {
                const k = this.key(nb.r, nb.c);
                if (connected.has(k)) continue;
                if (!this.occupied.has(k)) continue;
                connected.add(k);
                queue.push(nb);
            }
        }

        const toDrop: BubbleGO[] = [];
        for (const b of this.occupied.values()) {
            const k = this.key(b.cellR, b.cellC);
            if (!connected.has(k)) {
                toDrop.push(b);
            }
        }

        for (const b of toDrop) {
            this.occupied.delete(this.key(b.cellR, b.cellC));
            this.playDrop(b);
        }

        return toDrop.length;
    }

    private playDrop(bubble: BubbleGO) {
        const dropDist = GAME.height - bubble.y + 200;
        const rot = Phaser.Math.FloatBetween(-0.12, 0.12);
        this.tweens.add({
            targets: bubble,
            y: bubble.y + dropDist,
            rotation: rot,
            alpha: 0,
            duration: 620,
            ease: "Quad.In",
            onComplete: () => bubble.destroy(),
        });
    }

    private bindSwapHandler(target?: Phaser.GameObjects.GameObject) {
        if (!target || !(target as any).setInteractive) return;
        const asAny = target as any;
        if (typeof asAny.bubbleRadius === "number") {
            asAny.setInteractive(
                new Phaser.Geom.Circle(0, 0, asAny.bubbleRadius),
                Phaser.Geom.Circle.Contains
            );
            if (asAny.input) asAny.input.cursor = "pointer";
        } else {
            asAny.setInteractive({ useHandCursor: true });
        }
        target.on(
            "pointerdown",
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
                this.swapLoadedWithQueued();
            }
        );
    }

    private swapLoadedWithQueued() {
        if (this.projectile?.active) return;
        if (!this.nextBubble || !this.queuedBubble) return;

        const temp = this.nextColor;
        this.nextColor = this.queuedColor;
        this.queuedColor = temp;

        this.setBubbleColor(this.nextBubble, this.nextColor);
        this.setBubbleColor(this.queuedBubble, this.queuedColor);

        this.tweens.add({
            targets: this.nextBubble,
            scale: { from: 0.92, to: 1 },
            duration: 120,
            ease: "Quad.Out",
        });
        this.tweens.add({
            targets: this.queuedBubble,
            scale: { from: 0.85, to: 1 },
            duration: 120,
            ease: "Quad.Out",
        });

        if (this.aimGhost?.visible) {
            this.aimGhost.setFillStyle(hexTo0x(this.nextColor), 0.35);
        }

        this.updateBombIndicator();
    }

    private promoteQueuedBubble() {
        const bubble = this.queuedBubble;
        const color = this.queuedColor;

        this.queuedBubble = undefined;
        this.nextColor = color;

        if (bubble) {
            bubble.destroy();
        }

        // Preview (kichik) shardan -> Asosiy (katta) sharga aylantiramiz
        const startScale = this.previewRadius / BUBBLES.radius;

        // Yangi shar yaratamiz (Shooter koordinatasida emas, Preview koordinatasida paydo bo'lib, uchib keladi)
        this.nextBubble = this.makeBubbleVisual(this.previewX, this.previewY, this.nextColor, BUBBLES.radius);

        // --- MUHIM TUZATISH ---
        // Avval 5 edi, endi 21 qilamiz (Pushkadan baland bo'lishi uchun)
        this.nextBubble.setDepth(21);
        // ----------------------

        this.nextBubble.setScale(startScale);
        this.bindSwapHandler(this.nextBubble);
        this.updateBombIndicator();

        // Animatsiya: Kichik joyidan katta joyiga (Pushkaga) uchib kelishi
        this.tweens.add({
            targets: this.nextBubble,
            x: this.shooterX,
            y: this.shooterY,
            scale: 1,
            duration: 140,
            ease: "Quad.Out",
        });

        // Keyingi navbatdagi sharni tayyorlash
        this.queueNextBubble();
    }

    private queueNextBubble() {
        this.queuedColor = this.pickAvailableColor(this.nextColor);

        if (this.queuedBubble) {
            this.queuedBubble.destroy();
        }

        this.queuedBubble = this.makeBubbleVisual(this.previewX, this.previewY, this.queuedColor, this.previewRadius);
        this.queuedBubble.setDepth(5);
        this.bindSwapHandler(this.queuedBubble);
    }

    private getAvailableColors(): HexColor[] {
        const set = new Set<HexColor>();
        for (const b of this.occupied.values()) {
            set.add(b.colorHex);
        }
        return Array.from(set);
    }

    private pickAvailableColor(avoid?: HexColor): HexColor {
        const available = this.getAvailableColors();
        if (available.length === 0) return randomBubbleHex();
        if (!avoid || available.length === 1) {
            return available[Math.floor(Math.random() * available.length)]!;
        }
        const filtered = available.filter((c) => c !== avoid);
        if (filtered.length === 0) {
            return available[Math.floor(Math.random() * available.length)]!;
        }
        return filtered[Math.floor(Math.random() * filtered.length)]!;
    }

    private ensureNextColorsValid() {
        const available = this.getAvailableColors();
        if (available.length === 0) return;

        if (this.nextBubble && !available.includes(this.nextColor)) {
            this.nextColor = this.pickAvailableColor();
            this.setBubbleColor(this.nextBubble, this.nextColor);
            if (this.aimGhost?.visible) {
                this.aimGhost.setFillStyle(hexTo0x(this.nextColor), 0.35);
            }
        }

        if (this.queuedBubble && !available.includes(this.queuedColor)) {
            this.queuedColor = this.pickAvailableColor(this.nextColor);
            this.setBubbleColor(this.queuedBubble, this.queuedColor);
        }

        this.updateBombIndicator();
    }

    private destroyProjectile() {
        if (!this.projectile) return;

        this.projectile.go.destroy();
        this.projectile.active = false;
        this.projectile = null;

        // Lose check (minimal): if shots finished, show overlay and return menu
        if (this.shotsLeft <= 0) {
            this.showLosePopup();
        }
    }

    // -------------------------
    // Grid + Placement
    // -------------------------

    private snapProjectileToGrid(
        worldX: number,
        worldY: number,
        colorHex: HexColor,
        isBomb = false
    ) {
        const best = this.findNearestEmptyCell(worldX, worldY);
        if (!best) return;

        const { r, c } = best;
        const placed = this.placeBubble(r, c, colorHex);

        if (isBomb) {
            this.audio.play("sfx_pop");
            this.effectManager.shake(0.01, 200);
            const toRemove = [placed, ...this.getNeighborsBubbles(placed.cellR, placed.cellC)];
            const unique = new Set<BubbleGO>();
            for (const b of toRemove) unique.add(b);
            for (const b of unique) {
                this.occupied.delete(this.key(b.cellR, b.cellC));
                this.playPop(b);
            }
            const dropped = this.removeFloatingBubbles();
            if (dropped > 0) {
                this.addScore(dropped * 5);
            }
            this.ensureNextColorsValid();
            return;
        }

        // Match & remove
        const match = this.findMatchGroup(placed);
        if (match.length >= BUBBLES.minMatchCount) {
            this.audio.play("sfx_pop");
            this.effectManager.shake(0.004, 120);
            for (const b of match) {
                this.occupied.delete(this.key(b.cellR, b.cellC));
                this.playPop(b);
            }
            this.addScore(match.length * 10, placed.x, placed.y);

            const dropped = this.removeFloatingBubbles();
            if (dropped > 0) {
                this.addScore(dropped * 5);
            }

            this.ensureNextColorsValid();

            // Scroll reveal: check if we should reveal more rows from top
            this.checkAndRevealRows();
        }

        // Win condition (minimal): if no bubbles remain, next level
        if (this.occupied.size === 0) {
            this.audio.play("sfx_win");
            this.level += 1;
            this.restartForNextLevel();
        }
    }

    private placeBubble(r: number, c: number, colorHex: HexColor): BubbleGO {
        const { x, y } = this.cellToWorld(r, c);

        const bubble = this.makeBubbleVisual(x, y, colorHex, BUBBLES.radius) as BubbleGO;
        bubble.cellR = r;
        bubble.cellC = c;
        bubble.colorHex = colorHex;

        this.occupied.set(this.key(r, c), bubble);
        return bubble;
    }

    private findNearestEmptyCell(worldX: number, worldY: number): { r: number; c: number } | null {
        let best: { r: number; c: number; d2: number } | null = null;

        // Search a bounded grid window (fast enough for MVP)
        const rowsToCheck = this.maxRows + 8; // allow a bit of expansion downward
        for (let r = 0; r < rowsToCheck; r++) {
            for (let c = 0; c < this.cols; c++) {
                const k = this.key(r, c);
                if (this.occupied.has(k)) continue;

                const { x, y } = this.cellToWorld(r, c);
                const dx = x - worldX;
                const dy = y - worldY;
                const d2 = dx * dx + dy * dy;

                if (!best || d2 < best.d2) best = { r, c, d2 };
            }
        }

        return best ? { r: best.r, c: best.c } : null;
    }

    private cellToWorld(r: number, c: number): { x: number; y: number } {
        const rowOffset = (r % 2) * (BUBBLES.radius);
        const x = this.playfieldLeft + rowOffset + c * this.hSpacing + BUBBLES.radius;
        const y = this.gridTopY + r * this.vSpacing + BUBBLES.radius;
        return { x, y };
    }

    // -------------------------
    // Collision
    // -------------------------

    private findCollisionBubble(x: number, y: number): BubbleGO | null {
        const rr = BUBBLES.diameter - 2;
        const rr2 = rr * rr;

        for (const b of this.occupied.values()) {
            const dx = b.x - x;
            const dy = b.y - y;
            if (dx * dx + dy * dy <= rr2) return b;
        }
        return null;
    }

    // -------------------------
    // Match finding (BFS)
    // -------------------------

    private findMatchGroup(start: BubbleGO): BubbleGO[] {
        const target = start.colorHex;
        const visited = new Set<CellKey>();
        const out: BubbleGO[] = [];

        const q: Array<{ r: number; c: number }> = [{ r: start.cellR, c: start.cellC }];
        visited.add(this.key(start.cellR, start.cellC));

        while (q.length) {
            const cur = q.shift()!;
            const b = this.occupied.get(this.key(cur.r, cur.c));
            if (!b) continue;
            if (b.colorHex !== target) continue;

            out.push(b);

            for (const nb of this.neighbors(cur.r, cur.c)) {
                const k = this.key(nb.r, nb.c);
                if (visited.has(k)) continue;
                visited.add(k);

                const bb = this.occupied.get(k);
                if (bb && bb.colorHex === target) q.push(nb);
            }
        }

        return out;
    }

    private neighbors(r: number, c: number): Array<{ r: number; c: number }> {
        // Offset coordinates neighbors (odd-r)
        const isOdd = r % 2 === 1;

        const dirsEven = [
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
            { dr: -1, dc: -1 },
            { dr: -1, dc: 0 },
            { dr: 1, dc: -1 },
            { dr: 1, dc: 0 },
        ];

        const dirsOdd = [
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
            { dr: -1, dc: 0 },
            { dr: -1, dc: 1 },
            { dr: 1, dc: 0 },
            { dr: 1, dc: 1 },
        ];

        const dirs = isOdd ? dirsOdd : dirsEven;
        const res: Array<{ r: number; c: number }> = [];

        for (const d of dirs) {
            const rr = r + d.dr;
            const cc = c + d.dc;
            if (rr < 0 || cc < 0 || cc >= this.cols) continue;
            res.push({ r: rr, c: cc });
        }
        return res;
    }

    private getNeighborsBubbles(r: number, c: number): BubbleGO[] {
        const out: BubbleGO[] = [];
        for (const nb of this.neighbors(r, c)) {
            const b = this.occupied.get(this.key(nb.r, nb.c));
            if (b) out.push(b);
        }
        return out;
    }

    // -------------------------
    // Lose / Next level
    // -------------------------

    private showLosePopup() {
        this.audio.play("sfx_lose");
        this.gameOver = true;
        this.aimLine?.clear();
        this.aimLine?.setVisible(false);
        this.hideAimGhost();

        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.5);
        g.fillRect(0, 0, GAME.width, GAME.height);

        const panelW = 520;
        const panelH = 320;

        const panel = this.add.rectangle(GAME.width / 2, GAME.height / 2, panelW, panelH, hexTo0x(Colors.ui.panel));
        panel.setStrokeStyle(4, hexTo0x(Colors.ui.warning), 0.6);

        this.add
            .text(GAME.width / 2, GAME.height / 2 - 80, "Out of shots!", {
                fontFamily: "Arial, sans-serif",
                fontSize: "44px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        const btn = this.add
            .rectangle(GAME.width / 2, GAME.height / 2 + 70, 320, 86, hexTo0x(Colors.ui.ctaPrimaryTop))
            .setStrokeStyle(4, hexTo0x(Colors.ui.ctaPrimaryBottom))
            .setInteractive({ useHandCursor: true });

        this.add
            .text(GAME.width / 2, GAME.height / 2 + 70, "MENU", {
                fontFamily: "Arial, sans-serif",
                fontSize: "34px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        btn.on("pointerdown", () => {
            this.scene.start("MenuScene");
        });
    }

    private restartForNextLevel() {
        // Minimal: clear and respawn
        for (const b of this.occupied.values()) b.destroy();
        this.occupied.clear();

        this.shotsLeft = this.computeShotsForLevel(this.level);
        this.spawnInitialBubbles();
        this.ensureNextColorsValid();
        this.hud?.setLevel(this.level);
        this.hud?.setShots(this.shotsLeft);
    }

    private computeShotsForLevel(level: number): number {
        const base = LEVELS.difficulty.baseShots;
        const dec = Math.floor((level - 1) / LEVELS.difficulty.shotsDecreaseEveryLevels);
        return Math.max(LEVELS.difficulty.minShots, base - dec * 2);
    }

    // -------------------------
    // Utils
    // -------------------------

    private key(r: number, c: number): CellKey {
        return `${r},${c}`;
    }

    private makeBubbleVisual(x: number, y: number, colorHex: HexColor, radius: number): BubbleVisual {
        const bubble = this.add.container(x, y) as BubbleVisual;

        // 1. Soya
        const shadow = this.add.circle(2, 4, radius, 0x000000, 0.2);

        // 2. Asosiy Shar (Bu "base" bo'ladi)
        const base = this.add.circle(0, 0, radius, hexTo0x(colorHex));
        base.setStrokeStyle(1, 0x000000, 0.1);

        // 3. Ichki Soya
        const innerShade = this.add.circle(radius * 0.15, radius * 0.15, radius * 0.85, 0x000000, 0.15);
        innerShade.setBlendMode(Phaser.BlendModes.MULTIPLY);

        // 4. Yaltirash (Gloss)
        const gloss = this.add.ellipse(-radius * 0.35, -radius * 0.35, radius * 0.6, radius * 0.4, 0xffffff, 0.7);
        gloss.setRotation(Phaser.Math.DegToRad(-45));

        const sparkle = this.add.circle(-radius * 0.45, -radius * 0.45, radius * 0.15, 0xffffff, 0.9);

        // Hamma elementlarni konteynerga qo'shamiz
        bubble.add([shadow, base, innerShade, gloss, sparkle]);
        bubble.setSize(radius * 2, radius * 2);

        // !!! ENG MUHIM QISM: Xususiyatlarni biriktirish !!!
        // Bu bo'lmasa "Cannot read properties of undefined" beradi
        bubble.base = base;
        bubble.gloss = gloss;
        bubble.shade = innerShade;
        bubble.bubbleRadius = radius;
        bubble.colorHex = colorHex;

        return bubble;
    }

    private setBubbleColor(bubble: BubbleVisual, colorHex: HexColor) {
        // 1. Xavfsizlik tekshiruvi: Agar bubble yoki uning asosi yo'q bo'lsa, kod sinmasin
        if (!bubble || !bubble.base) return;

        // 2. Rangi o'zgartirish
        // DİQQAT: Biz "Arc" (Circle) ishlatganimiz uchun "clear()" kerak emas!
        // Shunchaki setFillStyle ishlatamiz.
        bubble.base.setFillStyle(hexTo0x(colorHex));

        // 3. Kodni yangilash
        bubble.colorHex = colorHex;
    }

    private updateBombIndicator() {
        // Agar bubble yoki uning asosi (base) yo'q bo'lsa, to'xtasin
        if (!this.nextBubble || !this.nextBubble.base) return;

        const strokeColor = this.bombActive ? Colors.ui.warning : Colors.ui.textPrimary;

        // Bu yerda xatolik chiqmaydi, chunki yuqorida tekshirdik
        this.nextBubble.base.setStrokeStyle(2, hexTo0x(strokeColor), this.bombActive ? 0.9 : 0.25);
    }
}
