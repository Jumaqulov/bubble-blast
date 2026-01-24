// src/ui/HUD.ts
import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME } from "../config/constants";
import { getPhosphorKey } from "./phosphor";

export type HUDInitData = {
    level: number;
    score: number;
    shots: number;
    targetScore: number;
};

export class HUD extends Phaser.GameObjects.Container {
    private bg: Phaser.GameObjects.Graphics;

    // Progress Bar elementlari
    private barBg: Phaser.GameObjects.Rectangle;
    private barFill: Phaser.GameObjects.Rectangle;
    private barMask: Phaser.GameObjects.Graphics;
    private stars: Phaser.GameObjects.Image[] = [];

    private levelText: Phaser.GameObjects.Text;
    private scoreText: Phaser.GameObjects.Text;
    private shotsText: Phaser.GameObjects.Text;

    private currentScore = 0;
    private targetScore = 1000;
    private barWidth = 0;

    constructor(scene: Phaser.Scene, data: HUDInitData) {
        super(scene, 0, 0);

        this.currentScore = data.score;
        this.targetScore = data.targetScore || 1000;

        const barH = 100;
        const barMargin = 14;
        const barX = barMargin;
        const barY = 8;
        const barW = GAME.width - barMargin * 2;

        // 1. Asosiy Panel (Fon)
        this.bg = scene.add.graphics();
        this.bg.fillStyle(0x020617, 0.9); // Juda to'q ko'k (Slate-950)
        this.bg.fillRoundedRect(barX, barY, barW, barH - 10, 16);
        this.bg.lineStyle(2, 0x38BDF8, 0.8); // Yorqin havorang chiziq
        this.bg.strokeRoundedRect(barX, barY, barW, barH - 10, 16);

        // 2. PROGRESS BAR (O'rtada)
        const pbW = 340; // Wider
        const pbH = 32;  // Taller
        const pbX = GAME.width / 2 - pbW / 2;
        const pbY = barY + 42;
        this.barWidth = pbW;

        // Bar orqasi (qora) - barBg ga biriktiramiz
        // Kontrastni oshirish uchun qora fon (0x000000) va oq ramka (0xFFFFFF)
        this.barBg = scene.add.rectangle(GAME.width / 2, pbY + pbH / 2, pbW, pbH, 0x000000).setDepth(1);
        this.barBg.setStrokeStyle(2, 0xFFFFFF);

        // Bar to'lishi (Sariq)
        this.barFill = scene.add.rectangle(pbX, pbY, 0, pbH, 0xFACC15).setOrigin(0, 0).setDepth(2);

        // Mask (Bar to'lganda chetidan chiqib ketmasligi uchun)
        this.barMask = scene.add.graphics();
        this.barMask.fillStyle(0xffffff);
        this.barMask.fillRoundedRect(pbX, pbY, pbW, pbH, 12); // Rounder corners
        const mask = this.barMask.createGeometryMask();
        this.barFill.setMask(mask);
        this.barBg.setMask(mask);

        // Yulduzchalar (3 ta)
        const starPositions = [0.33, 0.66, 0.98]; // 1.0 would be partially cut off
        starPositions.forEach((pos) => {
            const sx = pbX + pbW * pos;
            const sy = pbY + pbH / 2;

            // Bo'sh yulduz (foni)
            // Stroke effekti berish uchun bir oz kattaroq qora yulduz orqasiga
            const starShadow = scene.add.image(sx, sy + 2, getPhosphorKey("starFilled"));
            starShadow.setDisplaySize(42, 42);
            starShadow.setTint(0x000000);
            starShadow.setAlpha(0.5);
            starShadow.setDepth(3);

            const starBg = scene.add.image(sx, sy, getPhosphorKey("starFilled"));
            starBg.setDisplaySize(36, 36); // Kattaroq
            starBg.setTint(0x475569); // Slate-600
            starBg.setDepth(4);

            // Yonadigan yulduz (ustida)
            const star = scene.add.image(sx, sy, getPhosphorKey("starFilled"));
            star.setDisplaySize(36, 36);
            star.setTint(0xFDE047); // Yellow-300 (Yorqinroq)
            star.setDepth(5);
            star.setVisible(false); // Boshida ko'rinmaydi

            // Glow effekti (yonib turganda)
            const glow = scene.add.image(sx, sy, getPhosphorKey("starFilled"));
            glow.setDisplaySize(48, 48);
            glow.setTint(0xFFFFFF);
            glow.setAlpha(0.4);
            glow.setBlendMode(Phaser.BlendModes.ADD);
            glow.setDepth(6);
            glow.setVisible(false);

            // Star objectiga glow ni ham biriktirib qo'yamiz, keyin updateProgress da ishlatamiz
            (star as any).glow = glow;

            this.stars.push(star);
            this.add([starShadow, starBg, star, glow]);
        });

        // 3. TEXTLAR
        const textStyle = { fontFamily: "Arial", fontSize: "20px", color: "#E2E8F0", fontStyle: "bold" };

        this.levelText = scene.add.text(barX + 20, barY + 20, `LEVEL ${data.level}`, textStyle);

        // Score (O'ng tarafda)
        this.scoreText = scene.add.text(barX + barW - 20, barY + 20, `${data.score}`, { ...textStyle, color: "#FCD34D" }).setOrigin(1, 0);

        // Shots (Pastda markazda yoki chapda)
        this.shotsText = scene.add.text(barX + 20, barY + 50, `${data.shots} Shots`, { ...textStyle, fontSize: "16px", color: "#F87171" });

        this.add([this.bg, this.barBg, this.barFill, this.levelText, this.scoreText, this.shotsText]);
        scene.add.existing(this);

        // Birinchi marta yangilash
        this.updateProgress();
    }

    // --- Methodlar (GameScene chaqiradigan) ---

    setLevel(level: number) {
        this.levelText.setText(`LEVEL ${level}`);
    }

    setScore(score: number) {
        this.currentScore = score;
        this.scoreText.setText(`${score}`);
        this.updateProgress();
    }

    setShots(shots: number) {
        this.shotsText.setText(`${shots} Shots`);
    }

    private updateProgress() {
        // Progressni hisoblash (0 dan 1 gacha)
        const pct = Phaser.Math.Clamp(this.currentScore / this.targetScore, 0, 1);

        // Barni cho'zish
        this.barFill.width = this.barWidth * pct;

        // Yulduzchalarni yoqish
        const starThresholds = [0.33, 0.66, 0.99];
        this.stars.forEach((star, idx) => {
            const threshold = starThresholds[idx];
            if (threshold !== undefined && pct >= threshold) {
                if (!star.visible) {
                    star.setVisible(true);
                    star.setScale(2.5);
                    this.scene.tweens.add({ targets: star, scale: 1, duration: 400, ease: 'Elastic.Out' });

                    const glow = (star as any).glow;
                    if (glow) {
                        glow.setVisible(true);
                        this.scene.tweens.add({
                            targets: glow,
                            alpha: { from: 0.6, to: 0.2 },
                            scale: { from: 1, to: 1.2 },
                            yoyo: true,
                            repeat: -1,
                            duration: 800
                        });
                    }
                }
            }
        });
    }
}