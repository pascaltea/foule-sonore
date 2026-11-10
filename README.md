# Foule Sonore

Installation interactive : le mouvement d'une foule, filmée par une webcam, devient musique et lumière en temps réel.

Tout tourne dans le navigateur (Chrome recommandé), sans serveur ni dépendance. La caméra sert uniquement à mesurer le mouvement : aucune image n'est affichée, enregistrée ni envoyée.

## Principe

- **Captation** : flux optique sur une grille 64×36, d'où sont tirées énergie, vitesse, cohérence et pulsation de la foule.
- **Secteurs** : l'espace est découpé en 1 à 6 zones ; chacune joue son propre instrument (batterie, piano, violon, basse, marimba, cloches, congas, chœur), entièrement synthétisé.
- **Jauge collective** : bouger ensemble remplit une jauge qui débloque trois paliers puis un climax où tous les instruments jouent à l'unisson.
- **Visuels** : particules WebGL poussées par le mouvement, teintées par secteur.

## Lancer en local

```bash
python3 -m http.server 8765
```

Puis ouvrir `http://localhost:8765` dans Chrome.

## Raccourcis

| Touche | Action |
|---|---|
| `H` | afficher / masquer la régie |
| `D` | debug et éditeur de secteurs |
| `F` | plein écran |
| `S` | mode simulation (sans caméra) |
| `R` | recalibrer (10 s, champ vide) |
| `0`–`5` | comportements simulés, `Espace` saut collectif |

Les réglages sont mémorisés dans le navigateur ; les boutons Exporter / Importer de la régie permettent de les transporter d'une machine à l'autre.
