# Quick FTP Explorer &mdash; Manuel utilisateur (Français)

Quick FTP Explorer permet de parcourir les serveurs FTP des **sites** de
votre organisation, et d'ouvrir les fichiers qu'ils contiennent &mdash;
enregistrements de caméras, captures, PDF &mdash; directement dans votre
navigateur web. Il fonctionne comme l'Explorateur de fichiers de Windows :
les sites à gauche, les fichiers à droite, les plus récents en tête. Ce
manuel couvre l'utilisation courante et, au
[§8](#8-gérer-les-sites-administrateurs), la gestion des sites réservée aux
administrateurs.

> Vous cherchez l'application Windows d'origine (`.hta`) ? Son manuel se
> trouve dans [`legacy/docs/`](../legacy/docs/user-manual.fr.md).

---

## 1. Présentation

- Parcourez chaque site dans une interface à deux panneaux, comme dans
  l'Explorateur de fichiers : les sites à gauche ; à droite, la liste des
  fichiers avec leur **Nom**, leur **Caméra**, leur **Date** et leur
  **Taille**, les plus récents en tête.
- Triez selon n'importe quelle colonne, et resserrez la liste avec des
  **filtres** : une période (la dernière heure, aujourd'hui, autour d'une
  heure donnée…), une caméra, un type de fichier.
- Sélectionnez plusieurs clips comme dans Windows, et téléchargez-les d'un
  coup, en un seul fichier ZIP.
- Ouvrez les fichiers sans quitter la page : vidéos, images et audio dans
  une visionneuse qui passe d'un clip à l'autre avec **Précédent** et
  **Suivant** ; PDF et texte dans un nouvel onglet. Les autres fichiers
  sont téléchargés.
- Recherchez sites et noms de fichiers au fil de la frappe.
- Envoyez à un collègue le lien d'un dossier ou d'un clip. Le bouton
  **Précédent** du navigateur vous ramène à ce que vous regardiez.
- Rien à installer : tout tourne sur le serveur de votre organisation, et
  vous y accédez par une adresse web.

Quick FTP Explorer est en **lecture seule** : il n'envoie, ne renomme et ne
supprime jamais rien sur les serveurs FTP.

---

## 2. Ce qu'il vous faut

- Un navigateur récent : Chrome, Edge, Firefox ou Safari, sur ordinateur,
  tablette ou téléphone.
- L'**adresse** de votre Quick FTP Explorer, par exemple
  `https://files.example.com`.
- Un **compte** : un identifiant et un mot de passe fournis par un
  administrateur. Les comptes sont personnels ; ne partagez pas le vôtre.

---

## 3. Se connecter et se déconnecter

1. Ouvrez l'adresse dans votre navigateur. Vous arrivez sur la page
   de connexion.
2. Saisissez votre identifiant (majuscules et minuscules sont
   équivalentes) et votre mot de passe, puis cliquez sur **Se connecter**.

Messages possibles sur la page de connexion :

| Message | Signification |
|---|---|
| *Identifiant ou mot de passe incorrect.* | Vérifiez les deux et réessayez. |
| *Trop de tentatives échouées. Patientez 15 minutes, puis réessayez.* | Après 10 échecs, le compte (et l'adresse réseau de votre poste) est bloqué 15 minutes, même avec le bon mot de passe. |
| *Votre session a expiré. Veuillez vous reconnecter.* | Une session dure 12 heures par défaut ; vous avez été déconnecté automatiquement. |

Pour vous déconnecter, cliquez sur **Se déconnecter** à l'extrémité droite
de la barre d'état (sur un téléphone, au pied du panneau **☰**). Fermer
l'onglet ne vous déconnecte pas : sur un poste partagé, déconnectez-vous
toujours.

Votre gestionnaire de mots de passe peut retenir vos identifiants : la
page de connexion est un formulaire standard.

---

## 4. L'interface

```
+----------------------------------------------------------------------------------------------+
| ▣ Quick FTP Explorer  ← → ↑  Tous les sites › 1234 Résidence      ↻  [Rechercher dans 1234…] |  barre du haut
+----------------------+-----------------------------------------------------------------------+
| SITES + Nouveau site | Ouvrir  Télécharger  Copier le lien                                   |  commandes
| [Trouver un site ]   | Trier [Plus récents d'abord ▾]  Période [Toutes les dates ▾]          |
|   Tous les sites     | Caméra [Toutes les caméras (81) ▾]                                    |
|   1234 Résidence     +-----------------------------------------------------------------------+
|   5678 Entrepôt      | [ ] Nom                            Caméra  Date ↓            Taille   |  la liste
| ▸ 9012 Dépôt         | Aujourd'hui — dimanche 1 novembre 2026 · 12 éléments                  |
|                      |     1234_Cam 2_202611011615.avi    Cam 2   01/11/2026 16:15  2,0 Ko   |
|                      |     1234_Cam 1_202611011558.avi    Cam 1   01/11/2026 15:58  1,9 Ko   |
|                      |     1234_Cam 2_202611011541.avi    Cam 2   01/11/2026 15:41  2,0 Ko   |
|                      | …                                                                     |
+----------------------------------------------------------------------------------------------+
| 81 éléments · Mis à jour à 16:20   Connecté en tant que alice  Aide  English  Se déconnecter |  barre d'état
+----------------------------------------------------------------------------------------------+
```

L'interface suit la langue de votre navigateur : français, ou anglais.
Pour en changer, cliquez sur **English** dans la barre d'état (sur un
téléphone, au pied du panneau **☰**) ou sur la page de connexion ; le
choix est retenu sur ce navigateur. Ce manuel cite les libellés français.

Perdu ? Appuyez sur `?`, ou cliquez sur **Aide** dans la barre d'état :
vous y trouverez trois conseils pour trouver un clip, et les raccourcis
clavier.

### 4.1 Barre du haut

- **← → ↑** &mdash; **Précédent**, **Suivant** et **Monter**, comme dans
  l'Explorateur. Précédent et Suivant parcourent les endroits visités dans
  cet onglet. Précédent ne quitte jamais Quick FTP Explorer, et Suivant est
  grisé quand il n'y a rien après. Monter ouvre le dossier parent, ou
  **Tous les sites** depuis un site, et sélectionne le dossier ou le site
  d'où vous venez. Les touches de Windows fonctionnent : `Alt+←`, `Alt+→`,
  `Alt+↑`, et `Retour arrière` pour Précédent.
- **Fil d'Ariane** &mdash; où vous êtes : **Tous les sites**, puis le site,
  puis chaque dossier. Chaque élément sauf le dernier est un lien :
  cliquez dessus pour y aller, faites `Ctrl`+clic ou un clic du milieu pour
  l'ouvrir dans un nouvel onglet, ou un clic droit pour copier son adresse.
- **↻** (Actualiser ce dossier) &mdash; recharge le dossier ouvert depuis
  le serveur. La liste reste affichée pendant le rechargement, avec votre
  sélection et votre position ; les fichiers apparus entre-temps sont
  marqués **Nouveau** ([§5.3](#53-nouveaux-fichiers)). Si l'actualisation
  échoue, la liste reste telle quelle et une ligne au-dessus en donne la
  raison, avec **Réessayer**.
- **Recherche** &mdash; `Ctrl+F` ou `F3` vous place dans le champ ; voir le
  [§7.1](#71-la-recherche).

### 4.2 Panneau des sites

Le panneau de gauche commence par **Tous les sites**, puis liste chaque
site, marqué d'une icône de caméra. Sous un site, l'arborescence n'affiche
**que les dossiers** ; les fichiers apparaissent à droite.

- **Cliquez sur une ligne** pour afficher son contenu à droite ; le site ou
  le dossier s'ouvre aussi dans l'arborescence.
- **Cliquez sur le chevron** (▸) pour ouvrir ou refermer un dossier dans
  l'arborescence sans changer ce qu'affiche le panneau de droite. Quand un
  site ou un dossier se révèle sans sous-dossier, son chevron disparaît.
  Pendant un chargement, une petite roue prend la place du chevron. Les
  erreurs s'affichent en rouge sous le dossier ; cliquez à nouveau dessus
  pour réessayer.
- **Trouver un site** &mdash; tapez une partie du nom d'un site : seuls
  restent les sites qui contiennent tous les mots tapés, surlignés
  (majuscules et accents n'ont pas d'importance). `Entrée` ouvre le premier
  site trouvé, `↓` descend dans l'arborescence, `Échap` vide le champ.
  **Tous les sites** et le site ouvert restent toujours affichés.
- **Au clavier**, l'arborescence ne compte que pour un arrêt de la touche
  `Tab`. `↑` et `↓` déplacent, `→` déplie une branche ou y entre, `←` la
  replie ou remonte au parent, `Origine` et `Fin` vont aux extrémités, et
  `Entrée` ou `Espace` affiche l'élément à droite. Taper les premières
  lettres ou les premiers chiffres d'un nom y mène directement. Les flèches
  n'ouvrent jamais rien d'elles-mêmes : chaque ouverture demande une liste
  au serveur FTP.

La fine bordure entre les deux panneaux les redimensionne : faites-la
glisser, ou cliquez dessus (chaque clic passe à l'une de trois largeurs),
ou atteignez-la avec `Tab` et utilisez `←` et `→` (avec `Maj`, par grands
pas), `Origine`, `Fin`, ou `Entrée` pour la largeur habituelle. Le
navigateur retient la largeur.

### 4.3 La liste

Sans site ouvert, le panneau de droite liste **Tous les sites**, par ordre
alphabétique : double-cliquez sur l'un d'eux, ou appuyez sur `Entrée`, pour
l'ouvrir. Dans un site, il liste le dossier ouvert : ses dossiers d'abord,
puis ses fichiers.

**Colonnes.**

| Colonne | Contenu |
|---|---|
| **Nom** | Le nom du fichier, du dossier ou du site. |
| **Caméra** | La caméra, lue dans le nom du clip. La colonne apparaît dès qu'un nom indique une caméra. |
| **Date** | L'heure d'enregistrement du clip, lue dans son nom ; à défaut, la date de dernière modification du fichier selon le serveur FTP. |
| **Taille** | La taille du fichier. |

**D'où vient la date.** Les enregistreurs nomment leurs clips d'après la
caméra et l'heure, par exemple `1234_Cam 1_202611011558.avi` : site `1234`,
caméra `Cam 1`, enregistré le 1er novembre 2026 à 15 h 58. Quick FTP
Explorer lit les noms de la forme *site_caméra_heure* ou *caméra_heure*, où
l'heure s'écrit `AAAAMMJJhhmm`, `AAAAMMJJhhmmss` (avec les secondes), ou en
temps Unix (10 chiffres). Quand un nom ne donne pas d'heure, la date est
celle que le serveur FTP indique pour le fichier. Les dates s'affichent à
l'heure locale de votre ordinateur, comme Windows les présente :
`01/11/2026 15:58`, avec les secondes seulement quand le nom les donne.
Survolez une date pour voir d'où elle vient, ainsi que l'heure du serveur
FTP. Une date que le serveur n'a pas donnée sous une forme lisible
s'affiche telle qu'il l'a écrite, en grisé.

**Tri.** La liste commence par les **fichiers les plus récents**. Cliquez
sur un en-tête de colonne pour trier selon elle : le premier clic met en
tête les dates les plus récentes et les tailles les plus grandes, et range
noms et caméras de A à Z ; un second clic inverse l'ordre. La liste
**Trier** de la barre de commandes fait de même, en toutes lettres
([§4.4](#44-barre-de-commandes)). Les dossiers restent toujours au-dessus
des fichiers, et les fichiers sans date vont à la fin. Le navigateur retient
votre choix ; Tous les sites est toujours trié par nom (cliquez sur **Nom**
pour inverser l'ordre).

**Titres par jour.** Triée par date, la liste est découpée par jour :
*Aujourd'hui — dimanche 1 novembre 2026 · 12 éléments*, *Hier — …*, puis
un titre par jour plus ancien, et *Date inconnue* pour les fichiers sans
date. Pendant le défilement, le titre du jour affiché reste en haut.

**Sélectionner.** Comme dans l'Explorateur de fichiers, un clic
**sélectionne** et un **double-clic ouvre** :

- cliquez sur une ligne pour la sélectionner seule ; `Ctrl`+clic ajoute ou
  retire une ligne ; `Maj`+clic sélectionne toutes les lignes depuis la
  dernière cliquée jusqu'à celle-ci (`Ctrl+Maj`+clic les ajoute à la
  sélection) ;
- la case à cocher au début de la ligne d'un fichier l'ajoute ou la
  retire, sans toucher aux autres. Les cases apparaissent au survol d'une
  ligne, et sur toutes les lignes dès que quelque chose est sélectionné. La
  case de l'en-tête sélectionne tous les fichiers affichés, ou aucun ;
- `Ctrl+A` sélectionne tous les fichiers affichés (pas les dossiers) ;
- cliquez dans l'espace vide sous les lignes, ou appuyez sur `Échap`, pour
  tout désélectionner.

Les lignes sélectionnées sont teintées, avec une barre à gauche et une
coche dans leur case. La barre d'état les compte et additionne leur taille
([§4.5](#45-barre-détat)). Changer le tri ou un filtre, ou actualiser,
garde la sélection (les fichiers qu'un filtre masque en sortent) ; ouvrir
un autre dossier la vide.

**Ouvrir.** Double-cliquez sur une ligne, ou sélectionnez-la et appuyez sur
`Entrée` ou cliquez sur **Ouvrir**. Un dossier ou un site s'ouvre à
droite ; un fichier s'ouvre comme décrit au [§6](#6-ouvrir-des-fichiers).
Sur un écran tactile, il suffit de toucher la ligne. Tant que vous n'avez
rien ouvert de cette façon, la barre d'état vous le rappelle :
*Double-cliquez (ou appuyez sur Entrée) pour ouvrir.*

**Au clavier**, la liste ne compte que pour un arrêt de la touche `Tab` ;
le bouton **Aller à la liste des fichiers**, premier arrêt de la page, y
mène directement. Ensuite :

- `↑`, `↓`, `Origine`, `Fin`, `Pg. préc.` et `Pg. suiv.` déplacent et
  sélectionnent ;
- avec `Maj`, ils étendent la sélection ; avec `Ctrl`, ils déplacent sans
  la changer ;
- `Espace` sélectionne ou désélectionne la ligne courante ;
- `Entrée` l'ouvre, et `Maj+F10` ou la touche Menu ouvre son menu
  ([§4.6](#46-menus-du-clic-droit)).

Dans Tous les sites, taper les premières lettres d'un site y mène
directement.

Si un dossier ne peut pas être listé, la raison s'affiche avec un bouton
**Réessayer**. Un dossier vide affiche *(dossier vide)*.

### 4.4 Barre de commandes

Au-dessus de la liste, dans un dossier et dans les résultats de recherche :

- **Ouvrir** &mdash; ouvre l'élément sélectionné. Avec plusieurs fichiers
  sélectionnés, ouvre le premier dans la visionneuse, qui passe ensuite
  d'un fichier sélectionné à l'autre, et à eux seuls.
- **Télécharger** &mdash; télécharge le fichier sélectionné. Avec
  plusieurs fichiers sélectionnés, le bouton devient **Télécharger (3)** et
  les télécharge en un seul fichier ZIP
  ([§6.4](#64-télécharger-plusieurs-fichiers-en-un-zip)). Les dossiers de la
  sélection sont ignorés.
- **Copier le lien** &mdash; copie le lien de l'élément sélectionné, ou du
  dossier ouvert si rien n'est sélectionné. Avec plusieurs éléments, le
  bouton devient **Copier les liens** et donne un lien par ligne
  ([§5.1](#51-liens-favoris-et-bouton-précédent)).
- **Trier** &mdash; l'ordre, en toutes lettres : *Plus récents d'abord*,
  *Plus anciens d'abord*, *Nom (de A à Z)*, *Nom (de Z à A)*,
  *Caméra (de A à Z)* et *Caméra (de Z à A)* (quand il y a une colonne
  Caméra), *Plus volumineux d'abord*, *Moins volumineux d'abord*.
- **Période**, **Caméra** et **Type** &mdash; les filtres
  ([§7.2](#72-les-filtres)). **Effacer les filtres** apparaît dès que l'un
  d'eux est actif.

Les boutons qui ne peuvent pas agir sur la sélection sont grisés, comme
dans l'Explorateur ; survolez un **Télécharger** grisé pour savoir
pourquoi. Dans une fenêtre étroite, la barre passe sur deux lignes. Dans
Tous les sites, il n'y a pas de barre de commandes.

### 4.5 Barre d'état

À gauche :

- le nombre d'éléments : *81 éléments*, ou *12 éléments sur 81* quand des
  filtres en masquent ; *128 résultats* (ou *12 résultats sur 128*)
  pendant une recherche ; *3 sites* dans Tous les sites ;
- la sélection : *3 éléments sélectionnés (5,8 Ko)*, la taille additionnant
  les fichiers sélectionnés ;
- *Mis à jour à 16:20* : l'heure à laquelle la liste affichée a été lue sur
  le serveur FTP ;
- le rappel sur la façon d'ouvrir, tant que vous n'avez rien ouvert.

À droite : le compte connecté (et s'il est administrateur), **Aide**,
**English** pour passer l'interface en anglais, et **Se déconnecter**. Sur
un téléphone, la barre d'état est masquée, et ces éléments passent au pied
du panneau **☰**.

### 4.6 Menus du clic droit

Faites un clic droit sur n'importe quel élément de la liste ou du panneau
des sites pour voir ses commandes. Au clavier, appuyez sur `Maj+F10` ou
sur la touche Menu sur la ligne ou l'élément courant ; `↑` et `↓`
choisissent, `Entrée` lance la commande et `Échap` ferme le menu. Un clic
droit sur une ligne non sélectionnée la sélectionne d'abord ; sur une
ligne sélectionnée, le menu agit sur toute la sélection.

| Clic droit sur | Commandes |
|---|---|
| Un fichier | **Ouvrir**, **Télécharger** (ou **Télécharger (n)**), **Copier le lien**, **Ouvrir l'emplacement du fichier** (dans les résultats de recherche), **Tout sélectionner** |
| Un dossier ou un site, dans la liste | **Ouvrir**, **Ouvrir dans un nouvel onglet**, **Copier le lien** |
| Un site ou un dossier, dans le panneau des sites | **Ouvrir**, **Ouvrir dans un nouvel onglet** |
| **Tous les sites**, dans le panneau des sites | **Ouvrir** |
| La partie vide de la liste | **Actualiser ce dossier**, **Tout sélectionner** |

Les administrateurs trouvent aussi **Modifier le site…** et **Supprimer le
site** sur les sites, et **Nouveau site…** sur la partie vide du panneau
des sites ([§8](#8-gérer-les-sites-administrateurs)). Dans la liste, un
clic du milieu sur un dossier ou un site l'ouvre dans un nouvel onglet. Les
liens, comme ceux du fil d'Ariane, et les champs de saisie gardent le menu
du navigateur.

---

## 5. Parcourir

1. Quick FTP Explorer s'ouvre sur **Tous les sites**, qui liste chaque
   site. Double-cliquez sur l'un d'eux, ou cliquez dessus dans le panneau
   des sites.
2. Déplacez-vous en double-cliquant sur les dossiers de la liste, en
   cliquant dessus dans l'arborescence, ou avec le fil d'Ariane ; **↑**
   remonte d'un niveau.
3. Cliquez sur **↻** lorsque vous attendez de nouveaux fichiers &mdash; ou
   laissez Quick FTP Explorer vous prévenir ([§5.3](#53-nouveaux-fichiers)).

Chaque dossier est chargé une fois puis mémorisé tant que la page reste
ouverte : revenir en arrière est donc instantané. Si vous revenez dans un
dossier plus d'une minute après son chargement, il s'affiche aussitôt et se
recharge discrètement en arrière-plan. La première fois, le serveur se
connecte au serveur FTP pour vous ; avec un serveur lent, un petit
indicateur *Chargement du dossier…* apparaît en bas à droite.

### 5.1 Liens, favoris et bouton Précédent

La barre d'adresse indique toujours où vous êtes, par exemple
`https://files.example.com/#/1234/Cameras`. Ainsi :

- vous pouvez **mettre un dossier en favori**, ou **envoyer son adresse**
  à un collègue : elle ouvre ce dossier pour toute personne pouvant se
  connecter (après la page de connexion si nécessaire) ;
- **Copier le lien**, dans la barre de commandes, les menus du clic droit
  et la visionneuse, copie un lien pour vous : vers le fichier ou le
  dossier sélectionné, ou vers le dossier ouvert si rien n'est sélectionné,
  et un lien par ligne pour plusieurs éléments. *Lien copié.* le confirme.
  Sur un téléphone ou une tablette qui sait partager, le bouton devient
  **Partager le lien** et ouvre le menu de partage. Si le navigateur refuse
  la copie, une petite fenêtre affiche le lien, déjà sélectionné : appuyez
  sur `Ctrl+C` ;
- le lien d'un **clip** ouvre son dossier, puis le clip dans la
  visionneuse, par exemple
  `https://files.example.com/#/1234/Cameras?open=1234_Cam%201_202611011558.avi`.
  Si le fichier n'existe plus, le dossier s'ouvre avec *Ce fichier n'est
  plus dans ce dossier.* ;
- les boutons **Précédent** et **Suivant** du navigateur, comme **←** et
  **→**, passent d'un endroit visité à l'autre, et **Précédent ferme
  d'abord la visionneuse** quand elle est ouverte ;
- chaque endroit garde la vue telle que vous l'avez laissée : la
  recherche, les filtres, la sélection et le défilement. Précédent, Suivant
  et le rechargement de la page (`F5`) la font revenir. Aller ailleurs
  repart d'une vue vierge, dans votre ordre de tri habituel.

Un lien vers un site qui n'existe plus, ou que vous ne voyez pas, ouvre
simplement Tous les sites.

### 5.2 Sur un téléphone

```
+----------------------------------------------+
| ☰  1234 Résidence                      ⌕   ↻ |  barre du haut
+----------------------------------------------+
| [Plus récents d'abord ▾]  [Filtres (1)]  [✓] |  Trier, Filtres, Sélectionner
| [Aujourd'hui ×]           12 éléments sur 81 |  quand un filtre est actif
+----------------------------------------------+
| Aujourd'hui — dimanche 1 novembre 2026       |
| · 12 éléments                                |
| 1234_Cam 2_202611011615.avi                  |  le nom en entier,
|   16:15 · Cam 2 · 2,0 Ko                     |  puis heure · caméra · taille
| 1234_Cam 1_202611011558.avi                  |
|   15:58 · Cam 1 · 1,9 Ko                     |
+----------------------------------------------+
```

Sur les écrans étroits (700 pixels de large ou moins, soit la plupart des
téléphones) :

- **La barre du haut** contient **☰**, qui ouvre le panneau des sites, le
  nom de l'endroit où vous êtes, **⌕**, qui étend le champ de recherche sur
  toute la barre (**←** le referme et efface la recherche), et **↻**. Il
  n'y a pas de boutons **← → ↑** : utilisez le geste Retour du téléphone,
  qui ferme aussi la visionneuse.
- **Le panneau des sites** glisse depuis la gauche, avec **Trouver un
  site** en haut. Touchez un site ou un dossier et le panneau se referme de
  lui-même ; touchez à côté pour le fermer. Son pied affiche le compte
  connecté, **Aide**, **English** et **Se déconnecter**.
- **Le tri et les filtres** se trouvent sous la barre du haut : la liste
  **Trier** et **Filtres**, qui ouvre un panneau par le bas avec Période,
  Caméra et Type. Les changements s'appliquent aussitôt ; **Afficher
  12 éléments** referme le panneau. Quand un filtre est actif, le bouton
  devient **Filtres (1)**, et une ligne d'étiquettes nomme chaque filtre,
  avec le décompte : touchez une étiquette pour retirer son filtre.
- **La liste** affiche chaque nom en entier, puis une ligne avec la date,
  la caméra et la taille (l'heure seule sous un titre de jour). Il suffit
  de toucher un fichier ou un dossier pour l'ouvrir.
- **Sélectionner** : touchez **✓** (**Sélectionner**) pour afficher une
  case à cocher sur chaque fichier. Toucher un fichier le coche alors au
  lieu de l'ouvrir, et une barre en bas indique combien sont sélectionnés,
  avec **Tout sélectionner**, un bouton de lien et un bouton
  **Télécharger** (un seul ZIP pour plusieurs fichiers). **×**, `Échap`,
  quitter le dossier ou décocher le dernier fichier met fin au mode
  sélection.
- **La visionneuse** garde **×** (Fermer) et la légende en haut, et place
  **Précédent**, la position, **Suivant**, le lien et **Télécharger** dans
  une barre en bas, à portée du pouce.

La barre d'état est masquée sur téléphone.

### 5.3 Nouveaux fichiers

Tant qu'un dossier est ouvert, Quick FTP Explorer y cherche de nouveaux
fichiers chaque minute, à condition que l'onglet soit visible, que vous
ayez utilisé la page dans la dernière demi-heure, et qu'aucune recherche,
aucune visionneuse, aucun menu ni aucune fenêtre ne soit ouvert. Il
n'insère jamais de lignes sous votre pointeur : une ligne discrète au-dessus
de la liste indique *2 nouveaux fichiers · Afficher*. Cliquez sur
**Afficher** pour les placer dans la liste, à leur rang, marqués
**Nouveau** pendant 10 minutes ou jusqu'à ce que vous les ouvriez ; votre
sélection et votre position dans la liste ne bougent pas. Les fichiers
disparus du serveur quittent la liste au même moment, ou d'eux-mêmes si
rien de nouveau n'est arrivé. **↻** marque les nouveaux fichiers de la même
façon.

Quand vous revenez sur l'onglet après plus d'une minute d'absence, la
vérification a lieu aussitôt.

---

## 6. Ouvrir des fichiers

Double-cliquez sur un fichier, ou sélectionnez-le et appuyez sur `Entrée`
ou cliquez sur **Ouvrir** ; sur un écran tactile, touchez-le. Ce qui se
passe dépend de son type :

| Type | Exemples | Résultat |
|---|---|---|
| Images | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.bmp` | La visionneuse ([§6.1](#61-la-visionneuse)), avec zoom ([§6.3](#63-images)) |
| Vidéo | `.mp4` `.m4v` `.webm` `.mov` `.avi` `.mkv` `.dav` `.264` | La visionneuse, avec avance rapide ([§6.2](#62-vidéo-et-audio)) |
| Audio | `.mp3` `.wav` `.ogg` `.m4a` `.aac` `.flac` | La visionneuse |
| PDF et texte | `.pdf` `.txt` `.log` | S'ouvre dans un nouvel onglet |
| Tout le reste | `.docx` `.xlsx` `.zip` `.html` `.svg`… | Téléchargé dans votre dossier Téléchargements |

Les fichiers transitent du serveur FTP jusqu'à vous via Quick FTP
Explorer et ne sont pas conservés sur le serveur. Seule exception : une
vidéo à convertir reste quelques minutes dans la mémoire du serveur, pour
que la relire ou s'y déplacer soit rapide.

### 6.1 La visionneuse

Les vidéos, les images et l'audio s'ouvrent dans une visionneuse
par-dessus la page. Sa légende donne la caméra et l'heure du clip, par
exemple *Cam 1 · 01/11/2026 15:58*, avec le nom du fichier en dessous (et,
pour un résultat de recherche, l'endroit où il se trouve).

- **Précédent** et **Suivant** parcourent la liste telle que vous la
  voyez : dans son ordre, avec ses filtres, ou parmi les résultats de
  recherche. *3 sur 160* indique où vous en êtes. Si plusieurs fichiers
  sont sélectionnés et que vous ouvrez l'un d'eux, la visionneuse ne
  parcourt que les fichiers sélectionnés. Seuls les vidéos, les images et
  l'audio sont concernés, et la liste ne boucle pas : Précédent s'arrête au
  premier fichier, Suivant au dernier.
- **Lecture enchaînée** (pour les vidéos) : cochez-la, et le clip suivant
  démarre une seconde après la fin du précédent ; une touche ou un clic
  pendant cette seconde l'annule. Le navigateur retient ce choix. Pour
  revoir une nuit dans l'ordre, triez par *Plus anciens d'abord* avant
  d'ouvrir le premier clip.
- **Copier le lien** copie le lien du clip affiché
  ([§5.1](#51-liens-favoris-et-bouton-précédent)) ; **Télécharger**
  l'enregistre.
- **Fermer**, `Échap` ou le bouton **Précédent** du navigateur ferme la
  visionneuse. Le dernier clip regardé est alors sélectionné dans la liste.

Touches : `←` et `→`, ou `Pg. préc.` et `Pg. suiv.`, passent au clip
précédent ou suivant ; `Origine` et `Fin` vont au premier et au dernier.
Quand le lecteur vidéo lui-même a le focus, `←` et `→` se déplacent dans la
vidéo, tandis que `Pg. préc.` et `Pg. suiv.` changent toujours de clip.
`Espace` lance la lecture ou la met en pause.

Chaque changement arrête le clip précédent, et son téléchargement avec
lui ; rien n'est chargé à l'avance. Un clip illisible en donne la raison,
et Précédent et Suivant continuent de fonctionner.

### 6.2 Vidéo et audio

Les vidéos sont lues par le lecteur du navigateur : lecture, pause,
volume, plein écran et **déplacement dans la vidéo** &mdash; vous pouvez
sauter n'importe où dans un long enregistrement sans le télécharger
d'abord.

Beaucoup de caméras enregistrent dans des formats que les navigateurs ne
savent pas lire, comme le XviD (MPEG-4) dans des fichiers `.avi`. Quick
FTP Explorer les convertit sur le serveur à l'ouverture : *Chargement…*
ou *Conversion de la vidéo pour ce navigateur…* s'affiche un instant,
puis la vidéo se lit comme les autres.

Quelques vidéos restent illisibles dans le navigateur : un fichier
endommagé, ou une vidéo plus grosse que la limite de conversion du serveur
(50 Mo, sauf réglage contraire de votre administrateur). La visionneuse en
donne la raison et propose **Le télécharger** ;
ouvrez le fichier téléchargé avec votre lecteur habituel (VLC, le lecteur
du fabricant de l'enregistreur…).

### 6.3 Images

Une image s'affiche d'abord en entier dans la fenêtre.

- **Ajuster** &mdash; l'image entière tient dans la fenêtre (par
  défaut).
- **100%** &mdash; taille réelle.
- **− / +** &mdash; zoom arrière / avant. La **molette** zoome aussi.
- **Faites glisser** l'image pour vous déplacer lorsqu'elle dépasse de la
  fenêtre.

### 6.4 Télécharger plusieurs fichiers en un ZIP

Sélectionnez de 2 à 200 fichiers d'un même site et cliquez sur
**Télécharger (n)** (ou passez par le menu du clic droit, ou par la barre
de sélection sur un téléphone) : ils arrivent en **un seul fichier ZIP**,
sans que le navigateur s'inquiète de téléchargements multiples.
*Préparation du téléchargement…* s'affiche un instant, puis la liste des
téléchargements du navigateur montre la progression.

- L'archive porte le nom du site et l'heure du téléchargement, par exemple
  `1234 Résidence 2026-11-01 16-20.zip`.
- Les fichiers y sont rangés tels quels (les clips de caméra ne se
  compressent pas), chacun daté de l'heure d'enregistrement lue dans son
  nom. Deux fichiers de même nom, venus de dossiers différents, deviennent
  `clip.avi` et `clip (2).avi`.
- Limites : 200 fichiers par archive, tous du même site, et 2 Go en tout.
  Au-delà de 200 fichiers, ou avec des fichiers de plusieurs sites (dans
  les résultats de recherche), **Télécharger** est grisé ; survolez-le pour
  savoir pourquoi.
- Si un fichier ne peut pas être récupéré, ou s'interrompt en route,
  l'archive s'ouvre quand même : son dernier fichier, **ERREURS.txt**
  (**ERRORS.txt** quand l'interface est en anglais), liste chaque fichier
  manquant ou incomplet, avec la raison. Les fichiers laissés de côté parce
  que l'archive a atteint 2 Go y figurent aussi.

### 6.5 Pourquoi certains fichiers sont toujours téléchargés

Les pages web (`.html`), les images vectorielles (`.svg`) et d'autres
fichiers semblables peuvent contenir du code. Si le navigateur les
affichait dans Quick FTP Explorer, ce code s'exécuterait avec votre
session. Ils sont donc toujours **téléchargés**, jamais affichés &mdash;
même si un `.svg`, par exemple, est une image.

### 6.6 Si l'onglet du PDF ne s'ouvre pas

Certains navigateurs bloquent les onglets ouverts par une page. Si
l'ouverture d'un PDF ne fait rien, autorisez les fenêtres pop-up pour
l'adresse de Quick FTP Explorer.

---

## 7. Rechercher et filtrer

La recherche trouve des fichiers par leur nom ; les filtres resserrent une
liste par date, caméra et type. Les deux se combinent.

### 7.1 La recherche

Tapez dans le champ de recherche de la barre du haut (`Ctrl+F` ou `F3` y
mène ; sur un téléphone, touchez **⌕**) pour trouver des **fichiers et des
dossiers** par leur nom :

- Si un dossier est ouvert, la recherche porte sur ce dossier **et tous
  ses sous-dossiers**. Le champ indique où, par exemple *Rechercher dans
  1234 Résidence*.
- Dans Tous les sites, elle porte sur **tous les sites**, et les sites
  correspondants apparaissent en premier.

Les résultats s'affichent dans la liste au fil de la frappe, avec les mêmes
colonnes, le dossier de chacun sous son nom, et la partie trouvée surlignée.
Ils suivent l'ordre de tri et les filtres : avec *Aujourd'hui* choisi, une
recherche de `garage` trouve les clips du jour dont le nom contient
« garage », les plus récents en tête. Ouvrez-les comme n'importe quel
fichier ; la visionneuse passe alors d'un résultat à l'autre. Faites un
clic droit sur l'un d'eux et choisissez **Ouvrir l'emplacement du fichier**
pour aller dans son dossier, le fichier sélectionné. **Rechercher dans tous
les sites** étend la recherche à tous les sites.

- Les majuscules et les accents n'ont pas d'importance : `ete` trouve
  `Été`.
- Plusieurs mots doivent tous être présents, dans n'importe quel ordre :
  `garage 0830` trouve `1234_Garage 1_202610300830.avi`.
- `Entrée` lance la recherche aussitôt ; `↓` va au premier résultat.
- Videz le champ avec **×** ou `Échap` pour revenir au dossier.

Aller dans un autre dossier met fin à la recherche. Appuyer de nouveau sur
`Ctrl+F` dans le champ ouvre la recherche propre au navigateur.

La première recherche dans un endroit lit ses dossiers sur le serveur, ce
qui peut prendre quelques secondes sur un gros site ; ensuite, elle est
instantanée. Une recherche lit au plus 300 dossiers : pour chercher plus
profond, ouvrez d'abord un sous-dossier. Au plus 500 résultats sont
affichés : les 500 premiers dans l'ordre courant, donc les 500 plus récents
quand la liste est triée par les plus récents d'abord. Ajoutez des mots
pour affiner la recherche.

### 7.2 Les filtres

Les filtres de la barre de commandes resserrent la liste d'un dossier, ou
les résultats de recherche. Sur un téléphone, ils se trouvent dans le
panneau **Filtres** ([§5.2](#52-sur-un-téléphone)).

- **Période** :
  - *Toutes les dates* : aucun filtre ;
  - *Dernière heure* et *24 dernières heures* ;
  - *Aujourd'hui*, depuis minuit, et *Hier*, de minuit à minuit ;
  - *7 derniers jours* : aujourd'hui et les six jours précédents ;
  - *Autour d'une heure…* affiche **Heure** et **Écart**, et garde les
    fichiers situés à 5, 15, 30 ou 60 minutes de part et d'autre de cette
    heure (15 au départ). **Heure** part de la minute en cours : tapez
    l'heure de l'alarme à vérifier ;
  - *Plage personnalisée…* affiche **Du** et **Au**, préremplis avec la
    dernière heure. L'un ou l'autre peut rester vide, sans limite de ce
    côté ; la minute tapée dans **Au** est incluse, et les deux peuvent
    être donnés dans n'importe quel ordre.

  La période s'appuie sur la colonne **Date**. Les périodes récentes n'ont
  pas de fin, si bien qu'un clip venant d'une caméra dont l'horloge avance
  un peu reste visible. Les fichiers sans date sont masqués dès qu'une
  période est choisie.
- **Caméra** : *Toutes les caméras (81)*, puis chaque caméra avec son
  nombre de fichiers. Ce filtre apparaît quand la liste compte au moins
  deux caméras.
- **Type** : *Tous les types*, *Vidéos*, *Images* et *Autres fichiers*,
  chacun avec son nombre. Ce filtre apparaît quand la liste mêle plusieurs
  sortes de fichiers.

Les nombres entre parenthèses tiennent compte des autres filtres. Les
filtres se combinent : *Aujourd'hui* et *Cam 2* montrent les fichiers de
Cam 2 du jour. Les dossiers ne sont jamais masqués. Un filtre actif a une
bordure marquée, la barre d'état indique *12 éléments sur 81*, et
**Effacer les filtres** les retire tous. Quand les filtres masquent tous
les fichiers, la liste indique *Aucun fichier ne correspond à ces
filtres.*, propose **Effacer les filtres**, et donne la date du fichier le
plus récent.

Les filtres s'appliquent dès que vous les changez, et les périodes comme
*Dernière heure* suivent l'horloge. Ils restent quand vous actualisez,
lancez ou effacez une recherche, et Précédent les fait revenir. **Ouvrir
un autre dossier ou un autre site repart sans filtre**, pour qu'un filtre
oublié ne masque jamais de clips ailleurs ; l'ordre de tri, lui, reste.

---

## 8. Gérer les sites (administrateurs)

Seuls les comptes au rôle **admin** voient **+ Nouveau site** dans le
panneau des sites, et les commandes ci-dessous. Les sites sont partagés :
chaque modification est visible par tous (après rechargement de la page).

### 8.1 Créer un site

Cliquez sur **+ Nouveau site** (ou clic droit dans une partie vide du
panneau des sites → **Nouveau site…**).

| Champ | Remarques |
|---|---|
| **Identifiant** | Le compte FTP. Obligatoire. Il identifie aussi le site : deux sites ne peuvent pas avoir le même identifiant. |
| **Texte du libellé** | Facultatif. Le libellé affiché dans l'arborescence est l'identifiant suivi de ce texte, par exemple `1234 Résidence`. L'aperçu sous le formulaire montre le résultat. |
| **Hôte** et **Port** | Le serveur FTP. Pré-remplis avec les valeurs par défaut de votre organisation. |
| **Mot de passe** | Par défaut, l'identifiant ; il le suit pendant la saisie tant que vous n'avez pas tapé votre propre mot de passe. |

Cliquez sur **Enregistrer**. Les problèmes s'affichent en haut du
formulaire, par exemple *Un site existe déjà pour l'identifiant « … »*
ou *Le champ « Identifiant » contient des caractères de contrôle*.

### 8.2 Modifier un site

Clic droit sur le site, dans le panneau des sites ou dans Tous les sites →
**Modifier le site…**. Sur un écran tactile, utilisez le bouton **⋯** de
la ligne du site ouvert, dans le panneau des sites ; au clavier, appuyez
sur `Maj+F10` sur le site.

- Le champ mot de passe est **vide** : les mots de passe enregistrés ne
  sont jamais envoyés aux navigateurs. Laissez-le vide pour conserver le
  mot de passe actuel.
- **Si vous changez l'hôte ou le port, vous devez ressaisir le mot de
  passe.** Cela empêche quiconque d'envoyer un mot de passe enregistré
  vers un autre serveur.
- Changer l'**identifiant** renomme le site. Si vous le parcouriez,
  l'affichage repart de sa racine.

### 8.3 Supprimer un site

Dans le même menu, choisissez **Supprimer le site**, puis confirmez. Tout
le monde en perd l'accès immédiatement.

---

## 9. Raccourcis clavier

La même liste que dans **Aide** (`?`) :

| Touches | Action |
|---|---|
| `Ctrl+F` ou `F3` | Aller à la recherche |
| Double-clic ou `Entrée` | Ouvrir |
| Flèches, `Origine`, `Fin`, `Pg. préc.`, `Pg. suiv.` | Se déplacer dans la liste ou l'arborescence |
| `Espace`, `Ctrl`+clic, `Maj`+clic | Sélectionner plusieurs fichiers |
| `Maj+F10` ou la touche Menu | Actions sur la sélection |
| `←` / `→`, `Pg. préc.` / `Pg. suiv.` | Clip précédent / suivant dans la visionneuse |
| `Échap` | Fermer ; effacer la sélection, puis la recherche |
| `Alt+←`, `Alt+→`, `Alt+↑`, `Retour arrière` | Précédent, suivant, dossier parent |
| `?` | Cette aide |

En détail :

- **Dans la liste** : les flèches, `Origine`, `Fin`, `Pg. préc.` et
  `Pg. suiv.` déplacent et sélectionnent ; avec `Maj` ils étendent la
  sélection, avec `Ctrl` ils déplacent sans sélectionner. `Espace`
  sélectionne ou désélectionne la ligne, `Ctrl+A` sélectionne tous les
  fichiers affichés, `Entrée` ouvre, et `Échap` efface la sélection, puis
  la recherche. Dans Tous les sites, taper les premières lettres d'un site
  y mène directement.
- **Dans le panneau des sites** : `↑`, `↓`, `Origine` et `Fin` déplacent ;
  `→` déplie une branche ou y entre, `←` la replie ou remonte ; `Entrée`
  ou `Espace` ouvre l'élément à droite ; taper un nom y mène. Dans
  **Trouver un site**, `Entrée` ouvre le premier site trouvé, `↓` descend
  dans l'arborescence et `Échap` vide le champ.
- **Dans le champ de recherche** : `Entrée` lance la recherche aussitôt,
  `↓` va au premier résultat, `Échap` vide le champ. `Ctrl+F` y ouvre la
  recherche propre au navigateur.
- **Dans la visionneuse** : `←` et `→` (quand le lecteur vidéo a le
  focus, ils se déplacent dans la vidéo), `Pg. préc.` et `Pg. suiv.`
  changent de clip ; `Origine` et `Fin` vont au premier et au dernier ;
  `Espace` lance ou met en pause ; `Échap` ferme.
- **Dans un menu** : `↑`, `↓`, `Origine` et `Fin` choisissent ; `Entrée`
  ou `Espace` lance la commande ; `Échap` ou `Tab` ferme.
- **Sur la bordure entre les panneaux** : `←` et `→` redimensionnent (avec
  `Maj`, par grands pas) ; `Origine` et `Fin` donnent la largeur minimale
  et maximale ; `Entrée`, la largeur habituelle.

`Échap` ferme une seule chose à la fois : un menu, la recherche du
téléphone, le panneau des sites, le mode sélection. Les fenêtres comme la
visionneuse ou l'Aide se ferment avec leur propre `Échap`. `Alt+↑`,
`Retour arrière` et `?` ne font rien dans un champ de saisie, où ils
servent à écrire. Les touches du navigateur continuent de fonctionner :
`F5` recharge la page (et ramène la vue), `Alt+←` et `Alt+→` reviennent en
arrière et avancent.

---

## 10. Dépannage

| Message ou symptôme | Que faire |
|---|---|
| *Échec de la connexion au serveur FTP : 530 …* | L'identifiant ou le mot de passe FTP du site est faux, ou le compte a changé sur le serveur FTP. Prévenez un administrateur. |
| *… (pas de nouvel essai pendant 5 min ; un administrateur doit vérifier ce site)* | Après un échec de connexion FTP, le site est mis en pause 5 minutes pour que des tentatives répétées ne fassent pas bloquer le serveur. Il reprend tout seul, ou immédiatement dès qu'un administrateur enregistre le site. |
| *Introuvable, ou accès refusé* | Le dossier ou le fichier a été déplacé ou supprimé, ou le compte FTP n'a pas le droit de le lire. Cliquez sur **↻** dans le dossier parent. |
| *Le serveur FTP est occupé …* | Trop de personnes utilisent ce serveur en même temps. Patientez quelques secondes et réessayez. |
| *Impossible de joindre le serveur FTP* / *n'a pas répondu à temps* / *a mis trop de temps* | Le serveur FTP est arrêté, injoignable ou très lent. Réessayez plus tard ; prévenez un administrateur si cela persiste. |
| *Le serveur est injoignable* | Votre propre connexion à Quick FTP Explorer est coupée. Vérifiez votre réseau. |
| *Actualisation impossible : …* | La liste affichée est celle d'avant. Cliquez sur **Réessayer**. |
| Un clip semble manquer | Regardez la barre d'état : *12 éléments sur 81* signifie que des filtres masquent des fichiers ; cliquez sur **Effacer les filtres** ([§7.2](#72-les-filtres)). Regardez *Mis à jour à* : la liste est peut-être plus ancienne que le clip, cliquez sur **↻**. Dans une recherche, seuls les 500 premiers résultats sont affichés ([§7.1](#71-la-recherche)). |
| Les heures semblent décalées d'une ou deux heures | La date d'un clip vient de son nom, selon l'horloge de l'enregistreur ; à défaut, c'est l'heure du serveur FTP, à l'heure locale de votre ordinateur. Survolez la date pour voir les deux. Si elles diffèrent, l'horloge de l'enregistreur est sans doute fausse. |
| Un clic n'ouvre pas le fichier | Un clic sélectionne. Double-cliquez, appuyez sur `Entrée` ou cliquez sur **Ouvrir** ([§4.3](#43-la-liste)). Sur un téléphone en mode sélection, toucher un fichier le coche : touchez **×** pour en sortir. |
| **Télécharger** est grisé | Survolez-le pour savoir pourquoi : plus de 200 fichiers sont sélectionnés, ou des fichiers de plusieurs sites (dans les résultats de recherche), ou seulement des dossiers. |
| Le ZIP contient **ERREURS.txt** | Des fichiers manquent ou sont incomplets ; ce fichier dit lesquels, et pourquoi. Téléchargez-les de nouveau. |
| *Le téléchargement n'a pas pu être préparé : …* | La raison suit. Réessayez ; prévenez un administrateur si cela persiste. |
| Un téléchargement ZIP échoue dans la liste des téléchargements | Le serveur prépare peut-être déjà deux archives, ou le lien a expiré (il dure 2 minutes). Cliquez de nouveau sur **Télécharger**. |
| *Ce fichier n'est plus dans ce dossier.* | Le clip du lien que vous avez ouvert a été déplacé ou supprimé. |
| **Copier le lien** affiche une petite fenêtre | Votre navigateur a refusé la copie : appuyez sur `Ctrl+C`, puis sur **Fermer**. |
| `Ctrl+F` ouvre la recherche du navigateur | Vous étiez déjà dans le champ de recherche : c'est ainsi qu'on atteint la recherche propre au navigateur. |
| Une vidéo affiche *ne peut pas être lu dans ce navigateur* | Voir le [§6.2](#62-vidéo-et-audio) : téléchargez-la et utilisez un autre lecteur. |
| Un téléchargement échoue dans la liste des téléchargements | En général, l'un des problèmes FTP ci-dessus : réessayez, ou rouvrez le dossier du fichier pour vérifier qu'il existe toujours. |
| L'ouverture d'un PDF ne fait rien | Autorisez les fenêtres pop-up pour le site ([§6.6](#66-si-longlet-du-pdf-ne-souvre-pas)). |
| Vous revenez à la page de connexion | Votre session a expiré ou votre compte a été modifié. Reconnectez-vous. |

---

## 11. Confidentialité et données

- **Mots de passe.** Le mot de passe de votre compte n'est conservé que
  sous forme d'empreinte salée. Les mots de passe FTP sont stockés sur le
  serveur et n'apparaissent jamais dans aucune page.
- **Journal d'audit.** Pour la traçabilité, le serveur enregistre les
  connexions, les modifications de sites, les dossiers et fichiers ouverts
  par chaque utilisateur, et chaque téléchargement ZIP avec les fichiers
  qu'il contenait, avec l'heure et l'adresse réseau. Les vérifications
  automatiques de nouveaux fichiers n'y figurent qu'une fois toutes les
  10 minutes par dossier au plus. Les enregistrements de caméras sont des
  données personnelles ; renseignez-vous auprès de votre administrateur sur
  les règles de conservation de votre organisation.
- **Votre poste.** Les fichiers ouverts ne sont pas conservés dans le cache
  du navigateur. Les fichiers téléchargés arrivent dans votre dossier
  Téléchargements comme n'importe quel téléchargement ; supprimez-les
  quand vous n'en avez plus besoin. Le navigateur retient quatre choix pour
  vous : l'ordre de tri, la largeur du panneau des sites, si vous avez déjà
  vu le rappel sur l'ouverture des fichiers, et la *Lecture enchaînée* ;
  jamais un nom de fichier. Comme pour toute page web, l'historique de
  l'onglet garde les endroits visités, ici avec ce que chacun affichait (la
  recherche, les filtres, la sélection), pour que Précédent puisse y
  revenir.
- **Le serveur** transmet les fichiers du serveur FTP jusqu'à vous sans les
  stocker.

---

## 12. FAQ

**Dois-je installer quelque chose ?**
Non. Un navigateur récent suffit.

**Puis-je l'utiliser sur un téléphone ou une tablette ?**
Oui. Tout fonctionne au toucher, et un simple toucher ouvre. Sur téléphone,
le panneau des sites s'ouvre avec le bouton **☰**
([§5.2](#52-sur-un-téléphone)).

**Pourquoi un clic n'ouvre-t-il pas le fichier ?**
Comme dans l'Explorateur de fichiers, un clic sélectionne, pour que vous
puissiez sélectionner plusieurs fichiers. Double-cliquez, appuyez sur
`Entrée` ou cliquez sur **Ouvrir**. Sur un écran tactile, un toucher
suffit.

**Puis-je télécharger plusieurs clips d'un coup ?**
Oui. Sélectionnez-les (`Ctrl`+clic, `Maj`+clic, les cases à cocher ou
`Ctrl+A`), puis cliquez sur **Télécharger (n)** : vous obtenez un seul
fichier ZIP, jusqu'à 200 fichiers d'un même site
([§6.4](#64-télécharger-plusieurs-fichiers-en-un-zip)).

**Comment revoir les clips d'une nuit ?**
Choisissez *Hier* (ou *Autour d'une heure…*) dans **Période**, triez par
*Plus anciens d'abord*, ouvrez le premier clip, puis cochez **Lecture
enchaînée**, ou avancez avec **Suivant**.

**Puis-je envoyer à un collègue le lien d'un dossier, ou d'un clip ?**
Oui : sélectionnez-le et cliquez sur **Copier le lien**, ou copiez la barre
d'adresse ([§5.1](#51-liens-favoris-et-bouton-précédent)). Le lien d'un clip
l'ouvre dans la visionneuse. Il faut à votre collègue son propre compte
pour l'ouvrir.

**Puis-je envoyer, renommer ou supprimer des fichiers ?**
Non. Quick FTP Explorer est volontairement en lecture seule.

**Comment changer mon mot de passe, ou obtenir un compte pour un collègue ?**
Demandez à un administrateur.

**Pourquoi ne vois-je pas l'adresse du serveur FTP ?**
Seuls les administrateurs en ont besoin. Les autres utilisateurs ne voient
que les libellés des sites.

**Je vois un dossier nommé `latest` (ou similaire) qui s'ouvre comme un fichier.**
Il s'agit probablement d'un lien sur le serveur FTP. Les liens sont
affichés comme des fichiers ; ouvrez directement le dossier vers lequel ils
pointent.
