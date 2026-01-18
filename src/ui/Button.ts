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
    private bg: Phaser.GameObjects.Rectangle;
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

        // Background
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
                4,
                hexTo0x(
                    this.disabled ? Colors.ui.disabled : Colors.ui.ctaPrimaryBottom
                )
            );

        // Text
        this.label = scene.add
            .text(0, 0, options.text, {
                fontFamily: "Arial, sans-serif",
                fontSize: "32px",
                fontStyle: "bold",
                color: Colors.ui.textPrimary,
            })
            .setOrigin(0.5);

        this.add([this.bg, this.label]);
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
        });

        this.on("pointerout", () => {
            this.bg.setFillStyle(hexTo0x(Colors.ui.ctaPrimaryTop));
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
    }

    setText(text: string) {
        this.label.setText(text);
    }
}
