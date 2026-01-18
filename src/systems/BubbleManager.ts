// src/systems/BubbleManager.ts
// Manages bubble game objects on a hex/offset grid.
// Responsibilities:
// - place/remove bubbles
// - keep occupied map
// - convert cell <-> world coordinates
// - iterate/collide helpers

import Phaser from "phaser";
import { Colors, HexColor, hexTo0x } from "../config/colors";
import { BUBBLES, GAME } from "../config/constants";

export type CellKey = string;

export type BubbleGO = Phaser.GameObjects.Arc & {
    cellR: number;
    cellC: number;
    colorHex: HexColor;
};

export class BubbleManager {
    private scene: Phaser.Scene;
    private gridTopY: number;
    private cols: number;
    private maxRows: number;

    private hSpacing = BUBBLES.diameter;
    private vSpacing = Math.round(BUBBLES.radius * Math.sqrt(3));

    private occupied = new Map<CellKey, BubbleGO>();

    constructor(
        scene: Phaser.Scene,
        opts: { gridTopY: number; cols: number; maxRows: number }
    ) {
        this.scene = scene;
        this.gridTopY = opts.gridTopY;
        this.cols = opts.cols;
        this.maxRows = opts.maxRows;
    }

    // -----------------------------
    // Public API
    // -----------------------------

    place(r: number, c: number, colorHex: HexColor): BubbleGO {
        const { x, y } = this.cellToWorld(r, c);

        const bubble = this.scene.add.circle(
            x,
            y,
            BUBBLES.radius,
            hexTo0x(colorHex)
        ) as BubbleGO;

        bubble.setStrokeStyle(4, hexTo0x(Colors.ui.textSecondary), 0.35);
        bubble.cellR = r;
        bubble.cellC = c;
        bubble.colorHex = colorHex;

        this.occupied.set(this.key(r, c), bubble);
        return bubble;
    }

    remove(r: number, c: number): void {
        const k = this.key(r, c);
        const b = this.occupied.get(k);
        if (!b) return;

        this.occupied.delete(k);
        b.destroy();
    }

    removeMany(bubbles: BubbleGO[], animate = true): void {
        for (const b of bubbles) {
            this.occupied.delete(this.key(b.cellR, b.cellC));
            if (animate) {
                this.scene.tweens.add({
                    targets: b,
                    scale: 0,
                    alpha: 0,
                    duration: 140,
                    onComplete: () => b.destroy(),
                });
            } else {
                b.destroy();
            }
        }
    }

    clear(): void {
        for (const b of this.occupied.values()) b.destroy();
        this.occupied.clear();
    }

    has(r: number, c: number): boolean {
        return this.occupied.has(this.key(r, c));
    }

    get(r: number, c: number): BubbleGO | undefined {
        return this.occupied.get(this.key(r, c));
    }

    values(): IterableIterator<BubbleGO> {
        return this.occupied.values();
    }

    size(): number {
        return this.occupied.size;
    }

    // -----------------------------
    // Placement helpers
    // -----------------------------

    findNearestEmptyCell(worldX: number, worldY: number): { r: number; c: number } | null {
        let best: { r: number; c: number; d2: number } | null = null;

        const rowsToCheck = this.maxRows + 8;
        for (let r = 0; r < rowsToCheck; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.has(r, c)) continue;

                const { x, y } = this.cellToWorld(r, c);
                const dx = x - worldX;
                const dy = y - worldY;
                const d2 = dx * dx + dy * dy;

                if (!best || d2 < best.d2) best = { r, c, d2 };
            }
        }
        return best ? { r: best.r, c: best.c } : null;
    }

    findCollision(x: number, y: number): BubbleGO | null {
        const rr = BUBBLES.diameter - 2;
        const rr2 = rr * rr;

        for (const b of this.occupied.values()) {
            const dx = b.x - x;
            const dy = b.y - y;
            if (dx * dx + dy * dy <= rr2) return b;
        }
        return null;
    }

    // -----------------------------
    // Coordinates
    // -----------------------------

    cellToWorld(r: number, c: number): { x: number; y: number } {
        const margin = 18;
        const rowOffset = (r % 2) * BUBBLES.radius;
        const x = margin + rowOffset + c * this.hSpacing + BUBBLES.radius;
        const y = this.gridTopY + r * this.vSpacing + BUBBLES.radius;
        return { x, y };
    }

    // -----------------------------
    // Utils
    // -----------------------------

    private key(r: number, c: number): CellKey {
        return `${r},${c}`;
    }
}
