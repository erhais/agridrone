# Notes de version — AgriDrone

## 1.2.0 — 2026-07-23

Builds : iOS `buildNumber` 7 · Android `versionCode` 8
Déploiement : App Store (revue) · Play Store production (rollout progressif 20 %)

### Nouveautés (store — « What's new » / « Nouveautés », FR, ≤ 500 car.)

```
• Rapports d'analyse de sol en PDF, consultables directement dans l'application
• Affichage automatique des doses sur la parcelle sélectionnée
• Sélection de parcelle plus rapide, avec recentrage automatique de la carte
• Formulaires engrais et semis simplifiés et plus lisibles
• Fiabilité renforcée : plus d'affichage par erreur des doses d'une autre parcelle
• Messages d'erreur plus clairs et nouvelle icône d'application
```

### Détail technique (interne)

- **Carte** : sélection de parcelle au tap + recentrage auto (analyse, zone, parcelle, rapport) ; affichage automatique des doses (masqué au fort dézoom et en modulation manuelle) ; garde-fou `verifierCoherenceZones` (masque les doses si l'API renvoie les zones d'une autre parcelle).
- **Rapports** : viewer PDF.js intégré (iOS/Android), découpe A3 paysage → 2 pages A4.
- **Formulaires engrais/semis** : normalisation des valeurs sentinelles `-1` (helpers `formulaireUtils`), placeholders descriptifs, item « — Sélectionner — ».
- **Fiabilité** : messages d'erreur orientés utilisateur ; nouvelle icône (teal plein cadre).
- **Qualité** : socle de tests unitaires (233 tests / 26 suites, Jest + RNTL) + CI GitHub Actions (lint + typecheck + tests).
