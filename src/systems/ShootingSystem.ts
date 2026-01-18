// src/systems/ShootingSystem.ts
// Handles aiming + firing + projectile motion + wall bounce.
// Integrates with BubbleManager for collision/snap conditions.
//
// This system is scene-agnostic: GameScene provides shooter position and callbacks.

import Phaser from "phaser";
import { Colors, HexColor, hexTo0x } from "../config/colors";
import { BUBBLES, GAME } from "../config/constants";
import { BubbleManager } from "./BubbleManager";

export type ShootResult =
    | { type: "snapped"; worldX: number; worldY: number; colorHex: HexColor }
    | { type: "none" };

export type ShootingSystemOptions = {
    scene: Phaser.Scene;
    bubbleManager: BubbleManager;

    shooterX: number;
    shooterY: number;

    // Called when projectile should be snapped to grid
    onSnap: (worldX: number, worldY: number, colorHex: HexColor) => void;
};

export class ShootingSystem {
    private scene: Phaser.Scene;
    private bubbles: BubbleManager;

    private shooterX: number;
    private shooterY: number;

    private aimGfx: Phaser.GameObjects.Graphics;

    private nextBubble: Phaser.GameObjects.Arc;
    private nextColor: HexColor;

    private projectile: {
        go: Phaser.GameObjects.Arc;
        colorHex: HexColor;
        vx: number;
        vy: number;
        active: boolean;
    } | null = null;

    private onSnap: (worldX: number, worldY: number, colorHex: HexColor) => void;

    constructor(opts: ShootingSystemOptions) {
        this.scene = opts.scene;
        this.bubbles = opts.bubbleManager;
        this.shooterX = opts.shooterX;
        this.shooterY = opts.shooterY;
        this.onSnap = opts.onSnap;

        this.aimGfx = this.scene.add.graphics();

        this.nextColor = Colors.bubblePalette[0];
        this.nextBubble = this.makeBubble(this.shooterX, this.shooterY, this.nextColor);
    }

    setShooterPosition(x: number, y: number) {
        this.shooterX = x;
        this.shooterY = y;
        if (this.nextBubble) {
            this.nextBubble.setPosition(x, y);
        }
    }

    setNextColor(color: HexColor) {
        this.nextColor = color;
        this.nextBubble.setFillStyle(hexTo0x(color));
    }

    getNextColor(): HexColor {
        return this.nextColor;
    }

    isBusy(): boolean {
        return !!this.projectile?.active;
    }

    destroy() {
        this.aimGfx.destroy();
        this.nextBubble.destroy();
        if (this.projectile?.go) this.projectile.go.destroy();
        this.projectile = null;
    }

    // Call every frame
    update(dtSeconds: number) {
        if (!this.projectile?.active) {
            this.drawAimLine();
            return;
        }

        const p = this.projectile;
        p.go.x += p.vx * dtSeconds;
        p.go.y += p.vy * dtSeconds;

        // Bounce off walls
        const left = BUBBLES.radius + 8;
        const right = GAME.width - BUBBLES.radius - 8;

        if (p.go.x <= left) {
            p.go.x = left;
            p.vx *= -1;
        } else if (p.go.x >= right) {
            p.go.x = right;
            p.vx *= -1;
        }

        // Hit top -> snap
        // NOTE: topY is handled by BubbleManager cellToWorld; but here we use bubble manager's first row y baseline
        // We can detect by comparing to the highest possible y in grid area.
        const topLimit = (this.bubbles as any).gridTopY ?? 140; // safe fallback if private
        if (p.go.y <= topLimit + BUBBLES.radius) {
            this.snapAndClear();
            return;
        }

        // Hit bubble -> snap
        const hit = this.bubbles.findCollision(p.go.x, p.go.y);
        if (hit) {
            this.snapAndClear();
            return;
        }
    }

    // Fire projectile toward pointer world position
    fireTo(worldX: number, worldY: number): boolean {
        if (this.projectile?.active) return false;

        const dir = new Phaser.Math.Vector2(worldX - this.shooterX, worldY - this.shooterY).normalize();
        // Force mostly upward
        if (dir.y > -0.15) dir.y = -0.15;
        dir.normalize();

        const colorHex = this.nextColor;

        this.projectile = {
            go: this.makeBubble(this.shooterX, this.shooterY, colorHex),
            colorHex,
            vx: dir.x * BUBBLES.launchSpeedPxPerSec,
            vy: dir.y * BUBBLES.launchSpeedPxPerSec,
            active: true,
        };

        // small pop
        this.scene.tweens.add({
            targets: this.projectile.go,
            scale: { from: 0.9, to: 1 },
            duration: 80,
            ease: "Quad.Out",
        });

        return true;
    }

    // After firing, GameScene should call this to prepare the next bubble
    reload(nextColor: HexColor) {
        this.nextColor = nextColor;
        this.nextBubble.setFillStyle(hexTo0x(nextColor));
    }

    // -----------------------------
    // Internals
    // -----------------------------

    private snapAndClear() {
        if (!this.projectile) return;

        const { x, y, colorHex } = this.projectile.go;
        const col = this.projectile.colorHex;

        // Destroy projectile
        this.projectile.go.destroy();
        this.projectile.active = false;
        this.projectile = null;

        this.onSnap(x, y, col);
    }

    private drawAimLine() {
        const p = this.scene.input.activePointer;

        const fromX = this.shooterX;
        const fromY = this.shooterY;

        const dx = p.worldX - fromX;
        const dy = p.worldY - fromY;

        const dir = new Phaser.Math.Vector2(dx, dy).normalize();
        if (dir.y > -0.15) dir.y = -0.15;
        dir.normalize();

        const len = 520;
        const toX = fromX + dir.x * len;
        const toY = fromY + dir.y * len;

        this.aimGfx.clear();
        this.aimGfx.lineStyle(6, hexTo0x(Colors.ui.textSecondary), 0.5);
        this.aimGfx.beginPath();
        this.aimGfx.moveTo(fromX, fromY);
        this.aimGfx.lineTo(toX, toY);
        this.aimGfx.strokePath();
    }

    private makeBubble(x: number, y: number, color: HexColor): Phaser.GameObjects.Arc {
        const b = this.scene.add.circle(x, y, BUBBLES.radius, hexTo0x(color));
        b.setStrokeStyle(4, hexTo0x(Colors.ui.textSecondary), 0.35);
        return b;
    }
}
