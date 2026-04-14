/**
 * TracaAudio.js — TRACA Core Audio Manager V2
 * 
 * Gestionnaire audio global par canaux.
 * Gère tout en interne sans dépendre du DOM HTML.
 * Résout les problèmes de crossfade, de ducking narratif, et la compatibilité iOS.
 */

export class TracaAudio {
    constructor() {
        this.basePath = '/assets/audio/';

        // --- CHANNELS ---
        this.channels = {
            ambience: this._createAudioEl(true),
            music: this._createAudioEl(true),
            narration: this._createAudioEl(false),
            sfx: this._createAudioEl(false)
        };

        // --- VOLUMES normalisés (mixage v1.0 — ajustés pour l'immersion) ---
        // SNAPSHOT v1.0 — Anciens niveaux : ambience:0.45, music:0.35, narration:1.0, sfx:0.7
        this.volumes = {
            ambience: 0.52,  // +15% — Ambiance plus présente pour l'immersion
            music: 0.16,  // -25% — Musique moins envahissante (v1.0)
            narration: 1.0,   // Narration ressort clairement (ducking sur musique)
            sfx: 0.7,   // Effets sonores nets
            ui: 0.6    // Sons Interface (clics, transitions)
        };

        // Indique si l'utilisateur a manuellement écrasé les réglages
        // Si true, restoreFromPrefs() ne réécrase pas ses choix.
        this._userOverrideVolume = {};

        this.duckingFactor = 0.2; // Volume de la musique pendant une narration
        this.isMuted = false;

        // États
        this.currentMusic = null;
        this.currentAmbience = null;
        this.currentNarration = null;

        // Animations actives (pour pouvoir les kill() si besoin)
        this.tweens = {
            ambience: null,
            music: null,
            narration: null
        };

        // Écouter la fin de narration pour "un-duck" la musique
        this.channels.narration.addEventListener('ended', () => {
            this.currentNarration = null;
            this._unduckMusic();
        });

        // Analyseur Audio dynamique (Karaoké) — Singleton
        // IMPORTANT : createMediaElementSource ne peut être appelé QU'UNE FOIS par élément audio.
        // Toute tentative de créer un second MediaElementSource sur le même élément provoque
        // un InvalidStateError qui crashe silencieusement le moteur audio du navigateur.
        // C'est pourquoi cet analyseur est centralisé ici et jamais recréé dans main.js.
        this.ctx = null;
        this.analyser = null;
        this.sourceNode = null;
        this._analyserDataArray = null; // Buffer réutilisable entre les frames
    }

    // ─────────────────────────────────────────────────────────────────
    // ANALYSEUR AUDIO (Karaoké Réactif) — SINGLETON
    // ─────────────────────────────────────────────────────────────────

    /**
     * Initialise l'analyseur une seule fois.
     * Appelé paresseusement lors du premier appel à getNarrationAmplitude().
     * CRITIQUE : ne jamais recréer un MediaElementSource sur this.channels.narration.
     */
    _initAnalyser() {
        if (this.ctx) return; // Déjà initialisé — sortie immédiate
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            // ↓↓↓ UN SEUL createMediaElementSource pour toute la vie de l'app ↓↓↓
            this.sourceNode = this.ctx.createMediaElementSource(this.channels.narration);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
            // Buffer réutilisable (évite les allocations à chaque frame)
            this._analyserDataArray = new Uint8Array(this.analyser.frequencyBinCount);
            console.info('[TracaAudio] Analyseur RMS initialisé (singleton).');
        } catch (e) {
            console.warn("[TracaAudio] Analyse audio (karaoké) désactivée par le navigateur.", e);
        }
    }

    /**
     * Débloque le contexte audio après un geste utilisateur.
     * À appeler dès le premier clic/touch dans l'application.
     */
    unlockAudioContext() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }

    /**
     * Retourne l'amplitude RMS (Root Mean Square) du canal narration, entre 0 et 255.
     * Méthode principale pour les sous-titres karaokés dans main.js.
     * SAFE : peut être appelée à chaque frame d'animation sans risque.
     */
    getNarrationAmplitude() {
        this._initAnalyser();
        if (!this.analyser || !this._analyserDataArray) return 0;

        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }

        this.analyser.getByteTimeDomainData(this._analyserDataArray);

        let sum = 0;
        for (let i = 0; i < this._analyserDataArray.length; i++) {
            const val = (this._analyserDataArray[i] - 128) / 128; // normalisation -1 à 1
            sum += val * val;
        }
        // Amplitude RMS rescalée 0→255 (identique à l'ancien code local dans main.js)
        return Math.sqrt(sum / this._analyserDataArray.length) * 255;
    }

    /**
     * @deprecated — Utiliser getNarrationAmplitude() à la place.
     * Conservé pour rétrocompatibilité.
     */
    getNarrationVolume() {
        return this.getNarrationAmplitude();
    }

    // ─────────────────────────────────────────────────────────────────
    // FACTORY
    // ─────────────────────────────────────────────────────────────────
    _createAudioEl(loop) {
        const el = document.createElement('audio');
        el.loop = loop;
        el.crossOrigin = 'anonymous'; // Important pour WebGL si besoin un jour
        // Sur iOS, il faut appeler load/play sur une action utilisateur.
        return el;
    }

    // ─────────────────────────────────────────────────────────────────
    // PLAY API
    // ─────────────────────────────────────────────────────────────────

    /**
     * Joue une Ambiance (remplace la précédente avec un crossfade doux)
     */
    playAmbience(filename, fadeDuration = 2) {
        if (!filename) return this.stopAmbience();
        if (this.currentAmbience === filename) return; // Déjà en cours

        this.currentAmbience = filename;
        // filename peut inclure un sous-dossier (ex: 'day/casbah_day_ambience.mp3')
        this._crossfade(this.channels.ambience, 'ambience', filename, fadeDuration);
    }

    /**
     * Joue une Musique (remplace la précédente avec un crossfade doux)
     * Gère automatiquement le ducking si une narration joue déjà.
     */
    playMusic(filename, fadeDuration = 2) {
        if (!filename) return this.stopMusic();
        if (this.currentMusic === filename) return;

        this.currentMusic = filename;
        const targetVol = this.currentNarration ? (this.volumes.music * this.duckingFactor) : this.volumes.music;
        this._crossfade(this.channels.music, 'music', filename, fadeDuration, targetVol);
    }

    /**
     * Joue une Narration. Déclenche le ducking de la musique et ambiance si désiré.
     */
    playNarration(filename) {
        if (!filename) return this.stopNarration();

        this.currentNarration = filename;
        const el = this.channels.narration;

        el.src = this.basePath + 'narration/' + filename;
        el.volume = this.volumes.narration;
        el.play().catch(e => console.warn('Narration bloquée par le nav:', e));

        // Ducking immédiat (rapide : 1s)
        this._duckMusic();
    }

    /**
     * Joue un Effet Sonore court en "Tir/Oublie" (Fire and forget).
     * Accepte un chemin relatif complet (ex: '../ui/click.mp3') ou juste le nom de fichier.
     */
    playSFX(filename) {
        if (this.isMuted) return;
        // Si filename contient '/', c'est un chemin relatif custom
        const src = filename.includes('/')
            ? this.basePath + filename  // ex: /assets/audio/../ui/click.mp3 → résolu par le browser
            : this.basePath + 'sfx/' + filename;
        const sfx = new Audio(src);
        sfx.volume = this.volumes.sfx;
        sfx.play().catch(e => console.warn('SFX bloqué:', e));
    }

    // ─────────────────────────────────────────────────────────────────
    // STOP API
    // ─────────────────────────────────────────────────────────────────
    stopAmbience(fadeDuration = 1) {
        this.currentAmbience = null;
        this._fadeOut(this.channels.ambience, 'ambience', fadeDuration);
    }

    stopMusic(fadeDuration = 2) {
        this.currentMusic = null;
        this._fadeOut(this.channels.music, 'music', fadeDuration);
    }

    stopNarration() {
        if (!this.currentNarration) return;
        this.currentNarration = null;

        const el = this.channels.narration;
        if (this.tweens.narration) this.tweens.narration.kill();

        this._fadeOut(el, 'narration', 0.5, () => {
            this._unduckMusic();
        });
    }

    stopAll() {
        this.stopMusic(1);
        this.stopAmbience(1);
        this.stopNarration();
    }

    // ─────────────────────────────────────────────────────────────────
    // VOLUMES & MUTE COMMANDS (USER UI)
    // ─────────────────────────────────────────────────────────────────
    setVolume(channelName, value) { // value entre 0.0 et 1.0
        this.volumes[channelName] = Math.max(0, Math.min(1, value));
        // Marquer que l'utilisateur a fait un choix manuel
        this._userOverrideVolume[channelName] = true;
        // Persister le choix utilisateur
        try { localStorage.setItem(`traca_vol_${channelName}`, value); } catch (e) { }

        // Application immédiate si la piste joue (et n'est pas muette ni duckée)
        if (this.isMuted) return;

        if (channelName === 'music' && this.channels.music.src) {
            const isDucking = this.currentNarration !== null;
            window.gsap.to(this.channels.music, { volume: isDucking ? (value * this.duckingFactor) : value, duration: 0.5 });
        }
        else if (channelName === 'ambience' && this.channels.ambience.src) {
            window.gsap.to(this.channels.ambience, { volume: value, duration: 0.5 });
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;

        if (this.isMuted) {
            window.gsap.to(this.channels.music, { volume: 0, duration: 1 });
            window.gsap.to(this.channels.ambience, { volume: 0, duration: 1 });
            window.gsap.to(this.channels.narration, { volume: 0, duration: 0.5 });
        } else {
            // Restore volumes
            const musVol = this.currentNarration ? (this.volumes.music * this.duckingFactor) : this.volumes.music;
            window.gsap.to(this.channels.music, { volume: musVol, duration: 1 });
            window.gsap.to(this.channels.ambience, { volume: this.volumes.ambience, duration: 1 });
            window.gsap.to(this.channels.narration, { volume: this.volumes.narration, duration: 0.5 });
        }
        return this.isMuted;
    }

    /**
     * Mode Muet Partiel (Casbah) : Coupe SEULEMENT la musique.
     * Les ambiances et la narration continuent de jouer.
     * Ideal pour le bouton mute in-game de la Casbah.
     */
    toggleMusicOnly() {
        this.isMusicMuted = !this.isMusicMuted;

        if (this.isMusicMuted) {
            if (this.tweens.music) this.tweens.music.kill();
            this.tweens.music = window.gsap.to(this.channels.music, { volume: 0, duration: 1 });
        } else {
            // Remonte uniquement la musique
            const musVol = this.currentNarration
                ? (this.volumes.music * this.duckingFactor)
                : this.volumes.music;
            if (this.tweens.music) this.tweens.music.kill();
            this.tweens.music = window.gsap.to(this.channels.music, { volume: musVol, duration: 1 });
        }
        return this.isMusicMuted;
    }

    /**
     * Charge les préférences utilisateur depuis localStorage.
     * Appelé au boot après que l'utilisateur a cliqué "Entrer".
     * Les préférences utilisateur ont TOUJOURS la priorité sur les niveaux de base.
     */
    restoreFromPrefs() {
        const keys = ['music', 'ambience', 'narration', 'sfx'];
        keys.forEach(ch => {
            const stored = localStorage.getItem(`traca_vol_${ch}`);
            if (stored !== null) {
                const val = parseFloat(stored);
                if (!isNaN(val)) {
                    this.volumes[ch] = val;
                    this._userOverrideVolume[ch] = true;
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // ENGINE (INTERNES)
    // ─────────────────────────────────────────────────────────────────

    /**
     * Baisse vivement la musique.
     */
    _duckMusic() {
        if (this.isMuted) return;
        if (this.tweens.music) this.tweens.music.kill();
        const targetVol = this.volumes.music * this.duckingFactor;

        this.tweens.music = window.gsap.to(this.channels.music, {
            volume: targetVol,
            duration: 1,
            ease: "power2.out"
        });
    }

    /**
     * Remonte doucement la musique après une voix.
     */
    _unduckMusic() {
        if (this.isMuted || !this.currentMusic) return; // Ne remonte pas si mute ou arrêté
        if (this.tweens.music) this.tweens.music.kill();

        this.tweens.music = window.gsap.to(this.channels.music, {
            volume: this.volumes.music,
            duration: 2,
            ease: "power2.inOut"
        });
    }

    /**
     * Magie du Crossfade Web : on ne peut pas crossfader un même élément <audio> 
     * avec deux sources différentes en même temps. 
     * Donc on utilise une petite ruse "Fade Out -> Swap Src -> Fade In" 
     * OU on crée un élément temporaire. 
     * Ici, le plus robuste (Crossfade parfait temporel), c'est l'élément temporaire "Overlap".
     */
    _crossfade(targetEl, channelName, newFilename, duration, customTargetVolume = null) {
        if (this.tweens[channelName]) this.tweens[channelName].kill();

        const volMax = customTargetVolume !== null ? customTargetVolume : this.volumes[channelName];
        const finalVol = this.isMuted ? 0 : volMax;

        // S'il n'y avait rien avant, on joue direct
        if (targetEl.paused || !targetEl.src) {
            targetEl.src = this.basePath + channelName + '/' + newFilename;
            targetEl.volume = 0;
            targetEl.play().catch(e => console.warn(`Autoplay bloqué (${channelName}):`, e));

            this.tweens[channelName] = window.gsap.to(targetEl, { volume: finalVol, duration: duration, ease: "power1.inOut" });
            return;
        }

        // Il y a déjà qqch : Vrai Crossfade via un clone temporaire
        const oldAudio = new Audio(targetEl.src);
        oldAudio.volume = targetEl.volume;
        oldAudio.currentTime = targetEl.currentTime; // Sync
        oldAudio.play().catch(e => { });

        // Fade Out the old clone and destroy it
        window.gsap.to(oldAudio, {
            volume: 0,
            duration: duration,
            ease: "power1.inOut",
            onComplete: () => { oldAudio.pause(); oldAudio.src = ''; }
        });

        // Load new on the main element and Fade In
        targetEl.src = this.basePath + channelName + '/' + newFilename;
        targetEl.volume = 0;
        targetEl.play().catch(e => console.warn(`Autoplay bloqué (${channelName}):`, e));

        this.tweens[channelName] = window.gsap.to(targetEl, { volume: finalVol, duration: duration, ease: "power1.inOut" });
    }

    /**
     * Simple Fade Out
     */
    _fadeOut(el, channelName, duration, onComplete) {
        if (!el.src || el.paused) return;
        if (this.tweens[channelName]) this.tweens[channelName].kill();

        this.tweens[channelName] = window.gsap.to(el, {
            volume: 0,
            duration: duration,
            ease: "power2.inOut",
            onComplete: () => {
                el.pause();
                if (onComplete) onComplete();
            }
        });
    }
}

// Instance globale exportée pour tout le projet (Singleton)
export const tracaAudio = new TracaAudio();
