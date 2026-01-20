// src/ui/HUD.ts
// Minimal HUD (Top bar):
// - Level, Score, Shots
// - Update methods so GameScene can refresh values
// Later: add booster buttons + settings/pause.

import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME } from "../config/constants";

export type HUDInitData = {
    level: number;
    score: number;
    shots: number;
};

export class HUD extends Phaser.GameObjects.Container {
    private bg: Phaser.GameObjects.Graphics;

    private levelText: Phaser.GameObjects.Text;
    private scoreText: Phaser.GameObjects.Text;
    private shotsText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, data: HUDInitData) {
        super(scene, 0, 0);

        const barH = 96;
        const barMargin = 18;
        const barX = barMargin;
        const barY = 10;
        const barW = GAME.width - barMargin * 2;
        const barHInner = barH - 16;

        this.bg = scene.add.graphics();
        this.bg.fillStyle(hexTo0x(Colors.ui.panel), 0.92);
        this.bg.fillRoundedRect(barX, barY, barW, barHInner, 16);
        this.bg.lineStyle(2, hexTo0x(Colors.ui.playfieldBorder), 0.7);
        this.bg.strokeRoundedRect(barX, barY, barW, barHInner, 16);
        this.bg.fillStyle(hexTo0x(Colors.ui.background), 0.25);
        this.bg.fillRoundedRect(barX + 10, barY + 6, barW - 20, 6, 3);

        this.levelText = scene.add
            .text(barX + 18, barY + 18, `Level: ${data.level}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0, 0);
        this.levelText.setShadow(0, 2, Colors.ui.shadow, 4, true, true);

        this.scoreText = scene.add
            .text(GAME.width / 2, barY + 18, `Score: ${data.score}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.reward,
                fontStyle: "bold",
            })
            .setOrigin(0.5, 0);
        this.scoreText.setShadow(0, 2, Colors.ui.shadow, 4, true, true);

        this.shotsText = scene.add
            .text(barX + barW - 18, barY + 18, `Shots: ${data.shots}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(1, 0);
        this.shotsText.setShadow(0, 2, Colors.ui.shadow, 4, true, true);

        this.add([this.bg, this.levelText, this.scoreText, this.shotsText]);

        scene.add.existing(this);
    }

    setLevel(level: number) {
        this.levelText.setText(`Level: ${level}`);
    }

    setScore(score: number) {
        this.scoreText.setText(`Score: ${score}`);
    }

    setShots(shots: number) {
        this.shotsText.setText(`Shots: ${shots}`);
    }

    // Convenience
    setAll(data: Partial<HUDInitData>) {
        if (data.level !== undefined) this.setLevel(data.level);
        if (data.score !== undefined) this.setScore(data.score);
        if (data.shots !== undefined) this.setShots(data.shots);
    }
}
