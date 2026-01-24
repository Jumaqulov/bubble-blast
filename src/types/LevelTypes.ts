import { HexColor } from "../config/colors";

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