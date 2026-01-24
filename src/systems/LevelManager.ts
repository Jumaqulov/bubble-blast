import { Colors, HexColor } from "../config/colors";
import { LEVELS } from "../config/constants";
import { LevelGenerator } from "./LevelGenerator";
import { InitialBubble, LevelParams } from "../types/LevelTypes";

export class LevelManager {
    static getParams(level: number, cols: number): LevelParams {
        const L = Math.max(1, Math.floor(level));

        // Rows difficulty curve (procedural fallback)
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
            colors: activeColors as string[],
            shots,
            waves: L + 3,  // More waves for higher levels
        };
    }

    static generateInitialGrid(params: LevelParams): InitialBubble[] {
        // Procedural generation (fallback)
        return LevelGenerator.generate(params.level, params.rows, params.cols, params.activeColors);
    }

    static pickNextBubbleColor(params: LevelParams): HexColor {
        return randomFrom(params.activeColors);
    }
}

function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function randomFrom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}