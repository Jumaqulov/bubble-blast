// src/ui/PopupManager.ts
// Simple popup system (modal overlay + panel + title/body + buttons).
// Later you can extend to: ShopPopup, DailyBonusPopup, SettingsPopup, etc.

import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";
import { GAME } from "../config/constants";
import { Button } from "./Button";

export type PopupButton = {
    text: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
    disabled?: boolean;
};

export type PopupOptions = {
    title: string;
    body?: string;
    width?: number;
    height?: number;
    buttons: PopupButton[];
    onClose?: () => void;
};

export class PopupManager {
    private scene: Phaser.Scene;
    private container: Phaser.GameObjects.Container | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    isOpen(): boolean {
        return !!this.container;
    }

    close(): void {
        if (!this.container) return;

        this.container.destroy(true);
        this.container = null;
    }

    show(opts: PopupOptions): void {
        this.close();

        const w = opts.width ?? 560;
        const h = opts.height ?? 360;

        const overlay = this.scene.add.graphics();
        overlay.fillStyle(0x000000, 0.55);
        overlay.fillRect(0, 0, GAME.width, GAME.height);

        // block input behind popup
        overlay.setInteractive(
            new Phaser.Geom.Rectangle(0, 0, GAME.width, GAME.height),
            Phaser.Geom.Rectangle.Contains
        );

        const panelX = GAME.width / 2 - w / 2;
        const panelY = GAME.height / 2 - h / 2;
        const panelGfx = this.scene.add.graphics();
        panelGfx.fillStyle(0x000000, 0.3);
        panelGfx.fillRoundedRect(panelX + 6, panelY + 10, w, h, 22);

        panelGfx.fillStyle(hexTo0x(Colors.ui.panel), 0.98);
        panelGfx.fillRoundedRect(panelX, panelY, w, h, 22);

        panelGfx.fillStyle(0xffffff, 0.08);
        panelGfx.fillRoundedRect(panelX + 12, panelY + 12, w - 24, 18, 10);
        panelGfx.fillStyle(0x000000, 0.2);
        panelGfx.fillRoundedRect(panelX + 12, panelY + h - 28, w - 24, 16, 10);

        panelGfx.lineStyle(2, hexTo0x(Colors.ui.playfieldBorder), 0.8);
        panelGfx.strokeRoundedRect(panelX, panelY, w, h, 22);
        panelGfx.lineStyle(2, 0xffffff, 0.12);
        panelGfx.strokeRoundedRect(panelX + 4, panelY + 4, w - 8, h - 8, 18);

        const title = this.scene.add
            .text(GAME.width / 2, GAME.height / 2 - h / 2 + 56, opts.title, {
                fontFamily: "Arial, sans-serif",
                fontSize: "40px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        const body = this.scene.add
            .text(GAME.width / 2, GAME.height / 2 - 10, opts.body ?? "", {
                fontFamily: "Arial, sans-serif",
                fontSize: "24px",
                color: Colors.ui.textSecondary,
                align: "center",
                wordWrap: { width: w - 80 },
            })
            .setOrigin(0.5);

        const btnY = GAME.height / 2 + h / 2 - 70;
        const total = opts.buttons.length;

        const spacing = 18;
        const btnW = total === 1 ? 340 : 240;
        const btnH = 82;

        const startX =
            GAME.width / 2 - ((total - 1) * (btnW + spacing)) / 2;

        const btns: Phaser.GameObjects.GameObject[] = [];

        opts.buttons.forEach((b, i) => {
            const x = startX + i * (btnW + spacing);
            const button = new Button(this.scene, x, btnY, {
                width: btnW,
                height: btnH,
                text: b.text,
                disabled: b.disabled,
                onClick: () => {
                    this.close();
                    b.onClick();
                    opts.onClose?.();
                },
            });

            // Variant styling (secondary)
            if (b.variant === "secondary") {
                // Quick override: make it look less “CTA”
                // (You can extend Button to support variants later.)
                (button as any).bg?.setFillStyle?.(hexTo0x(Colors.ui.ctaSecondary));
            }

            btns.push(button);
        });

        this.container = this.scene.add.container(0, 0, [
            overlay,
            panelGfx,
            title,
            body,
            ...btns,
        ]);

        // Nice pop-in animation
        this.container.setAlpha(0);
        this.container.setScale(0.96);
        this.scene.tweens.add({
            targets: this.container,
            alpha: 1,
            scale: 1,
            duration: 140,
            ease: "Quad.Out",
        });
    }
}
