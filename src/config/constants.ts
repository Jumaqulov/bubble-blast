// src/config/constants.ts
// Global game constants: gameplay tuning, economy, ads cadence, daily bonus rules.
// Keep values here so balancing is easy without touching systems/scenes.

export const GAME = {
    name: "Bubble Blast",
    version: "0.1.0",
    // Design resolution (Phaser Scale will adapt)
    width: 720,
    height: 1280,
    // Target FPS
    fps: 60,
} as const;

export const INPUT = {
    // Aim sensitivity / limits
    aim: {
        minAngleDeg: 10,  // prevent shooting almost horizontal
        maxAngleDeg: 170, // prevent shooting almost horizontal
    },
} as const;

export const BUBBLES = {
    // Visual / grid tuning
    radius: 24,               // bubble radius in px (design resolution)
    diameter: 48,
    snapThresholdPx: 18,      // how close to a snap point to lock in
    launchSpeedPxPerSec: 1100, // projectile speed

    // Match rules
    minMatchCount: 3,

    // Palette control (keep <= 6 in most levels)
    maxActiveColors: 6,

    // After N shots, optionally add a new row (difficulty driver)
    addRowEveryShots: 6,

    // Falling bubbles reward
    fallRewardPerBubble: 1, // coins per fallen bubble
} as const;

export const LEVELS = {
    // Progression
    startLevel: 1,
    maxLevelPreview: 200, // for UI preview; content can exceed later

    // Difficulty curve knobs (used by LevelManager when generating/reading JSON)
    difficulty: {
        // Starting number of rows at level 1
        baseRows: 6,
        // Additional rows gained by progression
        rowsEveryLevels: 5,    // +1 row every N levels
        maxRows: 12,

        // Active colors progression
        baseColors: 3,
        colorsEveryLevels: 8,  // +1 color every N levels
        maxColors: 6,

        // Shots/moves per level (lower = harder)
        baseShots: 35,
        minShots: 18,
        // shots decrease every N levels (difficulty increase)
        shotsDecreaseEveryLevels: 6,
    },
} as const;

export const ECONOMY = {
    // Coins earned per level
    winReward: {
        base: 20,      // level 1 reward
        perLevel: 2,   // incremental increase per level
        max: 120,      // cap so economy doesn't explode
    },

    // Loss/attempt reward (optional: keeps players feeling progress)
    loseReward: {
        enabled: true,
        coins: 3,
    },

    // Shop pricing (soft currency)
    shop: {
        boosters: {
            colorSwap: 60,
            aimGuide: 80,
            bomb: 120,
        },
        continue: {
            // Spend coins to continue without ads (optional alternative)
            extraShots: 150, // grants +5 shots
        },
        cosmetics: {
            // Cosmetics can be coin-based or premium later
            skinBasic: 300,
            backgroundBasic: 450,
        },
    },

    // Currency limits / formatting
    maxCoins: 9_999_999,
} as const;

export const ADS = {
    // Cadence rules
    interstitial: {
        // show every N completed levels (common pattern: 3–5)
        everyCompletedLevels: 4,
        // also allow time-based gating to avoid spam
        minSecondsBetween: 90,
    },

    rewarded: {
        // common rewarded placements
        continue: {
            // grant +5 shots after watching ad
            extraShots: 5,
        },
        doubleWinReward: {
            enabled: true,
            multiplier: 2,
        },
        freeBooster: {
            enabled: true,
            // one of boosters from shop, granted by ad
            cooldownSeconds: 180, // 3 minutes
        },
    },
} as const;

export const DAILY_BONUS = {
    enabled: true,
    // 7-day streak
    days: 7,

    // If player misses a day: "reset" or "decrement"
    // - reset: streak -> 0
    // - decrement: streak -> max(streak-1, 0)
    missedPolicy: "reset" as "reset" | "decrement",

    // Rewards per day (coins)
    coinRewards: [50, 70, 90, 120, 160, 220, 350] as const,

    // Optional bonus on day 7: also grant a booster
    day7BoosterReward: {
        enabled: true,
        boosterId: "bomb" as "colorSwap" | "aimGuide" | "bomb",
    },

    // Cooldown to claim again (seconds). Use server time if available.
    claimCooldownSeconds: 24 * 60 * 60,
} as const;

export const STORAGE_KEYS = {
    // All saved data should live under a single root object, but keys are useful
    player: "bb_player_v1",
    settings: "bb_settings_v1",
} as const;

export const AUDIO = {
    enabledByDefault: true,
    musicVolume: 0.6,
    sfxVolume: 0.8,
} as const;

export const DEBUG = {
    enabled: false,
    logSdk: false,
    drawGridDebug: false,
} as const;
