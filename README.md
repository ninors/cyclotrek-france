# CycloTrek France 🚴‍♂️🇫🇷

> Planificateur d'itinéraires cyclotourisme en France avec gestion collaborative, analyse de relief IGN, tronçons multimodaux (Train SNCF, Bus, Autre), hébergements et synchronisation GitHub Workflow en temps réel.

🌐 **Application en ligne (GitHub Pages) :** [https://ninors.github.io/cyclotrek-france/](https://ninors.github.io/cyclotrek-france/)

---

## 🌟 Fonctionnalités Principales

### 🗺️ Tracé & Routage Intelligent
- **Profils vélo :** Randonnée / Trekking, Vélo Rapide (Route), Voies sécurisées.
- **Voies Vertes & Véloroutes :** Détection automatique des tronçons officiels (La Véloscénie, La Loire à Vélo, La Régalante, etc.) avec adaptation dynamique de l'itinéraire.
- **Analyse du sol & revêtement :** Intégration de données certifiées (IGN / Cerema) pour connaître le pourcentage exact d'asphalte, gravier et chemins naturels.
- **Profil d'altitude & dénivelé :** Visualisation interactive en temps réel (D+, D-, altitude min/max, survol synchronisé sur la carte).

### 🚆 Segments Multimodaux (Train SNCF, Bus & Autres)
- **Gares SNCF & Horaires en direct :** Recherche de gares de départ et d'arrivée via l'API publique SNCF / OpenData, consultation des fiches horaires et calcul des temps de trajet.
- **Liaisons Bus & Autocars :** Intégration des réseaux régionaux de cars et lignes interurbaines.
- **Affichage sur la carte :** Tracés pointillés distinctifs selon le type de transport, non comptabilisés dans le kilométrage vélo mais intégrés dans l'estimation globale du temps et du budget.

### 👥 Modifications Nominatives & Collaboration en Équipe
- **Profils personnalisés :** Choisissez ou créez votre profil (Prénom + Nom) avec avatar généré automatiquement (initiales sur fondu coloré unique).
- **Attribution d'actions :** Chaque étape, logement ou note de terrain porte le badge et les initiales du participant qui l'a créée ou modifiée.
- **Journal des modifications :** Suivi chronologique en direct de toutes les contributions apportées par le groupe.

### 📌 Notes de Terrain & Mur de Post-its
- **Notes interactives sur la carte :** Placez des repères sur n'importe quel point de la carte (dangers, travaux, points de vue, fontaines d'eau potable, pauses pique-nique, ateliers de réparation vélo).
- **Mur de Post-its :** Pense-bête partagé pour centraliser l'organisation (matériel, courses, heure de rassemblement, rappels).

### 🏨 Logistique & Hébergements d'Étape
- Modale détaillée pour chaque étape : type de logement (Camping, Gîte, Hôtel, Bivouac, Chez l'habitant), tarif TTC complet, statut de réservation, présence de commerces (boulangerie, supermarché, point d'eau, électricité).

### 🔄 Synchronisation GitHub Workflow & Keepalive
- Enregistrement continu dans le dépôt GitHub (`data/route.json`).
- Utilisation de requêtes `fetch` avec `keepalive: true` garantissant la transmission des modifications même si la page est fermée immédiatement après validation.

---

## 🚀 Déploiement sur GitHub Pages

1. Rendez-vous dans les **Settings** de votre dépôt GitHub.
2. Allez dans l'onglet **Pages** (dans la barre latérale gauche).
3. Sous **Build and deployment** :
   - Source : `Deploy from a branch`
   - Branch : `main` / Folder : `/ (root)`
4. Cliquez sur **Save**.
5. Votre site sera disponible à l'adresse : **`https://ninors.github.io/cyclotrek-france/`**

---

## 🛠️ Technologies
- **Front-end :** HTML5, Vanilla JavaScript ES6+, CSS3 Modern Glassmorphic UI.
- **Cartographie :** Leaflet.js, OpenStreetMap France, OpenTopoMap, CyclOSM, Esri World Imagery.
- **Calcul d'itinéraires :** Moteur BRouter & OpenRouteService API.
- **Données d'élévation & POI :** API Carto IGN & OpenStreetMap Overpass API.
- **Transports :** API SNCF Open Data & bases multimodales.
- **Iconographie :** Lucide Icons.

---

Licence MIT - Conçu pour les passionnés de cyclotourisme et de bivouac en France.
