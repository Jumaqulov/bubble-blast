// src/services/SecurityManager.ts
// Lightweight client-side anti-cheat & sanity checks.
// NOTE: Client-only anti-cheat is never perfect. Real protection requires backend validation.
// This module helps:
// - detect suspicious time jumps (daily bonus abuse)
// - clamp / validate coins & level changes
// - provide a single place to add more rules later

import { DAILY_BONUS, ECONOMY } from "../config/constants";
import { YandexSDK } from "./YandexSDK";
import { PlayerState } from "./StorageService";

export type SecurityFlags = {
    timeJumpDetected: boolean;
    suspiciousCoinDelta: boolean;
};

export class SecurityManager {
    private static lastSeenTimeMs = 0;

    // Call this on app start and periodically (e.g., on scene enter)
    static syncTimeNowMs(): number {
        const now = YandexSDK.serverTimeMs();

        if (this.lastSeenTimeMs === 0) {
            this.lastSeenTimeMs = now;
            return now;
        }

        // Detect big backward jump (player changed device clock)
        const delta = now - this.lastSeenTimeMs;

        // Allow small jitter; flag if time goes backwards > 2 minutes
        if (delta < -2 * 60 * 1000) {
            // Keep lastSeenTimeMs unchanged to avoid locking user forever
            return now;
        }

        this.lastSeenTimeMs = now;
        return now;
    }

    // Returns flags useful for logging or gating rewards
    static checkTimeJump(nowMs: number): SecurityFlags {
        const flags: SecurityFlags = {
            timeJumpDetected: false,
            suspiciousCoinDelta: false,
        };

        if (this.lastSeenTimeMs !== 0) {
            const delta = nowMs - this.lastSeenTimeMs;
            // backward > 2min or forward > 7 days is suspicious
            if (delta < -2 * 60 * 1000 || delta > 7 * 24 * 60 * 60 * 1000) {
                flags.timeJumpDetected = true;
            }
        }

        // Update last seen
        this.lastSeenTimeMs = nowMs;
        return flags;
    }

    // Clamp and normalize a state object before saving
    static sanitizeState(state: PlayerState): PlayerState {
        const safeCoins = this.clampInt(state.coins, 0, ECONOMY.maxCoins);
        const safeLevel = this.clampInt(state.level, 1, Number.MAX_SAFE_INTEGER);

        const safeBoosters = {
            colorSwap: this.clampInt(state.inventory.boosters.colorSwap, 0, 9999),
            aimGuide: this.clampInt(state.inventory.boosters.aimGuide, 0, 9999),
            bomb: this.clampInt(state.inventory.boosters.bomb, 0, 9999),
        };

        const safeDaily = {
            lastClaimAt: this.clampInt(state.dailyBonus.lastClaimAt, 0, Number.MAX_SAFE_INTEGER),
            streak: this.clampInt(state.dailyBonus.streak, 0, DAILY_BONUS.days - 1),
        };

        return {
            ...state,
            coins: safeCoins,
            level: safeLevel,
            inventory: {
                ...state.inventory,
                boosters: safeBoosters,
                skins: Array.isArray(state.inventory.skins) ? state.inventory.skins.slice(0, 200) : [],
            },
            dailyBonus: safeDaily,
        };
    }

    // Check if coin change is suspicious (very large jump)
    // Use this before applying a delta or after loading state.
    static isSuspiciousCoinDelta(delta: number): boolean {
        // Heuristic: > 5000 coins in one action is unusual for this game economy
        return Math.abs(delta) > 5000;
    }

    // Decide whether daily bonus claim should be allowed even if time jump detected
    static allowDailyBonusClaim(flags: SecurityFlags): boolean {
        // If time jump detected, block claim to discourage clock manipulation
        return !flags.timeJumpDetected;
    }

    private static clampInt(value: number, min: number, max: number): number {
        const v = Number.isFinite(value) ? Math.floor(value) : min;
        return Math.max(min, Math.min(max, v));
    }
}
