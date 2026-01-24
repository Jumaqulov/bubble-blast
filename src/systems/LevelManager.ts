import { Colors, HexColor } from "../config/colors";
import { LEVELS } from "../config/constants";
import { LevelGenerator } from "./LevelGenerator";
import level1 from "../data/levels/level_1.json";
import level2 from "../data/levels/level_2.json";

export type LevelParams = {
    level: number;
    rows: number;
    cols: number;
    activeColors: HexColor[];
    colors: string[];  // Raw color strings from JSON
    shots: number;
    waves?: number;  // Number of waves for continuous spawning
    gridData?: string[]; // Grid pattern from JSON
    colorMap?: Record<string, string>; // Char to Hex map
};

export type InitialBubble = {
    r: number;
    c: number;
    colorHex: HexColor;
};

export class LevelManager {
    static getParams(level: number, cols: number): LevelParams {
        // Handle JSON module interop (some bundlers put content in .default)
        const l1 = (level1 as any).default || level1;
        const l2 = (level2 as any).default || level2;

        // Load specific level based on number
        if (level === 1) {
            console.log("LevelManager: Loading Level 1 JSON data", l1);
            return {
                level: 1,
                rows: l1.rows,
                cols: l1.cols,
                activeColors: l1.colors as HexColor[],
                colors: l1.colors,
                shots: l1.shots,
                waves: l1.waves ?? 5,
                gridData: l1.grid,
                colorMap: l1.map,
            };
        }

        if (level === 2) {
            console.log("LevelManager: Loading Level 2 JSON data", l2);
            return {
                level: 2,
                rows: l2.rows,
                cols: l2.cols,
                activeColors: l2.colors as HexColor[],
                colors: l2.colors,
                shots: l2.shots,
                waves: l2.waves ?? 6,
                gridData: l2.grid,
                colorMap: l2.map,
            };
        }

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
        const bubbles: InitialBubble[] = [];

        // If we have specific grid data from JSON
        console.log("LevelManager: Generating grid. Params:", { level: params.level, hasGrid: !!params.gridData, hasMap: !!params.colorMap });

        if (params.gridData && params.colorMap) {
            console.log("LevelManager: Using JSON grid data");
            const grid = params.gridData;
            const map = params.colorMap;

            for (let r = 0; r < grid.length; r++) {
                const rowStr = grid[r];
                if (!rowStr) continue;
                for (let c = 0; c < rowStr.length; c++) {
                    const char = rowStr[c];
                    if (!char || char === '.' || char === ' ') continue;

                    const color = map[char];
                    if (color) {
                        bubbles.push({ r, c, colorHex: color as HexColor });
                    }
                }
            }
            return bubbles;
        }

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
