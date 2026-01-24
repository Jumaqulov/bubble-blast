import { HexColor } from "../config/colors";
import { InitialBubble } from "./LevelManager";

export class LevelGenerator {
    /**
     * Deterministically generates a grid pattern based on the level number.
     */
    static generate(level: number, rows: number, cols: number, activeColors: HexColor[]): InitialBubble[] {
        // Simple deterministic pattern selection
        // We use level as a seed or selector
        const patternType = level % 5;

        switch (patternType) {
            case 0:
                return this.generateStripes(rows, cols, activeColors);
            case 1:
                return this.generateCheckers(rows, cols, activeColors);
            case 2:
                return this.generateColumns(rows, cols, activeColors);
            case 3:
                return this.generateBlobs(rows, cols, activeColors, level); // Pass level as seed
            case 4:
                return this.generateSpiral(rows, cols, activeColors);
            default:
                return this.generateStripes(rows, cols, activeColors);
        }
    }

    // Pattern: Horizontal Stripes
    private static generateStripes(rows: number, cols: number, colors: HexColor[]): InitialBubble[] {
        const bubbles: InitialBubble[] = [];
        for (let r = 0; r < rows; r++) {
            // Change color every 2 rows for thicker stripes, or 1 for thin
            const colorIdx = Math.floor(r / 2) % colors.length;
            const colorHex = colors[colorIdx];
            for (let c = 0; c < cols; c++) {
                bubbles.push({ r, c, colorHex });
            }
        }
        return bubbles;
    }

    // Pattern: Vertical Columns
    private static generateColumns(rows: number, cols: number, colors: HexColor[]): InitialBubble[] {
        const bubbles: InitialBubble[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const colorIdx = c % colors.length;
                const colorHex = colors[colorIdx];
                bubbles.push({ r, c, colorHex });
            }
        }
        return bubbles;
    }

    // Pattern: Checkers (Tiny)
    private static generateCheckers(rows: number, cols: number, colors: HexColor[]): InitialBubble[] {
        const bubbles: InitialBubble[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // (r + c) % len gives a diagonal-ish checker
                const colorIdx = (r + c) % colors.length;
                const colorHex = colors[colorIdx];
                bubbles.push({ r, c, colorHex });
            }
        }
        return bubbles;
    }

    // Pattern: Blobs / Clusters (Simulated with noise or random centers)
    private static generateBlobs(rows: number, cols: number, colors: HexColor[], seed: number): InitialBubble[] {
        const bubbles: InitialBubble[] = [];

        // Simple seeded random for consistency if replayed
        const seededRandom = (x: number) => {
            return Math.abs(Math.sin(x * 12.9898 + 78.233) * 43758.5453) % 1;
        };

        // Assign random "centers" for colors
        const centers: { r: number, c: number, color: HexColor }[] = [];
        const numCenters = Math.max(3, Math.floor(rows * cols / 15));

        for (let i = 0; i < numCenters; i++) {
            centers.push({
                r: Math.floor(seededRandom(seed + i) * rows),
                c: Math.floor(seededRandom(seed + i + 100) * cols),
                color: colors[i % colors.length]
            });
        }

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Find closest center
                let minDist = Infinity;
                let bestColor = colors[0];

                for (const center of centers) {
                    const dist = Math.sqrt((r - center.r) ** 2 + (c - center.c) ** 2);
                    if (dist < minDist) {
                        minDist = dist;
                        bestColor = center.color;
                    }
                }
                bubbles.push({ r, c, colorHex: bestColor });
            }
        }
        return bubbles;
    }

    // Pattern: Spiral / Concentric
    private static generateSpiral(rows: number, cols: number, colors: HexColor[]): InitialBubble[] {
        const bubbles: InitialBubble[] = [];
        const centerR = rows / 2;
        const centerC = cols / 2;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const dist = Math.sqrt((r - centerR) ** 2 + (c - centerC) ** 2);
                // Rings based on distance
                const ringIndex = Math.floor(dist / 2);
                const colorIdx = ringIndex % colors.length;
                const colorHex = colors[colorIdx];
                bubbles.push({ r, c, colorHex });
            }
        }
        return bubbles;
    }
}
