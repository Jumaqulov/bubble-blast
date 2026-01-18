// src/config/game.ts
import Phaser from "phaser";
import { GAME } from "./constants";
import { Colors, hexTo0x } from "./colors";

import { BootScene } from "../scenes/BootScene";
import { MenuScene } from "../scenes/MenuScene";
import { GameScene } from "../scenes/GameScene";

export function createPhaserConfig(): Phaser.Types.Core.GameConfig {
    return {
        type: Phaser.AUTO,
        width: GAME.width,
        height: GAME.height,
        backgroundColor: hexTo0x(Colors.ui.background),
        parent: "game", // index.html da <div id="game"></div> bo'ladi

        fps: {
            target: GAME.fps,
            forceSetTimeOut: true,
        },

        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            width: GAME.width,
            height: GAME.height,
        },

        render: {
            antialias: true,
            pixelArt: false,
            roundPixels: false,
        },

        input: {
            mouse: true,
            touch: true,
            // disable right-click context menu issues in some browsers
            windowEvents: true,
        },

        scene: [BootScene, MenuScene, GameScene],
    };
}
