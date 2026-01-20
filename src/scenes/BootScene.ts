// src/scenes/BootScene.ts
import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME, DEBUG } from "../config/constants";
import { YandexSDK } from "../services/YandexSDK";

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: "BootScene" });
    }

    async create() {
        // Solid background immediately
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));

        // Ensure consistent scaling on resize
        this.setupScaleHandlers();

        // Unlock audio on first user gesture (Chrome autoplay policy)
        this.input.once("pointerdown", () => {
            const ctx = this.sound?.context;
            if (ctx && ctx.state === "suspended") {
                ctx.resume().catch(() => undefined);
            }
        });

        // Minimal "Loading" text (we'll do a richer Preload later if needed)
        const loadingText = this.add
            .text(GAME.width / 2, GAME.height / 2, "Loading...", {
                fontFamily: "Arial, sans-serif",
                fontSize: "42px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        // Init Yandex SDK (safe to fail in local dev)
        const inFrame = (() => {
            try {
                return window.self !== window.top;
            } catch {
                return true;
            }
        })();

        if (inFrame) {
            try {
                await YandexSDK.init({ debug: DEBUG.logSdk });
                if (DEBUG.logSdk) console.log("[BootScene] YandexSDK initialized");
            } catch (e) {
                if (DEBUG.logSdk) console.warn("[BootScene] YandexSDK init failed:", e);
                // Continue anyway (local dev/offline)
            }
        }

        // Small delay to avoid abrupt scene change
        this.time.delayedCall(150, () => {
            loadingText.destroy();
            this.scene.start("MenuScene");
        });
    }

    private setupScaleHandlers() {
        // Fit scale already set in config; here we just react to resize
        const scale = this.scale;

        const onResize = () => {
            // Phaser handles FIT scaling; we can still keep camera centered
            this.cameras.main.centerOn(GAME.width / 2, GAME.height / 2);
        };

        scale.on(Phaser.Scale.Events.RESIZE, onResize);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scale.off(Phaser.Scale.Events.RESIZE, onResize);
        });

        // Initial call
        onResize();
    }
}
