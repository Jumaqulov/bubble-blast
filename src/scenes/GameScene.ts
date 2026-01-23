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
    base: Phaser.GameObjects.Arc;
    gloss: Phaser.GameObjects.Arc;
    shade: Phaser.GameObjects.Arc;
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

    private hud?: HUD;

    private nextBubble?: BubbleVisual;
    private nextColor: HexColor = Colors.bubbles.blue;
    private queuedBubble?: BubbleVisual;
    private queuedColor: HexColor = Colors.bubbles.blue;

    private projectile: Projectile | null = null;

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

        // Background gradient
        gfx.fillGradientStyle(
            hexTo0x(Colors.ui.background),
            hexTo0x(Colors.ui.background),
            hexTo0x(Colors.ui.backgroundDeep),
            hexTo0x(Colors.ui.backgroundDeep),
            1
        );
        gfx.fillRect(0, 0, GAME.width, GAME.height);

        // Subtle bubble rings for texture
        gfx.lineStyle(2, hexTo0x(Colors.ui.textSecondary), 0.07);
        const rings = [
            { x: 90, y: 260, r: 64 },
            { x: 620, y: 220, r: 48 },
            { x: 580, y: 700, r: 86 },
            { x: 130, y: 860, r: 52 },
        ];
        for (const ring of rings) {
            gfx.strokeCircle(ring.x, ring.y, ring.r);
        }

        // Playfield panel - Shifted left to make room for sidebar
        const barH = 96;
        const panelTop = barH + 14;
        const panelBottom = GAME.height - 18;

        // We need space for 10 cols * 48px = ~480-500px content
        // Plus padding (12px inset * 2). Let's make panel width 540px
        const panelW = 540;
        const panelH = panelBottom - panelTop;

        // Left align with small margin
        const panelX = 20;
        const panelY = panelTop;
        const innerInset = 16;

        this.playfieldLeft = panelX + innerInset;
        this.playfieldRight = panelX + panelW - innerInset;
        this.playfieldTop = panelY + innerInset;
        this.playfieldBottom = panelY + panelH - innerInset;
        this.gridTopY = this.playfieldTop;

        gfx.fillStyle(0x000000, 0.26);
        gfx.fillRoundedRect(panelX + 6, panelY + 10, panelW, panelH, 28);

        gfx.fillStyle(hexTo0x(Colors.ui.playfield), 1);
        gfx.fillRoundedRect(panelX, panelY, panelW, panelH, 28);

        // Subtle inner highlight (avoid visible "box")
        gfx.fillStyle(0xffffff, 0.04);
        gfx.fillRoundedRect(panelX + 14, panelY + 12, panelW - 28, 6, 4);

        gfx.lineStyle(3, hexTo0x(Colors.ui.playfieldBorder), 0.95);
        gfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 28);

        gfx.lineStyle(2, 0xffffff, 0.16);
        gfx.strokeRoundedRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, 24);
        gfx.lineStyle(2, 0x000000, 0.25);
        gfx.strokeRoundedRect(panelX + 10, panelY + 10, panelW - 20, panelH - 20, 22);

        gfx.setDepth(-100);
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
        this.shooterY = GAME.height - 170;

        // Shooter base + ring (3D)
        const baseShadow = this.add.circle(this.shooterX + 6, this.shooterY + 44, 56, 0x000000, 0.28);
        const base = this.add.circle(this.shooterX, this.shooterY + 36, 54, hexTo0x(Colors.ui.panel));
        base.setStrokeStyle(3, hexTo0x(Colors.ui.playfieldBorder), 0.8);
        const baseHighlight = this.add.circle(this.shooterX, this.shooterY + 30, 48, 0xffffff, 0.08);

        const shooterRingOuter = this.add
            .circle(this.shooterX, this.shooterY, BUBBLES.radius + 18, 0x000000, 0.22)
            .setStrokeStyle(3, 0xffffff, 0.55);
        const shooterRingInner = this.add
            .circle(this.shooterX, this.shooterY, BUBBLES.radius + 12, 0xffffff, 0.06)
            .setStrokeStyle(2, 0x000000, 0.3);

        baseShadow.setDepth(2);
        base.setDepth(3);
        baseHighlight.setDepth(4);
        shooterRingOuter.setDepth(4);
        shooterRingInner.setDepth(5);

        // Aim line
        this.aimLine = this.add.graphics();
        this.aimLine.setDepth(6);

        // Next bubble (loaded)
        this.nextColor = this.pickAvailableColor();
        this.nextBubble = this.makeBubbleVisual(this.shooterX, this.shooterY, this.nextColor, BUBBLES.radius);
        this.nextBubble.setDepth(5);
        this.bindSwapHandler(this.nextBubble);
        this.updateBombIndicator();

        // Next preview slot (queued)
        this.previewX = this.shooterX + 118;
        this.previewY = this.shooterY + 6;
        this.previewRadius = Math.round(BUBBLES.radius * 0.62);

        this.nextSlot = this.add
            .circle(this.previewX, this.previewY, this.previewRadius + 14, 0x000000, 0.25)
            .setStrokeStyle(3, hexTo0x(Colors.ui.textPrimary), 0.5);
        this.nextSlot.setDepth(4);

        this.queuedColor = this.pickAvailableColor(this.nextColor);
        this.queuedBubble = this.makeBubbleVisual(this.previewX, this.previewY, this.queuedColor, this.previewRadius);
        this.queuedBubble.setDepth(5);

        this.drawSwapHint();
        this.bindSwapHandler(this.nextSlot);
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
        const radius = 28; // Increased radius to match setupBoosters
        const container = this.add.container(x, y);
        const iconId: PhosphorIconId = id === "colorSwap" ? "swap" : id === "aimGuide" ? "aim" : "bomb";

        // Enhanced shadow and depth
        const shadow = this.add.circle(4, 8, radius + 4, 0x000000, 0.3);
        const back = this.add.circle(0, 0, radius + 4, 0x000000, 0.4); // Darker border ring

        // Main button body
        const activeColor = hexTo0x(color);
        const icon = this.add.circle(0, 0, radius, activeColor, 1);

        // Gradient/lighting effects
        const innerGlow = this.add.circle(-radius / 3, -radius / 3, radius, 0xffffff, 0.15); // Top-left highlight
        const innerShade = this.add.circle(radius / 3, radius / 3, radius, 0x000000, 0.1); // Bottom-right shadow

        // Glassy cap
        const gloss = this.add.circle(0, -radius * 0.5, radius * 0.8, 0xffffff, 0.1);
        gloss.setScale(1.2, 0.7);

        // Icon
        const glyph = this.add.image(0, 0, getPhosphorKey(iconId));
        glyph.setDisplaySize(radius * 1.1, radius * 1.1);
        glyph.setTint(0xffffff);
        glyph.setAlpha(0.95);

        // Badge (count) - Positioned at top-right
        const badgeRadius = 10;
        const badgeX = radius - 4;
        const badgeY = -radius + 4;
        const badge = this.add.circle(badgeX, badgeY, badgeRadius, 0xff3333, 1); // Red notification style
        badge.setStrokeStyle(2, 0xffffff, 1);

        const count = this.add
            .text(badgeX, badgeY, String(GameState.boosters[id]), {
                fontFamily: "Arial, sans-serif",
                fontSize: "11px",
                color: "#ffffff",
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // Label below button
        const text = this.add
            .text(0, radius + 14, label, {
                fontFamily: "Arial, sans-serif",
                fontSize: "11px",
                color: Colors.ui.textPrimary, // e.g. white/light grey
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // Hover effect overlay (invisible by default)
        const hover = this.add.circle(0, 0, radius, 0xffffff, 0.2);
        hover.setVisible(false);

        container.add([shadow, back, icon, innerGlow, innerShade, gloss, glyph, text, badge, count, hover]);
        container.setSize(radius * 2 + 10, radius * 2 + 10);

        // Improve interaction area
        const hitArea = new Phaser.Geom.Circle(0, 0, radius + 5);
        container.setInteractive(hitArea, Phaser.Geom.Circle.Contains);

        if (container.input) container.input.cursor = "pointer";

        container.on(
            "pointerover",
            () => {
                hover.setVisible(true);
                this.tweens.add({
                    targets: container,
                    scale: 1.05,
                    duration: 100,
                    ease: "Back.easeOut"
                });
            }
        );

        container.on(
            "pointerout",
            () => {
                hover.setVisible(false);
                this.tweens.add({
                    targets: container,
                    scale: 1,
                    duration: 100,
                    ease: "Back.easeOut"
                });
            }
        );

        container.on(
            "pointerdown",
            (
                _pointer: Phaser.Input.Pointer,
                _localX: number,
                _localY: number,
                event: Phaser.Types.Input.EventData
            ) => {
                event.stopPropagation();
                this.useBooster(id);
            }
        );

        container.setDepth(8);

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

            if (i % 2 === 0) {
                this.aimLine.fillCircle(x, y, this.aimGuideActive ? 3.5 : 3);
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

        const startScale = this.previewRadius / BUBBLES.radius;
        this.nextBubble = this.makeBubbleVisual(this.previewX, this.previewY, this.nextColor, BUBBLES.radius);
        this.nextBubble.setDepth(5);
        this.nextBubble.setScale(startScale);
        this.bindSwapHandler(this.nextBubble);
        this.updateBombIndicator();
        this.tweens.add({
            targets: this.nextBubble,
            x: this.shooterX,
            y: this.shooterY,
            scale: 1,
            duration: 140,
            ease: "Quad.Out",
        });

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

        const shadow = this.add.circle(4, 7, radius * 1.03, 0x000000, 0.3);
        const base = this.add.circle(0, 0, radius, hexTo0x(colorHex));
        base.setStrokeStyle(2, 0xffffff, 0.25);

        const innerShade = this.add.circle(radius * 0.22, radius * 0.3, radius * 0.92, 0x000000, 0.22);
        const rim = this.add.circle(0, 0, radius * 0.98, 0xffffff, 0);
        rim.setStrokeStyle(2, 0xffffff, 0.15);

        const gloss = this.add.circle(-radius * 0.34, -radius * 0.36, radius * 0.34, 0xffffff, 0.4);
        const glossSoft = this.add.circle(-radius * 0.12, -radius * 0.08, radius * 0.7, 0xffffff, 0.04);
        const sparkle = this.add.circle(-radius * 0.12, -radius * 0.56, Math.max(2, radius * 0.12), 0xffffff, 0.55);

        innerShade.setBlendMode(Phaser.BlendModes.MULTIPLY);
        glossSoft.setBlendMode(Phaser.BlendModes.SCREEN);
        gloss.setBlendMode(Phaser.BlendModes.SCREEN);
        sparkle.setBlendMode(Phaser.BlendModes.SCREEN);

        bubble.add([shadow, base, innerShade, rim, glossSoft, gloss, sparkle]);
        bubble.setSize(radius * 2, radius * 2);

        bubble.base = base;
        bubble.gloss = gloss;
        bubble.shade = innerShade;
        bubble.bubbleRadius = radius;
        bubble.colorHex = colorHex;

        return bubble;
    }

    private setBubbleColor(bubble: BubbleVisual, colorHex: HexColor) {
        bubble.base.setFillStyle(hexTo0x(colorHex));
        bubble.colorHex = colorHex;
    }

    private updateBombIndicator() {
        if (!this.nextBubble) return;
        const strokeColor = this.bombActive ? Colors.ui.warning : Colors.ui.textPrimary;
        this.nextBubble.base.setStrokeStyle(2, hexTo0x(strokeColor), this.bombActive ? 0.9 : 0.25);
    }
}
