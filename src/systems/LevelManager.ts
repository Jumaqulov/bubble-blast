// src/systems/LevelManager.ts
// Provides level parameters and initial grid generation for bubble shooter.
// For MVP we generate levels procedurally using constants.
// Later you can switch to JSON levels in src/data/levels/*.json.

import { Colors, HexColor } from "../config/colors";
import { LEVELS } from "../config/constants";

export type LevelParams = {
    level: number;

    rows: number;
    cols: number;

    activeColors: HexColor[];
    shots: number;
};

export type InitialBubble = {
    r: number;
    c: number;
    colorHex: HexColor;
};

export class LevelManager {
    static getParams(level: number, cols: number): LevelParams {
        const L = Math.max(1, Math.floor(level));

        // Rows difficulty curve
        const rowsInc = Math.floor((L - 1) / LEVELS.difficulty.rowsEveryLevels);
        const rows = clamp(
            LEVELS.difficulty.baseRows + rowsInc,
            LEVELS.difficulty.baseRows,
            LEVELS.difficulty.maxRows
        );

        // Colors difficulty curve
        const colorInc = Math.floor((L - 1) / LEVELS.difficulty.colorsEveryLevels);
        const numColors = clamp(
            LEVELS.difficulty.baseColors + colorInc,
            LEVELS.difficulty.baseColors,
            LEVELS.difficulty.maxColors
        );

        // Shots curve
        const dec = Math.floor((L - 1) / LEVELS.difficulty.shotsDecreaseEveryLevels);
        const shots = Math.max(LEVELS.difficulty.minShots, LEVELS.difficulty.baseShots - dec * 2);

        const activeColors = Colors.bubblePalette.slice(0, numColors);

        return {
            level: L,
            rows,
            cols,
            activeColors: [...activeColors],
            shots,
        };
    }

    static generateInitialGrid(params: LevelParams): InitialBubble[] {
        const bubbles: InitialBubble[] = [];

        for (let r = 0; r < params.rows; r++) {
            for (let c = 0; c < params.cols; c++) {
                // Light randomness: keep top denser than bottom
                const skipChance =
                    r <= 2 ? 0 :
                        r <= 4 ? 0.08 :
                            0.16;

                if (Math.random() < skipChance) continue;

                const colorHex = randomFrom(params.activeColors);
                bubbles.push({ r, c, colorHex });
            }
        }

        return bubbles;
    }

    static pickNextBubbleColor(params: LevelParams): HexColor {
        return randomFrom(params.activeColors);
    }
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function randomFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
