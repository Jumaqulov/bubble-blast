// src/scenes/GameScene.ts
// Minimal playable bubble-shooter loop:
// - Prebuilds a hex/offset grid with random bubbles on top rows
// - Aim with pointer, tap/click to shoot
// - Wall bounce, snap to nearest empty cell
// - Match-3 removal (same color), basic coin reward hook (TODO: connect to GameState later)
// NOTE: Later we will move logic into systems/ (BubbleManager, ShootingSystem, LevelManager, GridSystem, MatchSystem).

import Phaser from "phaser";
import { Colors, HexColor, hexTo0x, randomBubbleHex } from "../config/colors";
import { BUBBLES, GAME, LEVELS } from "../config/constants";

type CellKey = string;

type BubbleGO = Phaser.GameObjects.Arc & {
    cellR: number;
    cellC: number;
    colorHex: HexColor;
};

type Projectile = {
    go: Phaser.GameObjects.Arc;
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
    private shooterX = 0;
    private shooterY = 0;

    private nextBubble?: Phaser.GameObjects.Arc;
    private nextColor: HexColor = Colors.bubbles.blue;

    private projectile: Projectile | null = null;

    private shotsLeft = 0;
    private level = 1;

    constructor() {
        super({ key: "GameScene" });
    }

    create() {
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));

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
            this.updateAimLine();
            return;
        }

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

        // Shooter base
        this.add
            .circle(this.shooterX, this.shooterY + 36, 54, hexTo0x(Colors.ui.panel))
            .setStrokeStyle(4, hexTo0x(Colors.ui.textSecondary));

        // Aim line
        this.aimLine = this.add.graphics();

        // Next bubble (loaded)
        this.nextColor = randomBubbleHex();
        this.nextBubble = this.makeBubbleVisual(this.shooterX, this.shooterY, this.nextColor, BUBBLES.radius);
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
        const barH = 96;
        this.add.rectangle(GAME.width / 2, barH / 2, GAME.width, barH, hexTo0x(Colors.ui.panel)).setAlpha(0.85);

        this.add
            .text(24, 28, `Level: ${this.level}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0, 0);

        this.add
            .text(GAME.width - 24, 28, `Shots: ${this.shotsLeft}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(1, 0);
    }

    // -------------------------
    // Shooting
    // -------------------------

    private updateAimLine() {
        if (!this.aimLine) return;

        const p = this.input.activePointer;
        const fromX = this.shooterX;
        const fromY = this.shooterY;

        // Compute angle based on pointer
        const dx = p.worldX - fromX;
        const dy = p.worldY - fromY;
        let angle = Math.atan2(dy, dx); // radians

        // Clamp so player can't shoot downward too much
        const min = Phaser.Math.DegToRad(Phaser.Math.Clamp(10, 0, 180));
        const max = Phaser.Math.DegToRad(Phaser.Math.Clamp(170, 0, 180));

        // Normalize into [0..PI]
        if (angle < 0) angle += Math.PI * 2;
        // Convert to “upward” hemisphere: accept angles between ~10° and ~170° in standard unit circle,
        // but our shooter wants upward (toward y decreasing). So we clamp around PI..0 range.
        // Simpler: compute direction vector and clamp by y sign:
        const dir = new Phaser.Math.Vector2(dx, dy).normalize();
        if (dir.y > -0.15) dir.y = -0.15; // force upward-ish
        dir.normalize();

        // Draw line
        const len = 520;
        const toX = fromX + dir.x * len;
        const toY = fromY + dir.y * len;

        this.aimLine.clear();
        this.aimLine.lineStyle(6, hexTo0x(Colors.ui.textSecondary), 0.5);
        this.aimLine.beginPath();
        this.aimLine.moveTo(fromX, fromY);
        this.aimLine.lineTo(toX, toY);
        this.aimLine.strokePath();
    }

    private fire(targetX: number, targetY: number) {
        if (!this.nextBubble) return;

        // Direction from shooter to target
        const dir = new Phaser.Math.Vector2(targetX - this.shooterX, targetY - this.shooterY).normalize();
        if (dir.y > -0.15) dir.y = -0.15; // ensure upward
        dir.normalize();

        // Create projectile bubble
        const colorHex = this.nextColor;
        this.projectile = {
            go: this.makeBubbleVisual(this.shooterX, this.shooterY, colorHex, BUBBLES.radius),
            colorHex,
            vx: dir.x * BUBBLES.launchSpeedPxPerSec,
            vy: dir.y * BUBBLES.launchSpeedPxPerSec,
            active: true,
        };

        // Consume shot
        this.shotsLeft -= 1;

        // Prepare next
        this.nextBubble.destroy();
        this.nextColor = randomBubbleHex();
        this.nextBubble = this.makeBubbleVisual(this.shooterX, this.shooterY, this.nextColor, BUBBLES.radius);

        // Quick feedback
        this.tweens.add({
            targets: this.projectile.go,
            scale: { from: 0.9, to: 1 },
            duration: 80,
        });

        // If no shots left after firing and nothing matches, we will show lose when projectile resolves
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

        const bubble = this.add.circle(x, y, BUBBLES.radius, hexTo0x(colorHex)) as BubbleGO;
        bubble.setStrokeStyle(4, hexTo0x(Colors.ui.textSecondary), 0.35);

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

    private makeBubbleVisual(x: number, y: number, colorHex: HexColor, radius: number): Phaser.GameObjects.Arc {
        const bubble = this.add.circle(x, y, radius, hexTo0x(colorHex));
        bubble.setStrokeStyle(4, hexTo0x(Colors.ui.textSecondary), 0.35);
        return bubble;
    }
}
