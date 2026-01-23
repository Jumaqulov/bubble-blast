// src/scenes/MenuScene.ts
import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME } from "../config/constants";

export class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: "MenuScene" });
    }

    create() {
        // Background
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));

        const cx = GAME.width / 2;
        const cy = GAME.height / 2;

        // Title
        this.add
            .text(cx, cy - 260, "Bubble Blast", {
                fontFamily: "Arial, sans-serif",
                fontSize: "72px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        // Subtitle
        this.add
            .text(cx, cy - 190, "Pop • Match • Win", {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textSecondary,
            })
            .setOrigin(0.5);

        // Play Button (simple rectangle + text)
        const btnWidth = 360;
        const btnHeight = 96;

        const playBtnBg = this.add
            .rectangle(cx, cy + 40, btnWidth, btnHeight, hexTo0x(Colors.ui.ctaSecondary))
            .setStrokeStyle(4, hexTo0x(Colors.ui.ctaPrimaryTop))
            .setInteractive({ useHandCursor: true });

        const playBtnText = this.add
            .text(cx, cy + 40, "PLAY", {
                fontFamily: "Arial, sans-serif",
                fontSize: "40px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        // Hover / press feedback
        playBtnBg.on("pointerover", () => {
            playBtnBg.setFillStyle(hexTo0x(Colors.ui.ctaPrimaryTop));
        });

        playBtnBg.on("pointerout", () => {
            playBtnBg.setFillStyle(hexTo0x(Colors.ui.ctaSecondary));
        });

        playBtnBg.on("pointerdown", () => {
            this.cameras.main.flash(120, 0, 0, 0);
            this.scene.start("GameScene");
        });

        // Shop Button
        const shopY = cy + 160;
        const shopBtnBg = this.add
            .rectangle(cx, shopY, btnWidth, btnHeight, hexTo0x(Colors.ui.panel))
            .setStrokeStyle(4, hexTo0x(Colors.ui.ctaPrimaryBottom))
            .setInteractive({ useHandCursor: true });

        const shopBtnText = this.add
            .text(cx, shopY, "SHOP", {
                fontFamily: "Arial, sans-serif",
                fontSize: "40px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        shopBtnBg.on("pointerdown", () => {
            this.scene.start("ShopScene");
        });

        // Footer hint
        this.add
            .text(cx, GAME.height - 80, "Tap PLAY to start", {
                fontFamily: "Arial, sans-serif",
                fontSize: "22px",
                color: Colors.ui.textSecondary,
            })
            .setOrigin(0.5);
    }
}
