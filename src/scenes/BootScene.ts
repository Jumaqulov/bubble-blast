// src/scenes/BootScene.ts
import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME, DEBUG } from "../config/constants";
import { YandexSDK } from "../services/YandexSDK";
import { ensurePhosphorTextures } from "../ui/phosphor";

export class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: "BootScene" });
    }

    preload() {
        this.load.setPath("assets/audio");

        // Hozircha audio fayllar yo'q, shuning uchun ularni yuklamaymiz.
        // Fayllarni topganingizda bu qatorlarni "comment"dan chiqarasiz.

        // this.load.audio("bgm_main", "bgm_main.mp3");
        // this.load.audio("sfx_shoot", "shoot.mp3");
        // this.load.audio("sfx_pop", "pop.mp3");
        // this.load.audio("sfx_bounce", "bounce.mp3");
        // this.load.audio("sfx_win", "win.mp3");
        // this.load.audio("sfx_lose", "lose.mp3");
        // this.load.audio("sfx_click", "click.mp3");
    }

    async create() {
        // Solid background immediately
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));

        // Generate icon textures
        ensurePhosphorTextures(this);
        this.createGameTextures();


        // Ensure consistent scaling on resize
        this.setupScaleHandlers();

        // Audio contextni faollashtirish (kelajak uchun)
        this.input.once("pointerdown", () => {
            if (this.sound instanceof Phaser.Sound.WebAudioSoundManager) {
                const ctx = this.sound.context;
                if (ctx && ctx.state === "suspended") {
                    ctx.resume().catch(() => undefined);
                }
            }
        });

        const loadingText = this.add
            .text(GAME.width / 2, GAME.height / 2, "Loading...", {
                fontFamily: "Arial, sans-serif",
                fontSize: "42px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        // Yandex SDK (lokal muhitda xatolik bersa ham davom etadi)
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
            }
        }

        // Kichik pauza va MenuScene'ga o'tish
        this.time.delayedCall(150, () => {
            loadingText.destroy();
            this.scene.start("MenuScene");
        });
    }

    private createGameTextures() {
        // Texture 1 & onwards: Vibrant Semi-Transparent Orbs (64x64)
        // Solid colorful rims with semi-transparent gummy centers for high distinguishability.
        Colors.bubblePalette.forEach((colorHex) => {
            const textureKey = `bubble_${colorHex}`;
            const g = this.make.graphics({ x: 0, y: 0 }, false);

            // Layer 1: The Body (Semi-Transparent Color)
            // Color presence is key here.
            g.fillStyle(hexTo0x(colorHex), 0.6);
            g.fillCircle(32, 32, 30);

            // Layer 2: The Rim (Definition)
            // Ensures the bubble has a sharp, colorful edge.
            g.lineStyle(3, hexTo0x(colorHex), 1.0);
            g.strokeCircle(32, 32, 30);

            // Layer 3: Inner Glow (Volume)
            // Gives it a spherical feel.
            g.fillStyle(0xffffff, 0.2);
            g.fillCircle(25, 25, 22);

            // Layer 4: Sharp Specular Highlights (The Wet Look)
            // Primary hotspot (Top-Left)
            g.fillStyle(0xffffff, 1.0);
            g.fillCircle(18, 18, 3);

            // Secondary small reflection (Bottom-Right)
            g.fillStyle(0xffffff, 0.4);
            g.fillCircle(44, 44, 1.5);

            g.generateTexture(textureKey, 64, 64);
            g.destroy();
        });

        // Backup generic texture
        const bubbleGfx = this.make.graphics({ x: 0, y: 0 }, false);
        bubbleGfx.fillStyle(0xffffff, 0.7);
        bubbleGfx.fillCircle(32, 32, 30);
        bubbleGfx.lineStyle(2, 0xffffff, 1.0);
        bubbleGfx.strokeCircle(32, 32, 30);
        bubbleGfx.fillStyle(0xffffff, 1.0);
        bubbleGfx.fillCircle(18, 18, 3);
        bubbleGfx.generateTexture("bubble_glossy", 64, 64);
        bubbleGfx.destroy();

        // Texture 2: particle_soft (16x16) - Soft Glow
        const particleGfx = this.make.graphics({ x: 0, y: 0 }, false);
        particleGfx.fillStyle(0xffffff, 1);
        particleGfx.fillCircle(8, 8, 4);
        particleGfx.fillStyle(0xffffff, 0.4);
        particleGfx.fillCircle(8, 8, 8);
        particleGfx.generateTexture("particle_soft", 16, 16);
        particleGfx.destroy();

        // Texture 3: bg_gradient (32x512) - Playfield Background
        const w = 32;
        const h = 512;
        const bgCanvas = this.textures.createCanvas("bg_gradient", w, h);
        if (bgCanvas) {
            const ctx = bgCanvas.getContext();
            const grd = ctx.createLinearGradient(0, 0, 0, h);
            grd.addColorStop(0, "#5CB5FA");
            grd.addColorStop(1, "#2D93E6");

            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, w, h);
            bgCanvas.refresh();
        }

        // Texture 4: bg_surround (32x512) - Side Borders
        const surroundCanvas = this.textures.createCanvas("bg_surround", w, h);
        if (surroundCanvas) {
            const ctx = surroundCanvas.getContext();
            const grd = ctx.createLinearGradient(0, 0, 0, h);
            grd.addColorStop(0, "#6a85b6");
            grd.addColorStop(1, "#bac8e0");

            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, w, h);
            surroundCanvas.refresh();
        }
    }

    private setupScaleHandlers() {
        const scale = this.scale;
        const onResize = () => {
            this.cameras.main.centerOn(GAME.width / 2, GAME.height / 2);
        };

        scale.on(Phaser.Scale.Events.RESIZE, onResize);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scale.off(Phaser.Scale.Events.RESIZE, onResize);
        });
        onResize();
    }
}