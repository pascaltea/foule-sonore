# Foule Sonore

Installation interactive : le mouvement d'une foule, filmée par une webcam, devient musique et lumière en temps réel.

Tout tourne dans le navigateur (Chrome recommandé), sans serveur. La caméra sert uniquement à mesurer le mouvement : aucune image n'est affichée, enregistrée ni envoyée.

## Assemblée créative de Genève

Cette version est faite pour l'Assemblée créative de Genève (Downtown Studio, 19 novembre 2026). Elle évoque l'univers des affiches sans les reproduire : fond noir, grain d'encre, une seule couleur à la fois, et un dôme qui se lève au bas de l'écran.

## Trois modes

- **Scène à trois** (par défaut) : la scène est partagée en trois places, gauche, centre, droite, vues depuis la salle (l'écran fait miroir). Chaque place a son instrument : batterie, piano, violon. On passe librement de l'une à l'autre : l'ancien instrument se tait aussitôt, le nouveau prend le relais. Seul, on fait affleurer le dôme ; à deux, il monte ; il faut jouer à trois pour qu'il s'éveille tout à fait.
- **Petit groupe** (1 à 5 personnes) : chaque personne est suivie et devient un instrument, attribué dans l'ordre d'arrivée, qui la suit dans ses déplacements.
- **Foule** : l'espace est découpé en secteurs fixes, chaque secteur joue son instrument. Aucune dépendance.

Dans les deux premiers modes, bouger joue, lever les mains monte dans l'aigu, des gestes rapides accélèrent le rythme, sauter donne un accent. Ils chargent la bibliothèque MediaPipe Pose depuis Internet au premier lancement ; l'analyse se fait ensuite sur l'ordinateur.

Le mode se choisit sur l'écran de démarrage ou dans la régie. Noms, couleurs et instruments des places se changent dans la régie.

## Six voyages

Une configuration (un « voyage ») règle d'un coup les trois instruments, la gamme, la tonalité et la plage de tempo. Les trios sont pensés pour sonner ensemble dès la première note : rythme à gauche, harmonie au centre, chant à droite. Tous les sons sont synthétisés.

| Voyage | Gauche | Centre | Droite | Gamme |
|---|---|---|---|---|
| Genève | Batterie | Piano | Violon | Pentatonique mineure |
| Mali | Djembé | Balafon | Kora | Pentatonique majeure |
| Inde | Tabla | Sitar | Bansuri | Yaman |
| Japon | Taïko | Koto | Shakuhachi | Hirajoshi |
| Levant | Darbouka | Oud | Ney | Hijaz |
| Caraïbes | Congas | Basse | Steel pan | Majeure |

Chaque instrument peut aussi être choisi librement, place par place.

## Jouer

| Geste | Effet |
|---|---|
| Bouger | joue ; plus on bouge, plus il y a de notes |
| Gestes rapides | le rythme se resserre |
| Mains hautes ou basses | registre aigu ou grave |
| Bras ouverts ou serrés | son clair et résonnant, ou feutré |
| Sauter | un accent |
| Changer de place | changer d'instrument |
| Tous les mains en l'air, tenues 2 s | montée, puis grande frappe ; la jauge gagne un cran |
| Tous immobiles d'un coup | silence ; la reprise claque |

Les deux derniers gestes demandent d'être au moins deux. Des consignes discrètes s'affichent à l'écran pendant la session.

## Session et régie

Une session démarre au premier mouvement et dure 5 minutes par défaut (réglable, ou libre). La dernière demi-minute monte plus vite, puis un accord final s'éteint et l'écran invite les suivants.

La régie se pilote de deux façons :

- **Sur l'ordinateur** : touche `G`, elle s'ouvre dans une autre fenêtre du même navigateur (régie sur l'écran de l'ordinateur, scène projetée). Aucun réseau nécessaire.
- **Sur un téléphone** : dans les réglages (`H`), cocher « Régie sur téléphone » et scanner le code QR. Le téléphone peut être sur n'importe quel réseau ; la scène et lui passent par deux relais de messagerie publics (`js/relay.js`), il faut donc Internet des deux côtés. Qui a le code pilote la scène : ne pas le projeter. « Nouveau code » coupe les téléphones déjà reliés. Seuls des ordres de régie et l'état de la scène transitent, jamais d'image ni de son.

Elle change de voyage en direct (touches `1` à `6` au clavier), choisit les instruments, règle volumes, durée et sensibilité, lance le final.

## Principe

- **Captation** : flux optique sur une grille 64×36, d'où sont tirées énergie, vitesse, cohérence et pulsation de la foule.
- **Secteurs** : l'espace est découpé en 1 à 6 zones ; chacune joue son propre instrument (batterie, piano, violon, basse, marimba, cloches, congas, chœur), entièrement synthétisé.
- **Jauge collective** : bouger ensemble remplit une jauge qui débloque trois paliers puis un climax où tous les instruments jouent à l'unisson.
- **Visuels** : particules WebGL poussées par le mouvement, teintées par secteur.
- **Le dôme et la lumière** : le dôme incarne la jauge collective. La couleur de la scène suit trois temps, un par affiche : le vert de la nuit, le bleu du lac, l'orange du matin. Deux lueurs s'ouvrent à la base du dôme quand les trois places jouent ensemble.

## Lancer en local

```bash
python3 -m http.server 8765
```

Puis ouvrir `http://localhost:8765` dans Chrome.

## Raccourcis

| Touche | Action |
|---|---|
| `H` | afficher / masquer les réglages |
| `G` | ouvrir la régie dans une autre fenêtre |
| `D` | debug et éditeur de secteurs |
| `F` | plein écran |
| `S` | mode simulation (sans caméra) |
| `R` | recalibrer (10 s, champ vide) |
| `0`–`7` | comportements simulés (`3` trio, `6` mains en l'air, `7` silence), `Espace` saut collectif |

Les réglages sont mémorisés dans le navigateur ; les boutons Exporter / Importer de la régie permettent de les transporter d'une machine à l'autre.

## Crédits

Titres en Anton (SIL Open Font License, voir `fonts/OFL-Anton.txt`). Bibliothèques embarquées dans `vendor/` : MQTT.js et qrcode-generator (licence MIT).
