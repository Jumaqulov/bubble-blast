
import Phaser from "phaser";
import { HexColor, hexTo0x } from "../config/colors";

export class EffectManager {
    private scene: Phaser.Scene;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;

        // Generate texture for particles
        const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(4, 4, 4);
        graphics.generateTexture("particle_dot", 8, 8);
        graphics.destroy();
    }

    spawnPopParticles(x: number, y: number, colorHex: HexColor, count: number = 8) {
        // Create a temporary emitter for this burst specific color.
        // In Phaser 3.60+, scene.add.particles returns an Emitter if config object is provided.
        const emitter = this.scene.add.particles(x, y, "particle_dot", {
            lifespan: 600,
            speed: { min: 100, max: 300 },
            angle: { min: 0, max: 360 },
            scale: { start: 1.5, end: 0 },
            alpha: { start: 1, end: 0 },
            gravityY: 400,
            quantity: count,
            emitting: false,
            tint: hexTo0x(colorHex)
        });

        emitter.explode(count);

        // Auto-destroy after lifespan
        this.scene.time.delayedCall(1000, () => {
            emitter.destroy();
        });
    }

    spawnFloatingText(x: number, y: number, text: string, color: number = 0xffffff) {
        const txt = this.scene.add.text(x, y, text, {
            fontFamily: "Verdana",
            fontSize: "32px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
            fontStyle: "bold"
        });
        txt.setOrigin(0.5);
        txt.setTint(color);
        txt.setDepth(200);

        this.scene.tweens.add({
            targets: txt,
            y: y - 80,
            alpha: 0,
            scale: 1.5,
            duration: 800,
            ease: "Back.Out",
            onComplete: () => txt.destroy()
        });
    }
    shake(intensity: number = 0.01, duration: number = 200) {
        this.scene.cameras.main.shake(duration, intensity);
    }
}
