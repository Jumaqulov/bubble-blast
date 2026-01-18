// src/services/StorageService.ts
// High-level storage for game state (coins, level, inventory, daily bonus).
// Wraps YandexSDK.storage so the rest of the game never touches SDK directly.

import { STORAGE_KEYS, DAILY_BONUS, ECONOMY } from "../config/constants";
import { YandexSDK } from "./YandexSDK";

export type Inventory = {
    boosters: {
        colorSwap: number;
        aimGuide: number;
        bomb: number;
    };
    skins: string[];
};

export type DailyBonusState = {
    lastClaimAt: number; // server time ms
    streak: number;     // 0..6 (for 7-day bonus)
};

export type PlayerState = {
    coins: number;
    level: number;
    inventory: Inventory;
    dailyBonus: DailyBonusState;
};

const DEFAULT_STATE: PlayerState = {
    coins: 0,
    level: 1,
    inventory: {
        boosters: {
            colorSwap: 0,
            aimGuide: 0,
            bomb: 0,
        },
        skins: [],
    },
    dailyBonus: {
        lastClaimAt: 0,
        streak: 0,
    },
};

export class StorageService {
    // -----------------------------
    // Core load/save
    // -----------------------------

    static async load(): Promise<PlayerState> {
        const saved = await YandexSDK.storage.get<PlayerState>(
            STORAGE_KEYS.player,
            DEFAULT_STATE
        );

        // Merge with defaults to avoid missing fields after updates
        return {
            ...DEFAULT_STATE,
            ...saved,
            inventory: {
                ...DEFAULT_STATE.inventory,
                ...saved.inventory,
                boosters: {
                    ...DEFAULT_STATE.inventory.boosters,
                    ...(saved.inventory?.boosters ?? {}),
                },
            },
            dailyBonus: {
                ...DEFAULT_STATE.dailyBonus,
                ...(saved.dailyBonus ?? {}),
            },
        };
    }

    static async save(state: PlayerState): Promise<void> {
        // Clamp coins to safe limits
        const safeCoins = Math.max(0, Math.min(state.coins, ECONOMY.maxCoins));

        const next: PlayerState = {
            ...state,
            coins: safeCoins,
        };

        await YandexSDK.storage.set<PlayerState>(STORAGE_KEYS.player, next);
    }

    // -----------------------------
    // Coins
    // -----------------------------

    static async addCoins(amount: number): Promise<PlayerState> {
        const state = await this.load();
        state.coins = Math.min(
            ECONOMY.maxCoins,
            Math.max(0, state.coins + Math.floor(amount))
        );
        await this.save(state);
        return state;
    }

    static async spendCoins(amount: number): Promise<PlayerState | null> {
        const state = await this.load();
        if (state.coins < amount) return null;

        state.coins -= Math.floor(amount);
        await this.save(state);
        return state;
    }

    // -----------------------------
    // Level progression
    // -----------------------------

    static async setLevel(level: number): Promise<PlayerState> {
        const state = await this.load();
        state.level = Math.max(1, Math.floor(level));
        await this.save(state);
        return state;
    }

    static async nextLevel(): Promise<PlayerState> {
        const state = await this.load();
        state.level += 1;
        await this.save(state);
        return state;
    }

    // -----------------------------
    // Inventory / Boosters
    // -----------------------------

    static async addBooster(
        boosterId: keyof Inventory["boosters"],
        count = 1
    ): Promise<PlayerState> {
        const state = await this.load();
        state.inventory.boosters[boosterId] += Math.max(0, Math.floor(count));
        await this.save(state);
        return state;
    }

    static async useBooster(
        boosterId: keyof Inventory["boosters"]
    ): Promise<PlayerState | null> {
        const state = await this.load();
        if (state.inventory.boosters[boosterId] <= 0) return null;

        state.inventory.boosters[boosterId] -= 1;
        await this.save(state);
        return state;
    }

    // -----------------------------
    // Daily bonus
    // -----------------------------

    static canClaimDailyBonus(state: PlayerState, nowMs: number): boolean {
        if (!DAILY_BONUS.enabled) return false;
        if (!state.dailyBonus.lastClaimAt) return true;

        return (
            nowMs - state.dailyBonus.lastClaimAt >=
            DAILY_BONUS.claimCooldownSeconds * 1000
        );
    }

    static async claimDailyBonus(nowMs: number): Promise<PlayerState | null> {
        const state = await this.load();

        if (!this.canClaimDailyBonus(state, nowMs)) return null;

        // Update streak
        if (state.dailyBonus.lastClaimAt === 0) {
            state.dailyBonus.streak = 0;
        } else {
            const missed =
                nowMs - state.dailyBonus.lastClaimAt >
                DAILY_BONUS.claimCooldownSeconds * 2 * 1000;

            if (missed) {
                if (DAILY_BONUS.missedPolicy === "reset") {
                    state.dailyBonus.streak = 0;
                } else {
                    state.dailyBonus.streak = Math.max(0, state.dailyBonus.streak - 1);
                }
            } else {
                state.dailyBonus.streak = Math.min(
                    DAILY_BONUS.days - 1,
                    state.dailyBonus.streak + 1
                );
            }
        }

        // Grant coins
        const reward =
            DAILY_BONUS.coinRewards[state.dailyBonus.streak] ??
            DAILY_BONUS.coinRewards[0];

        state.coins = Math.min(ECONOMY.maxCoins, state.coins + reward);
        state.dailyBonus.lastClaimAt = nowMs;

        // Optional day-7 booster
        if (
            DAILY_BONUS.day7BoosterReward.enabled &&
            state.dailyBonus.streak === DAILY_BONUS.days - 1
        ) {
            state.inventory.boosters[
                DAILY_BONUS.day7BoosterReward.boosterId
            ] += 1;
        }

        await this.save(state);
        return state;
    }
}
