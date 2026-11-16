# Foule Sonore

Installation interactive : le mouvement d'une foule, filmée par une webcam, devient musique et lumière en temps réel.

Tout tourne dans le navigateur (Chrome recommandé), sans serveur. La caméra sert uniquement à mesurer le mouvement : aucune image n'est affichée, enregistrée ni envoyée.

## Assemblée créative de Genève

Cette version porte la direction artistique de l'Assemblée créative de Genève (Downtown Studio, 19 novembre 2026) : fond noir, titres en capitales étroites, jaune, magenta et vert des affiches, et la Créature de l'affiche, qui incarne la jauge collective.

## Trois modes

- **Scène à trois** (par défaut) : la scène est partagée en trois places, gauche, centre, droite, vues depuis la salle (l'écran fait miroir). Chaque place a sa couleur et son instrument : batterie, piano, violon. Qui se tient dans une place en joue l'instrument ; changer de place, c'est changer d'instrument. Seul, on tire la Créature du sommeil ; à deux, elle ouvre grand les yeux ; il faut jouer à trois pour la réveiller tout à fait.
- **Petit groupe** (1 à 5 personnes) : chaque personne est suivie et devient un instrument, attribué dans l'ordre d'arrivée, qui la suit dans ses déplacements.
- **Foule** : l'espace est découpé en secteurs fixes, chaque secteur joue son instrument. Aucune dépendance.

Dans les deux premiers modes, bouger joue, lever les mains monte dans l'aigu, des gestes rapides accélèrent le rythme, sauter donne un accent. Ils chargent la bibliothèque MediaPipe Pose depuis Internet au premier lancement ; l'analyse se fait ensuite sur l'ordinateur.

Le mode se choisit sur l'écran de démarrage ou dans la régie. Noms, couleurs et instruments des places se changent dans la régie.

## Principe

- **Captation** : flux optique sur une grille 64×36, d'où sont tirées énergie, vitesse, cohérence et pulsation de la foule.
- **Secteurs** : l'espace est découpé en 1 à 6 zones ; chacune joue son propre instrument (batterie, piano, violon, basse, marimba, cloches, congas, chœur), entièrement synthétisé.
- **Jauge collective** : bouger ensemble remplit une jauge qui débloque trois paliers puis un climax où tous les instruments jouent à l'unisson.
- **Visuels** : particules WebGL poussées par le mouvement, teintées par secteur.
- **La Créature** : le dessin d'origine de l'affiche, affiché tel quel au bas de l'écran (`img/creature.jpg`). Seuls ses yeux sont animés : elle dort au repos, ouvre les yeux avec la jauge, regarde la personne qui joue le plus, et la scène rayonne au climax.

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
| `0`–`5` | comportements simulés (`3` = trio), `Espace` saut collectif |

Les réglages sont mémorisés dans le navigateur ; les boutons Exporter / Importer de la régie permettent de les transporter d'une machine à l'autre.

## Crédits

La Créature et son décor sont l'illustration originale de l'affiche de l'Assemblée créative de Genève ; elle appartient à son auteur et à Downtown Studio et n'est pas couverte par la licence du code. `tools/build_creature.py` prépare les images à partir du fichier de l'affiche.

Titres en Anton (SIL Open Font License, voir `fonts/OFL-Anton.txt`).
