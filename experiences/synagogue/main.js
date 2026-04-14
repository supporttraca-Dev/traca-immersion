import { ExperienceManager } from '../../src/js/core/ExperienceManager.js';
import { AudioManager }      from '../../src/js/core/AudioManager.js';
import { ParticleSystem }    from '../../src/js/core/ParticleSystem.js';
import { DirectorTool }      from '../../src/js/core/DirectorTool.js';

// ══════════════════════════════════════════════════════════════════
//  SYNAGOGUE — main.js
// ══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. Load scenario (from saved JSON or fallback inline) ──────
    let chapters;
    try {
        const res = await fetch('../../src/data/scenario_synagogue.json');
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        chapters = data.chapters;
        console.log('[TRACA] ✅ Scénario Synagogue chargé depuis JSON.');
    } catch {
        console.warn('[TRACA] ⚠ Scénario JSON introuvable — utilisation du scénario par défaut.');
        chapters = [
            { theta:  10, phi: 72, r: 120, tx: 0,    ty: 0.4,  tz: 0, fov: 32 },
            { theta:   5, phi: 80, r:  58, tx: 0,    ty:-0.05, tz: 0, fov: 24 },
            { theta: -70, phi: 68, r:  90, tx:-0.2,  ty: 0.6,  tz: 0, fov: 27 },
            { theta:-150, phi: 87, r:  75, tx: 0.3,  ty:-0.2,  tz: 0, fov: 28 },
            { theta:-200, phi: 74, r:  80, tx: 0,    ty: 0.3,  tz: 0, fov: 26 },
            { theta: -40, phi: 16, r: 105, tx: 0,    ty: 0,    tz: 0, fov: 40 },
            { theta:-360, phi: 65, r: 115, tx: 0,    ty: 0.5,  tz: 0, fov: 34 },
        ];
    }

    // ── 2. Particles ───────────────────────────────────────────────
    new ParticleSystem('particles-canvas', {
        colors: [
            [212, 168, 83],
            [83,  130, 212],
            [212, 83,  83],
            [83,  180, 130],
        ]
    });

    // ── 3. Audio ───────────────────────────────────────────────────
    const audio = new AudioManager();

    // ── 4. Experience Engine ───────────────────────────────────────
    const experience = new ExperienceManager({
        modelId:       'synagogue-model',
        chapters:      chapters,
        audioManager:  audio,
    });

    // ── 5. Director Tool (Scene Editor) ────────────────────────────
    const modelViewer = document.getElementById('synagogue-model');
    let directorStarted = false;

    const startDirector = () => {
        if (directorStarted) return;   // garde anti-double init
        directorStarted = true;
        new DirectorTool(experience);
    };

    if (modelViewer.loaded) {
        startDirector();
    } else {
        const fallbackTimer = setTimeout(startDirector, 4000);
        modelViewer.addEventListener('load', () => {
            clearTimeout(fallbackTimer);  // annuler le fallback si load est plus rapide
            startDirector();
        }, { once: true });
    }

});
