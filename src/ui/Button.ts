// src/ui/Button.ts
// Reusable UI button component for Phaser.
// Features:
// - hover / press feedback
// - disabled state
// - consistent colors from Colors config
// - simple API

import Phaser from "phaser";
import { Colors, hexTo0x } from "../config/colors";

export type ButtonOptions = {
    width: number;
    height: number;
    text: string;
    onClick: () => void;
    disabled?: boolean;
};

export class Button extends Phaser.GameObjects.Container {
    private shadow: Phaser.GameObjects.Rectangle;
    private bg: Phaser.GameObjects.Rectangle;
    private gloss: Phaser.GameObjects.Rectangle;
    private label: Phaser.GameObjects.Text;
    private disabled: boolean;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        options: ButtonOptions
    ) {
        super(scene, x, y);

        this.disabled = !!options.disabled;

        // Background + depth
        this.shadow = scene.add
            .rectangle(0, 6, options.width, options.height, 0x000000, 0.28);

        this.bg = scene.add
            .rectangle(
                0,
                0,
                options.width,
                options.height,
                hexTo0x(
                    this.disabled ? Colors.ui.disabled : Colors.ui.ctaPrimaryTop
                )
            )
            .setStrokeStyle(
                3,
                hexTo0x(
                    this.disabled ? Colors.ui.disabled : Colors.ui.ctaPrimaryBottom
                )
            );

        this.gloss = scene.add
            .rectangle(0, -options.height / 2 + 10, options.width - 12, 10, 0xffffff, 0.14);

        // Text
        this.label = scene.add
            .text(0, 0, options.text, {
                fontFamily: "Arial, sans-serif",
                fontSize: "32px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        this.add([this.shadow, this.bg, this.gloss, this.label]);
        this.setSize(options.width, options.height);
        this.setInteractive({ useHandCursor: !this.disabled });

        if (!this.disabled) {
            this.setupInteractions(options.onClick);
        }

        scene.add.existing(this);
    }

    private setupInteractions(onClick: () => void) {
        this.on("pointerover", () => {
            this.bg.setFillStyle(hexTo0x(Colors.ui.ctaSecondary));
            this.gloss.setFillStyle(0xffffff, 0.2);
        });

        this.on("pointerout", () => {
            this.bg.setFillStyle(hexTo0x(Colors.ui.ctaPrimaryTop));
            this.gloss.setFillStyle(0xffffff, 0.14);
        });

        this.on("pointerdown", () => {
            this.bg.setScale(0.96);
        });

        this.on("pointerup", () => {
            this.bg.setScale(1);
            onClick();
        });
    }

    setDisabled(value: boolean) {
        this.disabled = value;
        this.disableInteractive();

        this.bg.setFillStyle(hexTo0x(Colors.ui.disabled));
        this.bg.setStrokeStyle(4, hexTo0x(Colors.ui.disabled));
        this.shadow.setFillStyle(0x000000, 0.2);
        this.gloss.setFillStyle(0xffffff, 0.06);
    }

    setText(text: string) {
        this.label.setText(text);
    }
}
