// src/state/GameState.ts
// Global in-memory state for the running session.
// - Loads once from StorageService (Yandex player data / localStorage fallback)
// - Provides getters and small helpers for scenes/systems
// - Persists changes through StorageService (so state survives refresh)

import { ECONOMY } from "../config/constants";
import { SecurityManager } from "../services/SecurityManager";
import { StorageService, PlayerState } from "../services/StorageService";
import { YandexSDK } from "../services/YandexSDK";

export type GameSettings = {
    soundEnabled: boolean;
    musicEnabled: boolean;
};

const DEFAULT_SETTINGS: GameSettings = {
    soundEnabled: true,
    musicEnabled: true,
};

export class GameState {
    private static player: PlayerState | null = null;
    private static settings: GameSettings = DEFAULT_SETTINGS;
    private static loaded = false;

    static get isLoaded(): boolean {
        return this.loaded;
    }

    static async init(): Promise<void> {
        if (this.loaded) return;

        // Ensure SDK init happens early (ok if stub)
        if (!YandexSDK.ready) {
            try {
                await YandexSDK.init();
            } catch {
                // ignore
            }
        }

        const raw = await StorageService.load();
        this.player = SecurityManager.sanitizeState(raw);
        this.loaded = true;
    }

    // -----------------------------
    // Player getters
    // -----------------------------

    static get coins(): number {
        return this.player?.coins ?? 0;
    }

    static get level(): number {
        return this.player?.level ?? 1;
    }

    static get boosters() {
        return this.player?.inventory.boosters ?? {
            colorSwap: 0,
            aimGuide: 0,
            bomb: 0,
        };
    }

    static get dailyBonus() {
        return this.player?.dailyBonus ?? { lastClaimAt: 0, streak: 0 };
    }

    // -----------------------------
    // Mutations (persisted)
    // -----------------------------

    static async addCoins(amount: number): Promise<void> {
        await this.ensureLoaded();

        const safe = Math.max(0, Math.floor(amount));
        const next = (this.player!.coins ?? 0) + safe;

        this.player!.coins = Math.max(0, Math.min(ECONOMY.maxCoins, next));
        this.player = SecurityManager.sanitizeState(this.player!);
        await StorageService.save(this.player!);
    }

    static async spendCoins(amount: number): Promise<boolean> {
        await this.ensureLoaded();

        const cost = Math.max(0, Math.floor(amount));
        if (this.player!.coins < cost) return false;

        this.player!.coins -= cost;
        this.player = SecurityManager.sanitizeState(this.player!);
        await StorageService.save(this.player!);
        return true;
    }

    static async setLevel(level: number): Promise<void> {
        await this.ensureLoaded();

        this.player!.level = Math.max(1, Math.floor(level));
        this.player = SecurityManager.sanitizeState(this.player!);
        await StorageService.save(this.player!);
    }

    static async advanceLevel(): Promise<void> {
        await this.ensureLoaded();

        this.player!.level += 1;
        this.player = SecurityManager.sanitizeState(this.player!);
        await StorageService.save(this.player!);
    }

    static async addBooster(
        boosterId: keyof PlayerState["inventory"]["boosters"],
        count = 1
    ): Promise<void> {
        await this.ensureLoaded();

        const n = Math.max(0, Math.floor(count));
        this.player!.inventory.boosters[boosterId] += n;

        this.player = SecurityManager.sanitizeState(this.player!);
        await StorageService.save(this.player!);
    }

    static async useBooster(
        boosterId: keyof PlayerState["inventory"]["boosters"]
    ): Promise<boolean> {
        await this.ensureLoaded();

        if (this.player!.inventory.boosters[boosterId] <= 0) return false;

        this.player!.inventory.boosters[boosterId] -= 1;
        this.player = SecurityManager.sanitizeState(this.player!);
        await StorageService.save(this.player!);
        return true;
    }

    static async claimDailyBonus(): Promise<boolean> {
        await this.ensureLoaded();

        const now = SecurityManager.syncTimeNowMs();
        const flags = SecurityManager.checkTimeJump(now);

        if (!SecurityManager.allowDailyBonusClaim(flags)) return false;

        const next = await StorageService.claimDailyBonus(now);
        if (!next) return false;

        this.player = SecurityManager.sanitizeState(next);
        return true;
    }

    // -----------------------------
    // Settings (kept simple for now)
    // -----------------------------

    static getSettings(): GameSettings {
        return { ...this.settings };
    }

    static setSettings(next: Partial<GameSettings>): void {
        this.settings = { ...this.settings, ...next };
    }

    // -----------------------------
    // Internal
    // -----------------------------

    private static async ensureLoaded(): Promise<void> {
        if (!this.loaded) await this.init();
        if (!this.player) {
            this.player = await StorageService.load();
            this.player = SecurityManager.sanitizeState(this.player);
        }
    }
}
