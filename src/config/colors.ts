// src/config/colors.ts
// Centralized color tokens for UI + gameplay (bubble colors).
// Keep ALL colors here so scenes/systems/ui can reference a single source of truth.

export type HexColor = `#${string}`;

export const Colors = {
    // ---- UI (Global) ----
    ui: {
        // Backgrounds
        background: "#0F2636" as HexColor, // Rebrand: Deep Teal Navy
        backgroundDeep: "#08161F" as HexColor, // Background gradient depth
        panel: "#24323C" as HexColor,      // HUD / Panel
        playfield: "#113144" as HexColor,  // Gameplay area background
        playfieldBorder: "#2C5E6B" as HexColor, // Gameplay area outline

        // Text
        textPrimary: "#F2F6F9" as HexColor,
        textSecondary: "#C5D2DB" as HexColor,

        // Buttons / Actions
        ctaPrimaryTop: "#3BC174" as HexColor,    // CTA gradient top
        ctaPrimaryBottom: "#2A9D62" as HexColor, // CTA gradient bottom
        ctaSecondary: "#2FBF7D" as HexColor,     // Confirm / OK

        // Status
        reward: "#F5C65A" as HexColor, // Coin / Bonus / Reward
        warning: "#EF4444" as HexColor, // Fail / Error
        disabled: "#9CA3AF" as HexColor, // Locked / Disabled

        // Effects
        glowReward: "rgba(250, 204, 21, 0.6)", // Reward glow (CSS/Canvas style string)
        shadow: "rgba(0, 0, 0, 0.25)",         // Common shadow
    },

    // ---- Gameplay (Bubbles) ----
    bubbles: {
        blue: "#3B82F6" as HexColor,
        green: "#22C55E" as HexColor,
        red: "#EF4444" as HexColor,
        yellow: "#F59E0B" as HexColor,
        purple: "#A855F7" as HexColor,
        cyan: "#06B6D4" as HexColor,
    },

    // ---- Helpers ----
    // Useful palettes for random selection / level generation.
    bubblePalette: [
        "#3B82F6",
        "#22C55E",
        "#EF4444",
        "#F59E0B",
        "#A855F7",
        "#06B6D4",
    ] as const satisfies readonly HexColor[],

    // Frequently used overlays (Phaser graphics fillStyle expects number; see helpers below).
    overlay: {
        dim: "rgba(0,0,0,0.45)",
        light: "rgba(255,255,255,0.12)",
    },
} as const;

// Convert "#RRGGBB" to 0xRRGGBB (Phaser Graphics/Text tint uses number)
export function hexTo0x(hex: HexColor): number {
    // Remove leading "#"
    const clean = hex.slice(1);

    // Basic validation: expect 6 hex chars
    if (clean.length !== 6) {
        throw new Error(`hexTo0x: Invalid hex color "${hex}". Expected #RRGGBB.`);
    }

    const value = Number.parseInt(clean, 16);
    if (Number.isNaN(value)) {
        throw new Error(`hexTo0x: Invalid hex color "${hex}".`);
    }

    return value;
}

// Pick a random bubble color from palette
export function randomBubbleHex(): HexColor {
    const idx = Math.floor(Math.random() * Colors.bubblePalette.length);
    return Colors.bubblePalette[idx];
}
