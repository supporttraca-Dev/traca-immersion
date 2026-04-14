import { ExperienceManager } from '../../src/js/core/ExperienceManager.js';
import { AudioManager }      from '../../src/js/core/AudioManager.js';
import { ParticleSystem }    from '../../src/js/core/ParticleSystem.js';
import { DirectorTool }      from '../../src/js/core/DirectorTool.js';

// ══════════════════════════════════════════════════════════════════
//  TOMBEAU — main.js
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. Load scenario (from saved JSON or fallback inline) ──────
    let chapters;
    try {
        const res = await fetch('../../src/data/scenario_tombeau.json');
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        chapters = data.chapters;
        console.log('[TRACA] ✅ Scénario Tombeau chargé depuis JSON.');
    } catch {
        console.warn('[TRACA] ⚠ Scénario JSON introuvable — utilisation du scénario par défaut.');
        chapters = [
            { theta:  15, phi: 68, r: 120, tx: 0,    ty: 0.3,  tz: 0, fov: 30 },
            { theta:   5, phi: 82, r:  62, tx: 0,    ty:-0.1,  tz: 0, fov: 22 },
            { theta: -80, phi: 72, r:  88, tx: 0.2,  ty: 0.5,  tz: 0, fov: 26 },
            { theta:-200, phi: 86, r:  80, tx: 0,    ty:-0.3,  tz: 0, fov: 28 },
            { theta:-300, phi: 80, r:  55, tx: 0.3,  ty: 0.2,  tz: 0, fov: 20 },
            { theta: -45, phi: 18, r: 100, tx: 0,    ty: 0,    tz: 0, fov: 38 },
            { theta:-360, phi: 65, r: 110, tx: 0,    ty: 0.4,  tz: 0, fov: 34 },
        ];
    }

    // ── 2. Particles ───────────────────────────────────────────────
    new ParticleSystem('particles-canvas', {
        colors: [
            [231, 186, 128],
            [212, 168, 83],
            [190, 150, 90],
        ]
    });

    // ── 3. Audio ───────────────────────────────────────────────────
    const audio = new AudioManager();

    // ── 4. Experience Engine ───────────────────────────────────────
    const experience = new ExperienceManager({
        modelId:       'mausoleum-model',
        chapters:      chapters,
        audioManager:  audio,
    });

    // ── 5. Director Tool (Scene Editor) ────────────────────────────
    const modelViewer = document.getElementById('mausoleum-model');
    let directorStarted = false;

    const startDirector = () => {
        if (directorStarted) return;   // garde anti-double init
        directorStarted = true;
        new DirectorTool(experience);
    };

    if (modelViewer.loaded) {
        startDirector();
    } else {
        const fallbackTimer = setTimeout(startDirector, 6000); // tombeau est plus lourd
        modelViewer.addEventListener('load', () => {
            clearTimeout(fallbackTimer);
            startDirector();
        }, { once: true });
    }

});
