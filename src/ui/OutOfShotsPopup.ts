import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME } from "../config/constants";

export class OutOfShotsPopup extends Phaser.GameObjects.Container {
    private onWatchAd: () => void;
    private onGiveUp: () => void;

    constructor(
        scene: Phaser.Scene,
        onWatchAd: () => void,
        onGiveUp: () => void
    ) {
        super(scene, 0, 0);
        this.onWatchAd = onWatchAd;
        this.onGiveUp = onGiveUp;

        this.createUI();
        this.setDepth(100); // Ensure it's above everything
    }

    private createUI() {
        const cx = GAME.width / 2;
        const cy = GAME.height / 2;

        // 1. Dimmed Background
        const bg = this.scene.add
            .rectangle(cx, cy, GAME.width, GAME.height, 0x000000, 0.7)
            .setInteractive(); // Block clicks below
        this.add(bg);

        // 2. Panel
        const panelW = 560;
        const panelH = 400;
        const panel = this.scene.add
            .rectangle(cx, cy, panelW, panelH, hexTo0x(Colors.ui.panel))
            .setStrokeStyle(4, hexTo0x(Colors.ui.playfieldBorder));
        this.add(panel);

        // 3. Title
        const title = this.scene.add
            .text(cx, cy - 120, "OUT OF MOVES!", {
                fontFamily: "Arial",
                fontSize: "48px",
                fontStyle: "bold",
                color: Colors.ui.warning,
            })
            .setOrigin(0.5);
        this.add(title);

        // 4. Description
        const desc = this.scene.add
            .text(cx, cy - 40, "Watch a video to get\n+5 BUBBLES", {
                fontFamily: "Arial",
                fontSize: "32px",
                align: "center",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);
        this.add(desc);

        // 5. Watch Ad Button
        const btnW = 300;
        const btnH = 80;
        const btnY = cy + 60;

        const adBtnBg = this.scene.add
            .rectangle(cx, btnY, btnW, btnH, hexTo0x(Colors.ui.ctaPrimaryTop))
            .setInteractive({ useHandCursor: true });

        const adBtnText = this.scene.add
            .text(cx, btnY, "WATCH AD", {
                fontFamily: "Arial",
                fontSize: "32px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        adBtnBg.on("pointerdown", () => {
            this.onWatchAd();
            this.destroy(); // Close popup
        });

        this.add([adBtnBg, adBtnText]);

        // 6. Give Up Button (Text only)
        const giveUpY = cy + 140;
        const giveUpText = this.scene.add
            .text(cx, giveUpY, "No thanks, I give up", {
                fontFamily: "Arial",
                fontSize: "24px",
                color: Colors.ui.textSecondary,
            })
            .setOrigin(0.5)
            .setInteractive({ useHandCursor: true });

        giveUpText.on("pointerdown", () => {
            this.onGiveUp();
            this.destroy();
        });

        this.add(giveUpText);
    }
}