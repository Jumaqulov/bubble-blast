// src/config/colors.ts
export type HexColor = `#${string}`;

export const Colors = {
    // ---- UI (Global) ----
    ui: {
        // Maqsad (1-rasm) dagi fon rangi (Yumshoq binafsha-ko'k)
        background: "#8FA3D8" as HexColor,
        backgroundDeep: "#7B8FC0" as HexColor,

        // Panel va HUD (Yorqin ko'k)
        panel: "#4AA6EB" as HexColor,
        playfield: "#8FA3D8" as HexColor,  // Fon bilan bir xil yoki shaffof
        playfieldBorder: "#6A80B8" as HexColor,

        // Text
        textPrimary: "#FFFFFF" as HexColor,
        textSecondary: "#E1F2FF" as HexColor,

        // Buttons
        ctaPrimaryTop: "#FFB800" as HexColor,    // Sariq/Oltin tugmalar
        ctaPrimaryBottom: "#E09200" as HexColor,
        ctaSecondary: "#4CD964" as HexColor,

        // Status
        reward: "#FFD700" as HexColor,
        warning: "#FF3B30" as HexColor,
        disabled: "#BDC3C7" as HexColor,

        glowReward: "rgba(255, 215, 0, 0.6)",
        shadow: "rgba(0, 0, 0, 0.3)",
    },

    // ---- Gameplay (Bubbles) - 1-rasmdagi yorqin ranglar ----
    bubbles: {
        blue: "#0084FF" as HexColor,
        orange: "#FF9500" as HexColor, // Sariq o'rniga ko'proq apelsin
        red: "#FF3B30" as HexColor,
        green: "#4CD964" as HexColor,
        purple: "#AF52DE" as HexColor,
        cyan: "#5AC8FA" as HexColor,
    },

    // Palette
    bubblePalette: [
        "#0084FF", // Blue
        "#FF9500", // Orange
        "#FF3B30", // Red
        "#4CD964", // Green
        "#AF52DE", // Purple
    ] as const satisfies readonly HexColor[],

    overlay: {
        dim: "rgba(0,0,0,0.3)",
        light: "rgba(255,255,255,0.2)",
    },
} as const;

export function hexTo0x(hex: HexColor): number {
    const clean = hex.slice(1);
    const value = Number.parseInt(clean, 16);
    return Number.isNaN(value) ? 0 : value;
}

export function randomBubbleHex(): HexColor {
    const idx = Math.floor(Math.random() * Colors.bubblePalette.length);
    // TypeScriptga bu qiymat aniq mavjudligini aytish uchun "!" qo'yamiz
    return Colors.bubblePalette[idx]!;
}