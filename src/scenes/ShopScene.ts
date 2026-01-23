import Phaser from "phaser";
import { Colors, hexTo0x, HexColor } from "../config/colors";
import { GAME, ECONOMY } from "../config/constants";
import { GameState } from "../state/GameState";
import { getPhosphorKey, PhosphorIconId, ensurePhosphorTextures } from "../ui/phosphor";

type BoosterId = "colorSwap" | "aimGuide" | "bomb";

export class ShopScene extends Phaser.Scene {
    private balanceText!: Phaser.GameObjects.Text;
    private ownedTexts: Record<BoosterId, Phaser.GameObjects.Text> = {} as any;

    constructor() {
        super({ key: "ShopScene" });
    }

    create() {
        this.cameras.main.setBackgroundColor(hexTo0x(Colors.ui.background));
        ensurePhosphorTextures(this);

        const cx = GAME.width / 2;

        // Title
        this.add
            .text(cx, 80, "MARKET", {
                fontFamily: "Arial, sans-serif",
                fontSize: "52px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        // Balance
        this.balanceText = this.add
            .text(cx, 150, `Coins: ${GameState.coins}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "32px",
                color: "#FFD700",
                stroke: "#000",
                strokeThickness: 3,
            })
            .setOrigin(0.5);

        // Items
        const startY = 240;
        const spacing = 180;
        const items: { id: BoosterId; name: string; price: number; icon: PhosphorIconId; color: HexColor }[] = [
            { id: "colorSwap", name: "Color Swap", price: ECONOMY.shop.boosters.colorSwap, icon: "swap", color: Colors.ui.ctaSecondary as HexColor },
            { id: "aimGuide", name: "Aim Guide", price: ECONOMY.shop.boosters.aimGuide, icon: "aim", color: Colors.ui.reward as HexColor },
            { id: "bomb", name: "Bomb", price: ECONOMY.shop.boosters.bomb, icon: "bomb", color: Colors.ui.warning as HexColor },
        ];

        items.forEach((item, index) => {
            this.createItemRow(cx, startY + index * spacing, item);
        });

        // Close/Back Button
        const backBtn = this.add.rectangle(cx, GAME.height - 120, 240, 80, hexTo0x(Colors.ui.panel));
        backBtn.setStrokeStyle(3, hexTo0x(Colors.ui.playfieldBorder));
        backBtn.setInteractive({ useHandCursor: true });

        const backLabel = this.add
            .text(cx, GAME.height - 120, "BACK", {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        backBtn.on("pointerdown", () => {
            this.scene.start("MenuScene");
        });
    }

    private createItemRow(
        x: number,
        y: number,
        item: { id: BoosterId; name: string; price: number; icon: PhosphorIconId; color: HexColor }
    ) {
        const bgW = 560;
        const bgH = 150;
        const bg = this.add.rectangle(x, y, bgW, bgH, hexTo0x(Colors.ui.panel), 0.8);
        bg.setStrokeStyle(2, hexTo0x(Colors.ui.playfieldBorder));

        // Icon
        const iconX = x - 200;
        const iconBg = this.add.circle(iconX, y, 40, hexTo0x(item.color));
        const iconImg = this.add.image(iconX, y, getPhosphorKey(item.icon));
        iconImg.setDisplaySize(48, 48);
        iconImg.setTint(0xffffff);

        // Text Info
        const infoX = x - 120;
        this.add
            .text(infoX, y - 24, item.name, {
                fontFamily: "Arial, sans-serif",
                fontSize: "28px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0, 0.5);

        this.add
            .text(infoX, y + 20, `${item.price} Coins`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "24px",
                color: "#aaaaaa",
            })
            .setOrigin(0, 0.5);

        // Owned Count
        const count = GameState.boosters[item.id];
        this.ownedTexts[item.id] = this.add
            .text(x + 60, y, `x${count}`, {
                fontFamily: "Arial, sans-serif",
                fontSize: "32px",
                fontStyle: "bold",
                color: "#ffffff",
            })
            .setOrigin(0.5);

        // Buy Button
        const btnX = x + 180;
        const btnW = 110;
        const btnH = 60;
        const btn = this.add.rectangle(btnX, y, btnW, btnH, hexTo0x(Colors.ui.ctaPrimaryTop));
        btn.setStrokeStyle(2, hexTo0x(Colors.ui.ctaPrimaryBottom));
        btn.setInteractive({ useHandCursor: true });

        const btnLabel = this.add
            .text(btnX, y, "BUY", {
                fontFamily: "Arial, sans-serif",
                fontSize: "22px",
                fontStyle: "bold",
                color: "#ffffff",
            })
            .setOrigin(0.5);

        btn.on("pointerdown", () => {
            this.tryBuy(item.id, item.price, btn);
        });
    }

    private async tryBuy(id: BoosterId, price: number, btn: Phaser.GameObjects.Rectangle) {
        // Simple scale effect
        this.tweens.add({
            targets: btn,
            scale: 0.9,
            duration: 80,
            yoyo: true
        });

        const success = await GameState.spendCoins(price);
        if (success) {
            await GameState.addBooster(id, 1);
            this.updateUI();
            // Optional: play success sound
        } else {
            // Shake button or error
            this.tweens.add({
                targets: btn,
                x: btn.x + 10,
                duration: 50,
                yoyo: true,
                repeat: 3
            });
        }
    }

    private updateUI() {
        this.balanceText.setText(`Coins: ${GameState.coins}`);
        (Object.keys(this.ownedTexts) as BoosterId[]).forEach(id => {
            const count = GameState.boosters[id];
            this.ownedTexts[id].setText(`x${count}`);
        });
    }
}
