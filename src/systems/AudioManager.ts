import Phaser from "phaser";
import { StorageService } from "../services/StorageService";

export class AudioManager {
    private scene: Phaser.Scene;
    private static _muted: boolean = false;
    private static _musicKey: string | null = null;
    private static _currentMusic: Phaser.Sound.BaseSound | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.initMuteState();
    }

    private async initMuteState() {
        // We can load specific audio settings if we had them in StorageService
        // For now, let's keep it simple in-memory or generic
    }

    static get muted() {
        return this._muted;
    }

    static set muted(val: boolean) {
        this._muted = val;
        if (val) {
            if (this._currentMusic && this._currentMusic.isPlaying) {
                this._currentMusic.pause();
            }
        } else {
            if (this._currentMusic && this._currentMusic.isPaused) {
                this._currentMusic.resume();
            }
        }
    }

    play(key: string, config?: Phaser.Types.Sound.SoundConfig) {
        if (AudioManager._muted) return;
        // Check if sound exists in cache
        if (!this.scene.cache.audio.exists(key)) return;

        try {
            this.scene.sound.play(key, config);
        } catch (err) {
            console.warn("Audio play failed", err);
        }
    }

    playMusic(key: string, volume: number = 0.5) {
        if (AudioManager._musicKey === key && AudioManager._currentMusic) {
            if (!AudioManager._currentMusic.isPlaying && !AudioManager._muted) {
                AudioManager._currentMusic.resume();
            }
            return;
        }

        if (AudioManager._currentMusic) {
            AudioManager._currentMusic.stop();
            AudioManager._currentMusic.destroy();
            AudioManager._currentMusic = null;
        }

        AudioManager._musicKey = key;
        if (!this.scene.cache.audio.exists(key)) return;

        try {
            const music = this.scene.sound.add(key, {
                volume,
                loop: true
            });
            AudioManager._currentMusic = music;
            if (!AudioManager._muted) {
                music.play();
            }
        } catch (err) {
            console.warn("Music play failed", err);
        }
    }

    stopMusic() {
        if (AudioManager._currentMusic) {
            AudioManager._currentMusic.stop();
        }
    }
}
