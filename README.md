# Creatura

Anciennement « Foule Sonore » : le dépôt, l'adresse du site et les clés techniques gardent ce nom.

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

## Le voyage : Genève déborde sur le monde

Par défaut, chaque session est un voyage, le même pour tous.

- **Le trajet.** Départ de Genève, trois pays d'environ une minute (instruments, gamme et couleur changent), retour à Genève dans la dernière demi-minute. Les pays tournent d'une session à l'autre.
- **Genève déborde.** Quand le trio lève les mains ensemble et tient deux secondes, la lumière verte de Genève inonde l'écran, son grain sort du contour de la créature et une veine verte s'y ajoute.
- **La créature.** Pendant la session, le dôme prend peu à peu la forme de la façon de jouer ensemble, lue selon trois axes jamais nommés à l'écran : tenir ensemble (strates droites, contour net), se faire de la place (une seule masse, lueurs proches), aller vers l'autre (largeur, grain qui déborde). Les sauts donnent des cornes, les silences tenus des respirations noires.
- **Les places.** Trois petits traits sous chaque instrument montrent les places que la personne a déjà tenues.
- **La fin.** La créature se fige dans son aura, avec un numéro, un surnom et un portrait adressé au trio. Un code QR permet à chacun de l'emporter.

### Retrouver les créatures

- **Le lien d'une créature** (`creature.html#code`) contient tout ce qu'il faut pour la redessiner et réécrire son portrait : rien n'est stocké ailleurs, le lien marche pour toujours.
- **La galerie en ligne** (`galerie.html`) les montre toutes, vivantes, avec une recherche par numéro ou surnom. Pendant la soirée, elle se remplit en direct par les relais de messagerie (Internet requis sur l'ordinateur de scène) ; son code QR s'affiche sur l'écran d'attente.
- **Après la soirée**, « Exporter les données » dans les réglages télécharge `galerie.json`. Déposé à la racine du site, il rend la galerie définitive, sans dépendre des relais.
- Les phrases des portraits et les surnoms sont dans `js/portrait.js` (`TEXTS`).

## Six escales

Une escale règle d'un coup les trois instruments, la gamme, la tonalité et la plage de tempo. Les trios sont pensés pour sonner ensemble dès la première note : rythme à gauche, harmonie au centre, chant à droite. Tous les sons sont synthétisés.

| Escale | Gauche | Centre | Droite | Gamme |
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

## Jeu par gestes (par défaut en scène à trois)

Chaque geste joue un son, rejouable à l'identique. La hauteur de la main choisit la note dans la gamme du pays, la vivacité du geste donne la force. Rien ne sonne sans geste : immobilité = silence, et la brume reste en suspens.

| Geste | Rythme (gauche) | Harmonie (centre) | Chant (droite) |
|---|---|---|---|
| Monter un bras | frappes médium tout au long du geste | la mélodie monte avec la main | idem (note tenue qui suit la main au violon et à la flûte) |
| Descendre un bras | frappes graves tout au long du geste | la mélodie descend avec la main | idem |
| Balayer de côté | frappes claires et légères | deux notes ensemble, vers l'aigu à droite, vers le grave à gauche | idem, ou son qui s'élargit |
| Frapper (arrêt net) | accent grave, médium ou clair selon la hauteur | note appuyée | note appuyée |
| Ouvrir les bras | roulement qui éclate | accord égrené | la note bondit à l'octave |
| Refermer les mains | claque sèche | deux notes étouffées | la note se coupe |
| Lever les deux mains | roulement qui accélère | gamme vers l'aigu | note la plus haute, tenue |
| Sauter | grand coup | accord plaqué | trait rapide |

C'est le mouvement des bras qui joue, pas seulement la position d'arrivée : des sons partent tout au long du geste. Le bras gauche joue une octave plus bas que le droit (deux bras, deux voix). « Pousser vers l'avant » existe dans `js/gestes.js` mais n'est pas joué en scène (`settings.gestesOff`).

- **Secours** (réglages `H` ou régie) : décocher « Jeu par gestes » ramène l'ancienne partition guidée par le mouvement ; « Calage sur une pulsation » aligne chaque son sur un temps commun.
- **Atelier** : `atelier.html` permet d'essayer chaque geste seul, avec le geste reconnu affiché.

## Le morceau de chaque session

Le son produit par l'ordinateur (jamais la salle) est enregistré pendant chaque session et gardé dans le navigateur de l'ordinateur de scène, sous le numéro de la créature. Après la soirée : réglages, « Exporter les morceaux », puis déposer les fichiers dans `morceaux/` à la racine du dépôt (`morceaux/12.webm` pour la créature n° 12). La page de la créature affiche alors un lecteur.

## Deux façons de jouer (réglages `H` ou régie)

- **Par gestes** (par défaut) : un geste, un son, voir plus haut. Option « Calage sur une pulsation ».
- **En pulsation** : la personne à la place du rythme (à gauche) mène le tempo par la vitesse de ses gestes, de 60 à 150 battements par minute, avec une seconde d'inertie. Les autres posent plus ou moins de notes selon la quantité de mouvement (une note tous les deux temps, une par temps, croches, doubles croches) et la hauteur de la main choisit la note. Si personne ne tient le rythme, le tempo suit la moyenne de ceux qui bougent. Immobilité : silence.

## Douze pays

Genève, Mali, Inde, Japon, Levant, Caraïbes, Amérique latine (cajón, guitare, flûte de pan), Chine (tanggu, guzheng, erhu), Indonésie (kendang, gamelan, suling, gamme pelog), Irlande (bodhrán, harpe, tin whistle, mode dorien), États-Unis (batterie aux balais, piano électrique, harmonica, gamme blues), Maroc (bendir et qraqeb, guembri, ghaïta, phrygien majeur). Chaque pays applique sa gamme et sa tonalité, à l'écran d'accueil, depuis la régie comme pendant le voyage. Le voyage traverse toujours trois pays, tirés à tour de rôle parmi les onze.

## Fluidité

- **Créature** (touche `M`) : « révélée à la fin » par défaut. Elle se calcule sans être dessinée pendant le jeu et apparaît à la fin avec son code QR. « Visible » la dessine pendant le jeu ; « aucune » supprime créature, code QR et entrée de galerie.
- **Performances** (touche `P`) : images par seconde du rendu et du suivi du corps, temps de suivi par image, sons par seconde, délai estimé entre geste et son.
- En scène à trois, le suivi ne cherche que trois corps. Le mouvement des bras ne déclenche pas plus de dix sons par seconde et par personne.
