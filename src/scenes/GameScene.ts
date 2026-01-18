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
};

export class GameScene extends Phaser.Scene {
    private gridTopY = 140;

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

    constructor() {
        super({ key: "GameScene" });
    }

    create() {
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));
        this.drawBackdrop();

        this.level = LEVELS.startLevel;
        this.maxRows = Math.min(LEVELS.difficulty.maxRows, 12);

        this.setupGridDimensions();
        this.setupShooter();
        this.spawnInitialBubbles();
        this.setupInput();

        this.shotsLeft = this.computeShotsForLevel(this.level);

        this.drawHUD();
    }

    update(_t: number, dtMs: number) {
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
        const left = BUBBLES.radius + 8;
        const right = GAME.width - BUBBLES.radius - 8;
        if (p.go.x <= left) {
            p.go.x = left;
            p.vx *= -1;
        } else if (p.go.x >= right) {
            p.go.x = right;
            p.vx *= -1;
        }

        // Hit top => snap
        if (p.go.y <= this.gridTopY + BUBBLES.radius) {
            this.snapProjectileToGrid(p.go.x, p.go.y, p.colorHex);
            this.destroyProjectile();
            return;
        }

        // Hit any bubble => snap
        const hit = this.findCollisionBubble(p.go.x, p.go.y);
        if (hit) {
            this.snapProjectileToGrid(p.go.x, p.go.y, p.colorHex);
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
        gfx.lineStyle(2, hexTo0x(Colors.ui.textSecondary), 0.08);
        const rings = [
            { x: 90, y: 260, r: 64 },
            { x: 620, y: 220, r: 48 },
            { x: 580, y: 700, r: 86 },
            { x: 130, y: 860, r: 52 },
        ];
        for (const ring of rings) {
            gfx.strokeCircle(ring.x, ring.y, ring.r);
        }

        // Playfield panel
        const barH = 96;
        const panelMarginX = 18;
        const panelTop = barH + 14;
        const panelBottom = GAME.height - 18;
        const panelW = GAME.width - panelMarginX * 2;
        const panelH = panelBottom - panelTop;
        const panelX = panelMarginX;
        const panelY = panelTop;

        gfx.fillStyle(0x000000, 0.18);
        gfx.fillRoundedRect(panelX + 4, panelY + 8, panelW, panelH, 26);

        gfx.fillStyle(hexTo0x(Colors.ui.playfield), 1);
        gfx.fillRoundedRect(panelX, panelY, panelW, panelH, 26);

        gfx.lineStyle(2, hexTo0x(Colors.ui.playfieldBorder), 0.9);
        gfx.strokeRoundedRect(panelX, panelY, panelW, panelH, 26);

        gfx.setDepth(-100);
    }

    private setupGridDimensions() {
        // Fit as many columns as possible with diameter spacing.
        // Keep a small margin so bubbles don't touch screen edge.
        const margin = 18;
        const usable = GAME.width - margin * 2;

        // With offset rows, odd rows shift by radius; keep cols conservative.
        this.cols = Math.floor((usable - BUBBLES.radius) / this.hSpacing);
        if (this.cols < 7) this.cols = 7;
    }

    private setupShooter() {
        this.shooterX = GAME.width / 2;
        this.shooterY = GAME.height - 170;

        // Shooter base + ring
        this.add
            .circle(this.shooterX, this.shooterY + 36, 54, hexTo0x(Colors.ui.panel))
            .setStrokeStyle(4, hexTo0x(Colors.ui.textSecondary));

        const shooterRing = this.add
            .circle(this.shooterX, this.shooterY, BUBBLES.radius + 16, 0x000000, 0.2)
            .setStrokeStyle(3, hexTo0x(Colors.ui.textPrimary), 0.6);
        shooterRing.setDepth(4);

        // Aim line
        this.aimLine = this.add.graphics();
        this.aimLine.setDepth(6);

        // Next bubble (loaded)
        this.nextColor = randomBubbleHex();
        this.nextBubble = this.makeBubbleVisual(this.shooterX, this.shooterY, this.nextColor, BUBBLES.radius);
        this.nextBubble.setDepth(5);
        this.bindSwapHandler(this.nextBubble);

        // Next preview slot (queued)
        this.previewX = this.shooterX + 118;
        this.previewY = this.shooterY + 6;
        this.previewRadius = Math.round(BUBBLES.radius * 0.62);

        this.nextSlot = this.add
            .circle(this.previewX, this.previewY, this.previewRadius + 14, 0x000000, 0.25)
            .setStrokeStyle(3, hexTo0x(Colors.ui.textPrimary), 0.5);
        this.nextSlot.setDepth(4);

        this.queuedColor = randomBubbleHex();
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
        const r = this.previewRadius + 22;
        this.swapGfx.setPosition(this.previewX, this.previewY);

        this.swapGfx.lineStyle(4, hexTo0x(Colors.ui.textPrimary), 0.8);
        this.swapGfx.beginPath();
        this.swapGfx.arc(0, 0, r, Phaser.Math.DegToRad(25), Phaser.Math.DegToRad(175), false);
        this.swapGfx.strokePath();

        this.swapGfx.beginPath();
        this.swapGfx.arc(0, 0, r, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(355), false);
        this.swapGfx.strokePath();

        this.swapGfx.fillStyle(hexTo0x(Colors.ui.textPrimary), 0.95);
        this.drawArrowHead(this.swapGfx, 0, 0, r, 25, true);
        this.drawArrowHead(this.swapGfx, 0, 0, r, 205, true);

        this.swapGfx.setDepth(4);
        this.tweens.add({
            targets: this.swapGfx,
            rotation: Phaser.Math.DegToRad(360),
            duration: 2200,
            repeat: -1,
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
        const size = 8;

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
        // Simple start: first 6 rows filled with random colors (3–4 colors)
        const rows = Math.min(LEVELS.difficulty.baseRows, this.maxRows);
        const activeColors = Math.min(LEVELS.difficulty.baseColors + 1, 4);

        const palette = Colors.bubblePalette.slice(0, activeColors);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                // Slightly reduce fill on deeper rows for a nicer start
                if (r >= 4 && Math.random() < 0.15) continue;

                const colorHex = palette[Math.floor(Math.random() * palette.length)];
                this.placeBubble(r, c, colorHex);
            }
        }
    }

    private setupInput() {
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.projectile?.active) return; // already shooting
            if (this.shotsLeft <= 0) return;

            // Prevent shooting if click is below shooter (optional)
            // if (pointer.y > this.shooterY + 120) return;

            this.fire(pointer.worldX, pointer.worldY);
        });
    }

    // -------------------------
    // HUD (minimal)
    // -------------------------

    private drawHUD() {
        this.hud = new HUD(this, {
            level: this.level,
            coins: 0,
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

        const left = BUBBLES.radius + 8;
        const right = GAME.width - BUBBLES.radius - 8;
        const top = this.gridTopY + BUBBLES.radius;
        const step = 14;
        const maxSteps = 90;

        let x = fromX;
        let y = fromY;
        let vx = dir.x;
        let vy = dir.y;
        let hit: { x: number; y: number } | null = null;

        this.aimLine.clear();
        this.aimLine.fillStyle(hexTo0x(this.nextColor), 0.65);

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
        };
        this.projectile.go.setDepth(7);
        this.nextBubble = undefined;

        // Consume shot
        this.shotsLeft -= 1;
        this.hud?.setShots(this.shotsLeft);

        // Prepare next
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
        this.queuedColor = randomBubbleHex();

        if (this.queuedBubble) {
            this.queuedBubble.destroy();
        }

        this.queuedBubble = this.makeBubbleVisual(this.previewX, this.previewY, this.queuedColor, this.previewRadius);
        this.queuedBubble.setDepth(5);
        this.bindSwapHandler(this.queuedBubble);
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

    private snapProjectileToGrid(worldX: number, worldY: number, colorHex: HexColor) {
        const best = this.findNearestEmptyCell(worldX, worldY);
        if (!best) return;

        const { r, c } = best;
        const placed = this.placeBubble(r, c, colorHex);

        // Match & remove
        const match = this.findMatchGroup(placed);
        if (match.length >= BUBBLES.minMatchCount) {
            for (const b of match) {
                this.occupied.delete(this.key(b.cellR, b.cellC));
                this.tweens.add({
                    targets: b,
                    scale: 0,
                    alpha: 0,
                    duration: 140,
                    onComplete: () => b.destroy(),
                });
            }
            // TODO: add coins using ECONOMY + GameState
        }

        // Win condition (minimal): if no bubbles remain, next level
        if (this.occupied.size === 0) {
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
        const margin = 18;
        const rowOffset = (r % 2) * (BUBBLES.radius);
        const x = margin + rowOffset + c * this.hSpacing + BUBBLES.radius;
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

    // -------------------------
    // Lose / Next level
    // -------------------------

    private showLosePopup() {
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
        // Rebuild HUD by restarting scene for simplicity
        this.scene.restart();
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

        const shadow = this.add.circle(2, 4, radius, 0x000000, 0.18);
        const base = this.add.circle(0, 0, radius, hexTo0x(colorHex));
        base.setStrokeStyle(3, hexTo0x(Colors.ui.textPrimary), 0.35);

        const shade = this.add.circle(radius * 0.25, radius * 0.3, radius * 0.75, 0x000000, 0.12);
        const gloss = this.add.circle(-radius * 0.35, -radius * 0.35, radius * 0.35, 0xffffff, 0.55);
        const sparkle = this.add.circle(-radius * 0.12, -radius * 0.55, Math.max(2, radius * 0.12), 0xffffff, 0.6);
        shade.setBlendMode(Phaser.BlendModes.MULTIPLY);
        gloss.setBlendMode(Phaser.BlendModes.SCREEN);
        sparkle.setBlendMode(Phaser.BlendModes.SCREEN);

        bubble.add([shadow, base, shade, gloss, sparkle]);
        bubble.setSize(radius * 2, radius * 2);

        bubble.base = base;
        bubble.gloss = gloss;
        bubble.shade = shade;
        bubble.bubbleRadius = radius;
        bubble.colorHex = colorHex;

        return bubble;
    }

    private setBubbleColor(bubble: BubbleVisual, colorHex: HexColor) {
        bubble.base.setFillStyle(hexTo0x(colorHex));
        bubble.colorHex = colorHex;
    }
}
