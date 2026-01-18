// src/main.ts
import Phaser from "phaser";
import { createPhaserConfig } from "./config/game";

// Prevent accidental page scrolling on mobile
function preventDefaultBrowserBehavior() {
    document.addEventListener(
        "touchmove",
        (e) => {
            e.preventDefault();
        },
        { passive: false }
    );
}

// Ensure DOM is ready before creating the game
function bootstrap() {
    preventDefaultBrowserBehavior();

    // Create Phaser game instance
    const config = createPhaserConfig();
    // eslint-disable-next-line no-new
    new Phaser.Game(config);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
} else {
    bootstrap();
}
