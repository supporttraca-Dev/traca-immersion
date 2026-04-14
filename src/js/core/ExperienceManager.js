/**
 * ExperienceManager.js — TRACA Core Engine v3
 *
 * ARCHITECTURE CAMERA (corrigée) :
 *  - Fini les gsap.to(this.cam) figés à l'init qui ne voient pas les mises à jour du Director.
 *  - La caméra est maintenant synchronisée via un listener Lenis qui LIT config.chapters en LIVE.
 *  - En mode EDIT, le listener ne fait rien → model-viewer reprend le contrôle manuel.
 *  - _applyCam(cam) prend un objet { theta, phi, radius, tx, ty, tz, fov } en unités claires.
 *
 * FORMAT DE DONNÉES CAMÉRA :
 *  { theta: DEG, phi: DEG, radius: METRES, tx: M, ty: M, tz: M, fov: DEG }
 */

export class ExperienceManager {
    constructor(config) {
        this.config        = config;
        this.modelViewer   = document.getElementById(config.modelId);
        this.chapterEls    = document.querySelectorAll('.chapter');
        this.audioManager  = config.audioManager;

        // Toggled by DirectorTool. When true, lenis camera sync is paused.
        this.isEditMode    = false;
        this.introStarted  = false;

        this.init();
    }

    // ─────────────────────────────────────────────────────────────────
    //  INIT
    // ─────────────────────────────────────────────────────────────────
    init() {
        gsap.registerPlugin(ScrollTrigger);

        this.setupLenis();
        this.setupIntroButton();
        this.buildNavDots();

        // ─────────────────────────────────────────────────────────────
        //  STRICT LOADING GATE
        //  L'utilisateur NE peut PAS entrer avant que le modèle soit
        //  chargé à 100%. Aucun fallback court ne contourne cela.
        // ─────────────────────────────────────────────────────────────
        this._lockEntry();  // verrou immédiat sur le bouton d'entrée

        if (this.modelViewer) {
            // Progression réelle via les events model-viewer
            this.modelViewer.addEventListener('progress', (e) => {
                const pct = Math.round((e.detail.totalProgress || 0) * 100);
                this._setLoaderProgress(pct);
            });

            // Fallback de sécurité absolu (90s) — réseau très lent
            this._safetyTimeout = setTimeout(() => {
                console.warn('[TRACA] ⚠ Timeout chargement modèle — accès forcé');
                this._setLoaderProgress(100);
                this._playIntro();
            }, 90000);

            // Déclenchement UNIQUEMENT quand le modèle est complètement chargé
            this.modelViewer.addEventListener('load', () => {
                clearTimeout(this._safetyTimeout);
                this._setLoaderProgress(100);
                setTimeout(() => this._playIntro(), 400);
            }, { once: true });

            // Erreur de chargement du modèle
            this.modelViewer.addEventListener('error', () => {
                clearTimeout(this._safetyTimeout);
                const label = document.getElementById('c-loader-label');
                if (label) label.innerText = 'Erreur de chargement. Rechargez la page.';
                const pctEl = document.getElementById('c-loader-pct');
                if (pctEl) pctEl.innerText = 'Erreur';
            }, { once: true });

        } else {
            // Pas de modèle 3D dans cette expérience — entrée directe
            setTimeout(() => this._playIntro(), 500);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  LOCK / UNLOCK ENTRY
    // ─────────────────────────────────────────────────────────────────
    _lockEntry() {
        // Affiche le bouton dès le début mais le désactive (style grisé/locked)
        const btn = document.getElementById('enter-btn') ||
                    document.getElementById('c-loader-enter');
        if (btn) {
            btn.style.display       = 'inline-block';
            btn.style.opacity       = '0.4';
            btn.style.pointerEvents = 'none';
            btn.style.filter        = 'grayscale(100%)';
        }
    }

    _unlockEntry() {
        // Réactive et met en évidence le bouton une fois le chargement terminé
        const btn = document.getElementById('enter-btn') ||
                    document.getElementById('c-loader-enter');
        if (btn) {
            btn.style.display       = 'inline-block';
            btn.style.opacity       = '1';
            btn.style.pointerEvents = 'auto';
            btn.style.filter        = 'none';
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  LOADER PROGRESS (RÉEL)
    // ─────────────────────────────────────────────────────────────────
    _setLoaderProgress(pct) {
        const v     = Math.min(Math.max(pct, 0), 100);
        const bar   = document.getElementById('c-loader-bar');
        const pctEl = document.getElementById('c-loader-pct');
        const lbl   = document.getElementById('c-loader-label');
        if (bar)   bar.style.width = v + '%';
        if (pctEl) pctEl.innerText = v + '%';
        if (lbl)   lbl.innerText = v < 100
            ? `Chargement du modèle 3D… ${v}%`
            : 'Chargement terminé — Bienvenue !';
    }

    // ─────────────────────────────────────────────────────────────────
    //  LENIS SMOOTH SCROLL
    // ─────────────────────────────────────────────────────────────────
    setupLenis() {
        this.lenis = new Lenis({
            duration:        1.6,
            easing:          (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            touchMultiplier: 1.8,
            smoothWheel:     true,
        });

        this.lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => this.lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);

        // ── CAMERA SYNC LIVE ────────────────────────────────────────
        // Lit config.chapters en direct → toujours à jour après une capture Director
        this.lenis.on('scroll', () => this._syncCameraToScroll());
    }

    // ─────────────────────────────────────────────────────────────────
    //  CAMERA SYNC (le cœur du système)
    // ─────────────────────────────────────────────────────────────────
    _syncCameraToScroll() {
        if (this.isEditMode) return;                  // EditMode → caméra libre
        if (!this.modelViewer) return;

        const chapters = this.config.chapters;
        const total = chapters.length;
        if (total === 0) return;

        // ── Calcul du progrès scroll dans le story-container ──
        const container = document.getElementById('story-container');
        if (!container) return;

        const scrollY      = window.scrollY;
        const containerTop = container.offsetTop;
        const containerH   = container.offsetHeight - window.innerHeight;
        const progress     = Math.max(0, Math.min(1, (scrollY - containerTop) / containerH));

        // ── Interpolation entre les chapitres adjacents ──
        const scaled  = progress * (total - 1);
        const prevIdx = Math.floor(scaled);
        const nextIdx = Math.min(prevIdx + 1, total - 1);
        const t       = scaled - prevIdx;           // 0 → 1 entre deux chapitres

        const prev = chapters[prevIdx];
        const next = chapters[nextIdx];
        if (!prev || !next) return;

        const lerp = (a, b, t) => a + (b - a) * t;

        this._applyCam({
            theta:  lerp(prev.theta,       next.theta,       t),
            phi:    lerp(prev.phi,         next.phi,         t),
            radius: lerp(prev.radius,      next.radius,      t),
            tx:     lerp(prev.tx   || 0,   next.tx   || 0,   t),
            ty:     lerp(prev.ty   || 0,   next.ty   || 0,   t),
            tz:     lerp(prev.tz   || 0,   next.tz   || 0,   t),
            fov:    lerp(prev.fov,         next.fov,         t),
        });
    }

    // ─────────────────────────────────────────────────────────────────
    //  APPLY CAM — format unifié : degrés + mètres
    // ─────────────────────────────────────────────────────────────────
    _applyCam(cam) {
        if (!this.modelViewer) return;
        this.modelViewer.cameraOrbit  = `${cam.theta}deg ${cam.phi}deg ${cam.radius}m`;
        this.modelViewer.cameraTarget = `${cam.tx || 0}m ${cam.ty || 0}m ${cam.tz || 0}m`;
        this.modelViewer.fieldOfView  = `${cam.fov}deg`;
    }

    // ─────────────────────────────────────────────────────────────────
    //  INTRO ANIMATION
    // ─────────────────────────────────────────────────────────────────
    _playIntro() {
        if (this.introStarted) return;
        this.introStarted = true;

        // ── Déverrouiller le bouton d'entrée avant l'animation ──
        this._unlockEntry();

        gsap.set('.intro-ornament-line', { scaleX: 0 });
        gsap.set(['.intro-eyebrow', '.intro-subtitle', '.intro-hint'], { opacity: 0, y: 15 });
        gsap.set('.intro-title-line', { opacity: 0, y: 35 });
        gsap.set('#enter-btn', { opacity: 0, y: 15 });

        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.to('.intro-ornament-line', { scaleX: 1, duration: 1.5, stagger: 0.3 })
          .to('.intro-eyebrow',       { opacity: 1, y: 0, duration: 1 }, '-=0.8')
          .to('.intro-title-line',    { opacity: 1, y: 0, duration: 1.4, stagger: 0.18, ease: 'power4.out' }, '-=0.6')
          .to('.intro-subtitle',      { opacity: 1, y: 0, duration: 1 }, '-=0.5')
          .to('.intro-hint',          { opacity: 1, y: 0, duration: 0.8 }, '-=0.3')
          .to('#enter-btn',           { opacity: 1, y: 0, duration: 1, ease: 'back.out(1.4)' }, '-=0.6');

        // Appliquer le chapitre initial sans attendre le premier scroll
        if (this.config.chapters[0]) {
            this._applyCam(this.config.chapters[0]);
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ENTER BUTTON
    // ─────────────────────────────────────────────────────────────────
    setupIntroButton() {
        // Support for both old enter-btn and new c-loader-enter
        const btn = document.getElementById('enter-btn') || document.getElementById('c-loader-enter');
        if (!btn) return;

        btn.addEventListener('click', () => {
            if (this.audioManager) this.audioManager.startAmbient();

            // Fade out the overlay (whichever is present)
            const target = document.getElementById('intro-overlay') || document.getElementById('c-loader');
            
            if (target) {
                gsap.to(target, {
                    opacity: 0, duration: 1.8, ease: 'power2.inOut',
                    onComplete: () => {
                        target.style.display = 'none';
                        this._revealUI();
                        this._setupScrollTriggers();
                    }
                });
            } else {
                this._revealUI();
                this._setupScrollTriggers();
            }

            // Fallback for Lenis (if loaded)
            if (this.lenis) {
                this.lenis.scrollTo(0, { immediate: true });
            }
        }, { once: true });
    }

    _revealUI() {
        gsap.to(['#chapter-nav', '#audio-toggle', '.back-btn', '#progress-container', '#btn-hud-home'], {
            opacity: 1, duration: 1, stagger: 0.12
        });
        const canvas = document.getElementById('particles-canvas');
        if (canvas) canvas.classList.add('visible');
    }

    // ─────────────────────────────────────────────────────────────────
    //  SCROLL TRIGGERS — Cards + Nav + AR (PAS la caméra, gérée via Lenis)
    // ─────────────────────────────────────────────────────────────────
    _setupScrollTriggers() {
        // Progress bar global
        gsap.to('#progress-bar', {
            width: '100%', ease: 'none',
            scrollTrigger: {
                trigger: '#story-container',
                start: 'top top',
                end:   'bottom bottom',
                scrub: 0.5
            }
        });

        this.chapterEls.forEach((chapter, index) => {
            const card      = chapter.querySelector('.chapter-card');
            const chapterId = chapter.getAttribute('data-chapter-id');

            // ── Card fade-in/out ───────────────────────────────────
            if (card) {
                ScrollTrigger.create({
                    trigger: chapter,
                    start:   'top 65%',
                    end:     'bottom 35%',
                    onEnter:     () => gsap.to(card, { opacity: 1, y: 0,   duration: 1.4, ease: 'power3.out' }),
                    onLeave:     () => gsap.to(card, { opacity: 0, y: -30, duration: 0.9, ease: 'power2.in'  }),
                    onEnterBack: () => gsap.to(card, { opacity: 1, y: 0,   duration: 1.2, ease: 'power3.out' }),
                    onLeaveBack: () => gsap.to(card, { opacity: 0, y: 40,  duration: 0.8, ease: 'power2.in'  }),
                });
            }

            // ── Nav dots + audio ───────────────────────────────────
            ScrollTrigger.create({
                trigger: chapter,
                start:   'top center',
                end:     'bottom center',
                onEnter:     () => this._updateState(index, chapterId),
                onEnterBack: () => this._updateState(index, chapterId),
            });
        });

        this._setupARButton();
    }

    // ─────────────────────────────────────────────────────────────────
    //  AR BUTTON
    // ─────────────────────────────────────────────────────────────────
    _setupARButton() {
        const arWrapper   = document.getElementById('ar-cta-wrapper');
        const arInvokeBtn = document.getElementById('ar-invoke-btn');
        const arNoSupport = document.getElementById('ar-no-support');
        const finalStep   = document.getElementById('final-step');
        if (!arWrapper || !finalStep) return;

        ScrollTrigger.create({
            trigger: finalStep,
            start: 'top 55%',
            onEnter: () => {
                arWrapper.classList.remove('hidden');
                gsap.fromTo(arWrapper, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out' });
            },
            onLeaveBack: () => {
                gsap.to(arWrapper, { opacity: 0, y: 40, duration: 0.6, ease: 'power2.in',
                    onComplete: () => arWrapper.classList.add('hidden') });
            }
        });

        if (!arInvokeBtn) return;
        arInvokeBtn.addEventListener('click', () => {
            if (this.modelViewer?.canActivateAR) {
                this.modelViewer.activateAR();
            } else if (arNoSupport) {
                arNoSupport.style.display = 'block';
                gsap.fromTo(arNoSupport, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 });
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────
    //  STATE UPDATE
    // ─────────────────────────────────────────────────────────────────
    _updateState(index, chapterId) {
        document.querySelectorAll('#chapter-nav li').forEach((dot, i) =>
            dot.classList.toggle('active', i === index)
        );
        const label = document.getElementById('progress-label');
        if (label) {
            const total = this.chapterEls.length;
            label.textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
        }
        if (this.audioManager) this.audioManager.playNarration(chapterId);
    }

    // ─────────────────────────────────────────────────────────────────
    //  NAV DOTS
    // ─────────────────────────────────────────────────────────────────
    buildNavDots() {
        const navUl = document.querySelector('#chapter-nav ul');
        if (!navUl) return;
        navUl.innerHTML = '';
        this.chapterEls.forEach((chapter, i) => {
            const li  = document.createElement('li');
            const btn = document.createElement('button');
            btn.setAttribute('aria-label', `Chapitre ${i + 1}`);
            if (i === 0) li.classList.add('active');
            btn.addEventListener('click', () =>
                this.lenis.scrollTo(chapter, { duration: 2.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) })
            );
            li.appendChild(btn);
            navUl.appendChild(li);
        });
    }
}
