# 🏛️ TRACA — La Bible Technique (v1.0)
> **Rôle :** Lead Developer & Rédacteur Technique Senior
> **Projet :** Plateforme Immersive Traça (Tombeau, Synagogue, Casbah)
> **Statut :** V1 Déployée sur Vercel (traca-immersion)

---

## 1. Architecture et Fonctionnalités Implémentées

L'architecture de TRACA repose sur une approche "Vanilla Core" performante, utilisant des modules ES6 natifs sans framework lourd (React/Vue), afin de maximiser la vitesse de chargement initiale.

### ⚙️ Le Cœur du Système (Core Services)
- **`ExperienceManager.js`** : Le moteur principal pour les expériences basées sur des modèles 3D.
    - **Synchronisation Scroll/Caméra** : Utilise `Lenis` pour un défilement fluide et synchronise la position du scroll avec les "Chapters" (états de caméra orbitale).
    - **Loading Gate** : Un système de verrouillage strict qui empêche l'accès à l'expérience tant que `model-viewer` n'a pas émis l'événement `load`.
    - **Intégration AR** : Gère l'invocation native de Google SceneViewer (Android) et QuickLook (iOS).
- **`TracaAudio.js`** : Moteur audio avancé basé sur la **Web Audio API**.
    - **Gestion du Contexte** : Déverrouillage global au premier clic.
    - **Persistence** : Sauvegarde des niveaux de volume (Musique/Ambiance/Narration) dans le `localStorage`.
    - **Crossfade** : Transitions fluides entre les musiques de fond.
- **`DirectorTool.js` (L'Éditeur)** : Un outil de mise en scène en temps réel.
    - Permet de manipuler la caméra, de capturer les points de vue et de les sauvegarder directement dans un fichier `scenario.json` via un plugin Vite custom.
- **`TracaLoader.js`** : Un loader haut de gamme utilisant un **Chroma Key** (fond vert) pour détourer une vidéo de logo en temps réel sur un Canvas.

### 🖼️ Types d'Expériences
1. **Expérience Architecturale (ex: Tombeau, Synagogue)**
    - **Techno** : `<model-viewer>` (Web Components de Google).
    - **Rendu** : Éclairage PBR, ombres douces, environnement "Neutral".
2. **Expérience Panoramique 360° (ex: Casbah)**
    - **Techno** : `Three.js`.
    - **Rendu** : Sphère inversée avec textures 4K dynamiques (Jour/Nuit).

---

## 2. Bilan Technique (Post-Mortem)

### ✅ Points Forts
- **Performance de Déploiement** : Le projet a été optimisé de 270 Mo à **~88 Mo**, passant sous la barre critique des 100 Mo de Vercel sans perte de qualité visuelle grâce au traitement FFmpeg (CRF 26) et à la purge Git.
- **Zéro Latence UI** : L'absence de framework permet une interactivité immédiate (First Contentful Paint < 1s).
- **Outil Auteur propriétaire** : Le `DirectorTool` permet à un non-développeur de modifier la narration visuelle en quelques minutes sans toucher au code.

### ⚠️ Points Faibles et Dette Technique
- **Gestion du State** : Actuellement gérée par des objets globaux. Un passage à un gestionnaire de store (type Zustand/Redux) deviendra nécessaire si le nombre d'interactions augmente.
- **Duplication de Logique** : La logique de chargement et d'audio est légèrement différente entre `ExperienceManager` (Tombeau) et `main.js` (Casbah).
- **Textures 360°** : Pour le moment, elles sont chargées intégralement. Pour des scènes plus lourdes, il faudra envisager des "Tiled Textures".

---

## 3. Roadmap de Mise à l'Échelle (Scaling)

### 🚀 Recommandations de Stack
- **Framework** : Migration vers **Next.js** pour bénéficier du routage d'assets dynamique et des "Server Components" pour le SEO.
- **3D Engine** : Utiliser **React Three Fiber** pour unifier les expériences 360 et les modèles GLB dans un même pipeline.
- **VR Native** : Intégrer **WebXR** pour permettre une immersion totale avec casques (Meta Quest, Apple Vision Pro).

### 🎨 Optimisations Visuelles et Audio
1. **Modèles 3D** :
    - Implémenter des **LODs** (Level of Detail) pour charger des modèles basse résolution au loin.
    - Utiliser des textures **Korn KTX2** pour réduire la mémoire GPU.
2. **Audio Spatial** :
    - Passer de la stéréo à l'audio 3D (Panner Nodes) pour que le son des fontaines (Casbah) change selon l'orientation de l'utilisateur.
3. **Réalité Augmentée** :
    - Intégrer la détection de plans au sol persistants (WebXR Hit Test) pour stabiliser les monuments dans le monde réel.

---

## 4. 🧭 Guide de Contribution : Ajouter une Nouvelle Expérience

### Méthode A : Expérience Modèle (Type Tombeau)
1. **Assets** : Placer le fichier `.glb` dans `assets/models/`.
2. **Setup** : Copier le dossier `experiences/tombeau/` vers `experiences/nouveau-lieu/`.
3. **Config** : Dans le `index.html`, changer l'ID de `<model-viewer>` et le chemin du `src`.
4. **Narration** : Lancer le site en mode local, ouvrir `DirectorTool`, créer la séquence et exporter le JSON vers `src/data/scenario_nouveau.json`.

### Méthode B : Expérience 360 (Type Casbah)
1. **Assets** : Placer les photos 360 (Jour/Nuit) dans `assets/images/`.
2. **Code** : Mettre à jour les constantes de textures dans le `main.js` de la nouvelle expérience.
3. **POIs** : Utiliser l'UI interne pour placer les épingles (Points d'Intérêt) et enregistrer le scénario.

---
*Document produit par l'IA Antigravity pour l'équipe Traça.*
