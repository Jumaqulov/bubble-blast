// src/services/YandexSDK.ts
// Safe wrapper around Yandex Games SDK.
// - Works in local dev even if SDK script isn't present (falls back to stubs)
// - Centralizes: init, ads, player/storage, payments, serverTime
//
// Usage:
//   await YandexSDK.init()
//   await YandexSDK.showInterstitial()
//   const coins = await YandexSDK.storage.getNumber("coins", 0)

type AnyObj = Record<string, any>;

declare global {
    interface Window {
        YaGames?: {
            init: () => Promise<any>;
        };
    }
}

export type YandexSDKInitOptions = {
    debug?: boolean;
};

export class YandexSDK {
    private static ysdk: AnyObj | null = null;
    private static player: AnyObj | null = null;
    private static payments: AnyObj | null = null;
    private static isInited = false;
    private static debug = false;

    static get ready(): boolean {
        return this.isInited;
    }

    static async init(opts: YandexSDKInitOptions = {}): Promise<void> {
        if (this.isInited) return;

        this.debug = !!opts.debug;

        // If SDK script not loaded, fall back to stub mode (local dev)
        if (!window.YaGames || typeof window.YaGames.init !== "function") {
            this.log("[YandexSDK] SDK script not found. Running in stub mode.");
            this.isInited = true;
            return;
        }

        this.ysdk = await window.YaGames.init();
        this.isInited = true;

        this.log("[YandexSDK] YaGames.init ok");

        // Player is optional (may require auth)
        try {
            if (this.ysdk?.getPlayer) {
                this.player = await this.ysdk.getPlayer();
                this.log("[YandexSDK] getPlayer ok");
            }
        } catch (e) {
            this.log("[YandexSDK] getPlayer failed (ok in guest mode):", e);
            this.player = null;
        }

        // Payments optional (feature availability depends on game setup)
        try {
            if (this.ysdk?.getPayments) {
                this.payments = await this.ysdk.getPayments({ signed: true });
                this.log("[YandexSDK] getPayments ok");
            }
        } catch (e) {
            this.log("[YandexSDK] getPayments failed:", e);
            this.payments = null;
        }
    }

    // -----------------------------
    // Ads
    // -----------------------------

    static async showInterstitial(): Promise<boolean> {
        // returns true if shown successfully
        if (!this.ysdk?.adv?.showFullscreenAdv) {
            this.log("[YandexSDK] showInterstitial (stub)");
            return true;
        }

        return new Promise((resolve) => {
            this.ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onClose: () => resolve(true),
                    onError: (_err: any) => resolve(false),
                },
            });
        });
    }

    static async showRewarded(): Promise<boolean> {
        // returns true if watched fully and reward should be granted
        if (!this.ysdk?.adv?.showRewardedVideo) {
            this.log("[YandexSDK] showRewarded (stub)");
            return true;
        }

        return new Promise((resolve) => {
            this.ysdk.adv.showRewardedVideo({
                callbacks: {
                    onRewarded: () => resolve(true),
                    onClose: () => resolve(false),
                    onError: (_err: any) => resolve(false),
                },
            });
        });
    }

    // -----------------------------
    // Time (use server time if available)
    // -----------------------------

    static serverTimeMs(): number {
        // Prefer SDK server time when available; fallback to Date.now()
        // Some SDK versions expose ysdk.serverTime()
        try {
            const t = this.ysdk?.serverTime?.();
            if (typeof t === "number" && Number.isFinite(t)) return t;
        } catch {
            // ignore
        }
        return Date.now();
    }

    // -----------------------------
    // Storage (player data)
    // -----------------------------

    static storage = {
        async get<T = unknown>(key: string, fallback: T): Promise<T> {
            // Use player.getData if available; fallback to localStorage
            if (YandexSDK.player?.getData) {
                try {
                    const data = await YandexSDK.player.getData();
                    if (data && Object.prototype.hasOwnProperty.call(data, key)) return data[key] as T;
                } catch (e) {
                    YandexSDK.log("[YandexSDK.storage.get] getData failed:", e);
                }
            }

            // localStorage fallback
            try {
                const raw = localStorage.getItem(key);
                if (raw == null) return fallback;
                return JSON.parse(raw) as T;
            } catch {
                return fallback;
            }
        },

        async set<T = unknown>(key: string, value: T): Promise<void> {
            // Player data (recommended)
            if (YandexSDK.player?.setData) {
                try {
                    // merge update (Yandex player data is usually object-based)
                    const current = (await YandexSDK.player.getData?.()) ?? {};
                    const next = { ...current, [key]: value };
                    await YandexSDK.player.setData(next);
                    return;
                } catch (e) {
                    YandexSDK.log("[YandexSDK.storage.set] setData failed:", e);
                }
            }

            // localStorage fallback
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch {
                // ignore
            }
        },

        async getNumber(key: string, fallback = 0): Promise<number> {
            const v = await this.get<any>(key, fallback);
            const n = Number(v);
            return Number.isFinite(n) ? n : fallback;
        },

        async setNumber(key: string, value: number): Promise<void> {
            await this.set<number>(key, value);
        },
    };

    // -----------------------------
    // Payments (IAP)
    // -----------------------------

    static paymentsApi = {
        available(): boolean {
            return !!YandexSDK.payments;
        },

        async purchase(productId: string): Promise<boolean> {
            if (!YandexSDK.payments?.purchase) {
                YandexSDK.log("[YandexSDK.payments.purchase] (stub) product:", productId);
                return true;
            }

            try {
                await YandexSDK.payments.purchase({ id: productId });
                return true;
            } catch (e) {
                YandexSDK.log("[YandexSDK.payments.purchase] failed:", e);
                return false;
            }
        },

        async getPurchases(): Promise<AnyObj[]> {
            if (!YandexSDK.payments?.getPurchases) return [];
            try {
                const res = await YandexSDK.payments.getPurchases();
                return Array.isArray(res) ? res : [];
            } catch {
                return [];
            }
        },

        async consumePurchase(purchaseToken: string): Promise<boolean> {
            if (!YandexSDK.payments?.consumePurchase) return true;
            try {
                await YandexSDK.payments.consumePurchase(purchaseToken);
                return true;
            } catch (e) {
                YandexSDK.log("[YandexSDK.payments.consumePurchase] failed:", e);
                return false;
            }
        },
    };

    // -----------------------------
    // Debug
    // -----------------------------

    private static log(...args: any[]) {
        if (!this.debug) return;
        // eslint-disable-next-line no-console
        console.log(...args);
    }
}
