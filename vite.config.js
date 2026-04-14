import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════════
//  TRACA SCENARIO WRITER — Vite Plugin
//  Ajoute un endpoint HTTP POST /api/save-scenario qui écrit
//  physiquement le fichier JSON du scénario sur le disque.
// ═══════════════════════════════════════════════════════════════
function scenarioWriterPlugin() {
    return {
        name: 'traca-scenario-writer',
        configureServer(server) {
            server.middlewares.use('/api/save-scenario', (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end('Method Not Allowed');
                    return;
                }

                let body = '';
                req.on('data', chunk => { body += chunk.toString(); });
                req.on('end', () => {
                    try {
                        const payload = JSON.parse(body);
                        const { experienceId, chapters, audioNodes, settings } = payload;

                        if (!experienceId) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Missing experienceId' }));
                            return;
                        }

                        // ── Ensure data directory exists ──
                        const dataDir = path.resolve(process.cwd(), 'src/data');
                        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

                        // ── Write full scenario JSON (chapters + audioNodes + settings) ──
                        const filePath = path.join(dataDir, `scenario_${experienceId}.json`);
                        const fileContent = JSON.stringify({ 
                            experienceId,
                            savedAt: new Date().toISOString(),
                            chapters:    chapters    || [],
                            audioNodes:  audioNodes  || [],
                            settings:    settings    || {}
                        }, null, 2);

                        fs.writeFileSync(filePath, fileContent, 'utf-8');

                        console.log(`[TRACA Director] ✅ Scénario '${experienceId}' sauvegardé → ${filePath}`);

                        res.setHeader('Content-Type', 'application/json');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.end(JSON.stringify({ success: true, path: filePath }));

                    } catch (err) {
                        console.error('[TRACA Director] ❌ Erreur:', err);
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });
        }
    };
}

// ═══════════════════════════════════════════════════════════════
//  AUDIO LISTER — /api/list-audio?dir=casbah/narrations
//  Retourne la liste des .mp3 disponibles dans assets/audio/
// ═══════════════════════════════════════════════════════════════
function audioListerPlugin() {
    return {
        name: 'traca-audio-lister',
        configureServer(server) {
            server.middlewares.use('/api/list-audio', (req, res) => {
                const urlParams = new URL(req.url, 'http://localhost').searchParams;
                // Si '?dir=' est défini, on l'utilise (même vide), sinon on regarde le root audio.
                const dir = urlParams.has('dir') ? urlParams.get('dir') : '';
                const audioPath = path.resolve(process.cwd(), 'assets/audio', dir);

                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');

                if (!fs.existsSync(audioPath)) {
                    res.end(JSON.stringify({ files: [] }));
                    return;
                }

                const files = fs.readdirSync(audioPath)
                    .filter(f => /\.(mp3|ogg|wav|m4a)$/i.test(f))
                    .sort();

                res.end(JSON.stringify({ files }));
            });
        }
    };
}

export default defineConfig({
    plugins: [scenarioWriterPlugin(), audioListerPlugin()],

    // Multi-page setup for Vite
    build: {
        rollupOptions: {
            input: {
                main:      path.resolve(process.cwd(), 'index.html'),
                synagogue: path.resolve(process.cwd(), 'experiences/synagogue/index.html'),
                tombeau:   path.resolve(process.cwd(), 'experiences/tombeau/index.html'),
                casbah:    path.resolve(process.cwd(), 'experiences/casbah/index.html'),
            }
        }
    },

    server: {
        port: 5173,
        open: false,
    }
});
