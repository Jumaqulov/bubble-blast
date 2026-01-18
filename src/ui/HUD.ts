// src/ui/HUD.ts
// Minimal HUD (Top bar):
// - Level, Coins, Shots
// - Update methods so GameScene can refresh values
// Later: add booster buttons + settings/pause.

import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME } from "../config/constants";

export type HUDInitData = {
    level: number;
    coins: number;
    shots: number;
};

export class HUD extends Phaser.GameObjects.Container {
    private bg: Phaser.GameObjects.Rectangle;

    private levelText: Phaser.GameObjects.Text;
    private coinsText: Phaser.GameObjects.Text;
    private shotsText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, data: HUDInitData) {
        super(scene, 0, 0);

        const barH = 96;

        this.bg = scene.add
            .rectangle(GAME.width / 2, barH / 2, GAME.width, barH, hexTo0x(Colors.ui.panel))
            .setAlpha(0.85);

        this.levelText = scene.add
            .text(24, 26, `Level: ${data.level}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0, 0);

        this.coinsText = scene.add
            .text(GAME.width / 2, 26, `Coins: ${data.coins}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.reward,
                fontStyle: "bold",
            })
            .setOrigin(0.5, 0);

        this.shotsText = scene.add
            .text(GAME.width - 24, 26, `Shots: ${data.shots}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(1, 0);

        this.add([this.bg, this.levelText, this.coinsText, this.shotsText]);

        scene.add.existing(this);
    }

    setLevel(level: number) {
        this.levelText.setText(`Level: ${level}`);
    }

    setCoins(coins: number) {
        this.coinsText.setText(`Coins: ${coins}`);
    }

    setShots(shots: number) {
        this.shotsText.setText(`Shots: ${shots}`);
    }

    // Convenience
    setAll(data: Partial<HUDInitData>) {
        if (data.level !== undefined) this.setLevel(data.level);
        if (data.coins !== undefined) this.setCoins(data.coins);
        if (data.shots !== undefined) this.setShots(data.shots);
    }
}
