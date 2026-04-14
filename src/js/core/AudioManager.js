/**
 * AudioManager.js — TRACA v2
 *
 * Fix autoplay : startAmbient() doit être appelé dans un gestionnaire
 * de clic utilisateur pour contourner la politique des navigateurs.
 */
export class AudioManager {
    constructor() {
        this.ambient            = document.getElementById('ambient-audio');
        this.audioEnabled       = true;
        this.currentNarration   = null;

        this._setupToggleButton();
    }

    // Called INSIDE a user click event — the only way to bypass browser autoplay policy
    startAmbient() {
        if (!this.ambient) return;

        this.ambient.volume = 0;
        // Force load (important for preload="none")
        this.ambient.load();

        const playPromise = this.ambient.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    gsap.to(this.ambient, { volume: 0.32, duration: 5 });
                })
                .catch(err => {
                    console.warn('[AudioManager] Ambient blocked:', err);
                });
        }
    }

    playNarration(chapterId) {
        if (!this.audioEnabled) return;

        const narration = document.getElementById(`narration-${chapterId}`);
        if (!narration) return;

        // Fade out previous narration
        if (this.currentNarration && this.currentNarration !== narration) {
            this._fadeOut(this.currentNarration);
        }

        narration.load();
        narration.volume = 0;
        narration.play()
            .then(() => {
                gsap.to(narration, { volume: 0.85, duration: 1.2 });
                this.currentNarration = narration;
            })
            .catch(err => console.warn(`[AudioManager] Narration ${chapterId} blocked:`, err));
    }

    _fadeOut(el, onDone) {
        gsap.to(el, {
            volume: 0,
            duration: 0.6,
            onComplete: () => {
                el.pause();
                el.currentTime = 0;
                if (onDone) onDone();
            }
        });
    }

    _setupToggleButton() {
        const toggle = document.getElementById('audio-toggle');
        if (!toggle) return;

        toggle.addEventListener('click', () => {
            this.audioEnabled = !this.audioEnabled;

            const on  = document.getElementById('icon-sound-on');
            const off = document.getElementById('icon-sound-off');

            if (this.audioEnabled) {
                if (on)  on.style.display  = '';
                if (off) off.style.display = 'none';
                if (this.ambient) gsap.to(this.ambient, { volume: 0.32, duration: 0.8 });
            } else {
                if (on)  on.style.display  = 'none';
                if (off) off.style.display = '';
                if (this.ambient) this._fadeOut(this.ambient);
                if (this.currentNarration) this._fadeOut(this.currentNarration);
            }
        });
    }
}
