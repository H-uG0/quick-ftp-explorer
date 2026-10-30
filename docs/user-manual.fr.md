# Quick FTP Explorer &mdash; Manuel utilisateur (Français)

Quick FTP Explorer permet de parcourir les serveurs FTP que votre
organisation a enregistrés sous forme de **raccourcis**, et d'ouvrir les
fichiers qu'ils contiennent &mdash; enregistrements de caméras, captures,
PDF &mdash; directement dans votre navigateur web. Ce manuel couvre
l'utilisation courante et, au [§8](#8-gérer-les-raccourcis-administrateurs),
la gestion des raccourcis réservée aux administrateurs.

> Vous cherchez l'application Windows d'origine (`.hta`) ? Son manuel se
> trouve dans [`legacy/docs/`](../legacy/docs/user-manual.fr.md).

---

## 1. Présentation

- Parcourez les dossiers de chaque raccourci dans une interface à deux
  panneaux, inspirée de l'Explorateur de fichiers.
- Ouvrez les fichiers sans quitter la page : images dans une visionneuse
  intégrée, vidéo et audio dans le lecteur du navigateur, PDF et texte dans
  un nouvel onglet. Les autres fichiers sont téléchargés.
- Recherchez raccourcis et noms de fichiers au fil de la frappe.
- Rien à installer : tout tourne sur le serveur de votre organisation, et
  vous y accédez par une adresse web.

Quick FTP Explorer est en **lecture seule** : il n'envoie, ne renomme et ne
supprime jamais rien sur les serveurs FTP.

---

## 2. Ce qu'il vous faut

- Un navigateur récent : Chrome, Edge, Firefox ou Safari, sur ordinateur
  ou tablette. Sur un téléphone, tenez-le à l'horizontale (paysage).
- L'**adresse** de votre Quick FTP Explorer, par exemple
  `https://files.example.com`.
- Un **compte** : un identifiant et un mot de passe fournis par un
  administrateur. Les comptes sont personnels ; ne partagez pas le vôtre.

---

## 3. Se connecter et se déconnecter

1. Ouvrez l'adresse dans votre navigateur. Vous arrivez sur la page
   **Sign in** (connexion).
2. Saisissez votre identifiant (majuscules et minuscules sont
   équivalentes) et votre mot de passe, puis cliquez sur **Sign in**.

Messages possibles sur la page de connexion :

| Message | Signification |
|---|---|
| *Wrong username or password.* | Identifiant ou mot de passe incorrect : vérifiez les deux et réessayez. |
| *Too many failed attempts. Wait 15 minutes, then try again.* | Après 10 échecs, le compte (et l'adresse réseau de votre poste) est bloqué 15 minutes, même avec le bon mot de passe. |
| *Your session has expired. Please sign in again.* | Une session dure 12 heures par défaut ; vous avez été déconnecté automatiquement. |

Pour vous déconnecter, cliquez sur **Sign out** à l'extrémité droite de la
barre d'état. Fermer l'onglet ne vous déconnecte pas : sur un poste
partagé, déconnectez-vous toujours.

Votre gestionnaire de mots de passe peut retenir vos identifiants : la
page de connexion est un formulaire standard.

---

## 4. L'interface

```
+----------------------------------------------------------------------+
| ● Quick FTP Explorer | raccourci › dossier › dossier | ↻ | Search... |  barre du haut
+------------------------+---------------------------------------------+
| SHORTCUTS      + New   | Name               Type   Size   Modified   |
| ▾ 🖥 main-nvr Bureau    | 📁 Images          Folder        Apr 01 2026 |
|   ▸ 📁 Images           | 🎬 clip 08h00.mp4  MP4    12 MB  Apr 01 2026 |
|   ▸ 📁 Videos           | 🖼 capture.jpg     JPG    98 KB  Apr 01 2026 |
| ▸ 🖥 back-office        |                                             |
+------------------------+---------------------------------------------+
| 2 shortcuts                       Signed in as alice   Sign out      |  barre d'état
+----------------------------------------------------------------------+
```

L'interface est en anglais ; ce manuel donne entre parenthèses le sens des
libellés.

### 4.1 Barre du haut

- **Fil d'Ariane** &mdash; où vous êtes : le raccourci, puis chaque
  dossier. Cliquez sur n'importe quel élément sauf le dernier pour y
  remonter.
- **↻ Refresh** (actualiser) &mdash; recharge le dossier courant depuis le
  serveur. Le contenu des dossiers est mémorisé tant que la page reste
  ouverte : utilisez ce bouton pour voir les fichiers apparus depuis (de
  nouveaux enregistrements, par exemple).
- **Search** (recherche) &mdash; voir le [§7](#7-recherche).

### 4.2 Panneau de gauche &mdash; raccourcis et dossiers

Chaque raccourci est la racine (🖥) d'une arborescence qui n'affiche **que
les dossiers** ; les fichiers apparaissent à droite.

- **Cliquez sur une ligne** pour afficher son contenu à droite ; le dossier
  s'ouvre aussi dans l'arborescence.
- **Cliquez sur le triangle** (▸ / ▾) pour ouvrir ou refermer un dossier
  dans l'arborescence sans changer ce qu'affiche le panneau de droite.
- Un triangle ◌ indique un dossier en cours de chargement. Les erreurs
  s'affichent en rouge sous le dossier ; cliquez à nouveau dessus pour
  réessayer.

Faites glisser la fine bordure entre les deux panneaux pour les
redimensionner. Le navigateur retient la largeur.

### 4.3 Panneau de droite &mdash; fichiers

Un tableau du dossier courant : **Name** (nom), **Type**, **Size**
(taille), **Modified** (modifié le). Les dossiers d'abord, puis les
fichiers, dans l'ordre naturel (`clip 2` avant `clip 10`).

- **Cliquez sur un dossier** pour y entrer.
- **Cliquez sur un fichier** pour l'ouvrir (voir le [§6](#6-ouvrir-des-fichiers)).
- Au clavier : `Tab` passe d'une ligne à l'autre, `Entrée` ouvre.

Si un dossier ne peut pas être listé, la raison s'affiche avec un bouton
**Retry** (réessayer).

### 4.4 Barre d'état

Le nombre de raccourcis, le compte connecté (et s'il est administrateur),
et **Sign out**.

---

## 5. Parcourir

1. Cliquez sur un raccourci. Ses dossiers apparaissent dans l'arborescence
   et son contenu à droite.
2. Cliquez sur les dossiers &mdash; dans l'arborescence, dans le tableau ou
   dans le fil d'Ariane &mdash; pour vous déplacer.
3. Cliquez sur **↻** lorsque vous attendez de nouveaux fichiers.

Chaque dossier est chargé une fois puis mémorisé jusqu'au rechargement de
la page ou à un clic sur **↻** : revenir en arrière est donc instantané.
La première fois, le serveur se connecte au serveur FTP pour vous ; avec
un serveur lent, un petit indicateur *Loading folder…* apparaît en bas à
droite.

---

## 6. Ouvrir des fichiers

Ce qui se passe au clic dépend du type de fichier :

| Type | Exemples | Résultat |
|---|---|---|
| Images | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.bmp` | Visionneuse d'images intégrée ([§6.1](#61-visionneuse-dimages)) |
| Vidéo | `.mp4` `.m4v` `.webm` `.mov` | Lecteur intégré, avec avance rapide ([§6.2](#62-vidéo-et-audio)) |
| Audio | `.mp3` `.wav` `.ogg` `.m4a` `.aac` `.flac` | Lecteur intégré |
| PDF et texte | `.pdf` `.txt` `.log` | S'ouvre dans un nouvel onglet |
| Tout le reste | `.mkv` `.avi` `.dav` `.264` `.docx` `.xlsx` `.zip` `.html` `.svg`… | Téléchargé dans votre dossier Téléchargements |

Les fichiers transitent du serveur FTP jusqu'à vous via Quick FTP
Explorer ; rien n'est conservé sur le serveur au passage.

### 6.1 Visionneuse d'images

Un fond sombre recouvre la fenêtre.

- **Fit** (ajuster) &mdash; l'image entière tient dans la fenêtre (par
  défaut).
- **100%** &mdash; taille réelle.
- **− / +** &mdash; zoom arrière / avant. La **molette** zoome aussi.
- **Faites glisser** l'image pour vous déplacer lorsqu'elle dépasse de la
  fenêtre.
- **Download** (télécharger) &mdash; enregistre le fichier.
- **Close (Esc)** (fermer) &mdash; ou la touche `Échap`, ou un clic en
  dehors de l'image.

### 6.2 Vidéo et audio

Les vidéos sont lues par le lecteur du navigateur : lecture, pause,
volume, plein écran et **déplacement dans la vidéo** &mdash; vous pouvez
sauter n'importe où dans un long enregistrement sans le télécharger
d'abord.

Certains enregistrements utilisent des formats ou des codecs que les
navigateurs ne savent pas décoder (formats propriétaires d'enregistreurs,
parfois le H.265/HEVC). La visionneuse affiche alors *This file can't be
played in this browser* et propose **Download it instead** (le
télécharger) ; ouvrez le fichier téléchargé avec votre lecteur habituel
(VLC, le lecteur du fabricant de l'enregistreur…).

### 6.3 Pourquoi certains fichiers sont toujours téléchargés

Les pages web (`.html`), les images vectorielles (`.svg`) et d'autres
fichiers semblables peuvent contenir du code. Si le navigateur les
affichait dans Quick FTP Explorer, ce code s'exécuterait avec votre
session. Ils sont donc toujours **téléchargés**, jamais affichés &mdash;
même si un `.svg`, par exemple, est une image.

### 6.4 Si l'onglet du PDF ne s'ouvre pas

Certains navigateurs bloquent les onglets ouverts par une page. Si un clic
sur un PDF ne fait rien, autorisez les fenêtres pop-up pour l'adresse de
Quick FTP Explorer.

---

## 7. Recherche

Tapez dans le champ **Search** de la barre du haut. Au fil de la frappe :

- le panneau de gauche n'affiche que les raccourcis dont le libellé
  contient le texte ;
- le panneau de droite n'affiche que les éléments du dossier courant dont
  le nom le contient.

La recherche ignore les majuscules et minuscules. Videz le champ pour tout
réafficher.

---

## 8. Gérer les raccourcis (administrateurs)

Seuls les comptes au rôle **admin** voient le bouton **+ New** et le menu
du clic droit dans le panneau de gauche. Les raccourcis sont partagés :
chaque modification est visible par tous (après rechargement de la liste,
par exemple en rechargeant la page).

### 8.1 Créer un raccourci

Cliquez sur **+ New** (ou clic droit dans le panneau de gauche →
**New shortcut…**).

| Champ | Remarques |
|---|---|
| **Username** (identifiant) | Le compte FTP. Obligatoire. Il identifie aussi le raccourci : deux raccourcis ne peuvent pas avoir le même identifiant. |
| **Custom label text** (texte du libellé) | Facultatif. Le libellé affiché dans l'arborescence est l'identifiant suivi de ce texte, par exemple `main-nvr Bureau principal`. L'aperçu sous le formulaire montre le résultat. |
| **Host** et **Port** (hôte et port) | Le serveur FTP. Pré-remplis avec les valeurs par défaut de votre organisation. |
| **Password** (mot de passe) | Par défaut, l'identifiant ; il le suit pendant la saisie tant que vous n'avez pas tapé votre propre mot de passe. |

Cliquez sur **Save** (enregistrer). Les problèmes s'affichent en haut du
formulaire, par exemple *A shortcut for username "…" already exists* (ce
raccourci existe déjà) ou *Username contains control characters*
(caractères interdits).

### 8.2 Modifier un raccourci

Clic droit sur le raccourci → **Edit shortcut…**.

- Le champ mot de passe est **vide** : les mots de passe enregistrés ne
  sont jamais envoyés aux navigateurs. Laissez-le vide pour conserver le
  mot de passe actuel.
- **Si vous changez l'hôte ou le port, vous devez ressaisir le mot de
  passe.** Cela empêche quiconque d'envoyer un mot de passe enregistré
  vers un autre serveur.
- Changer l'**identifiant** renomme le raccourci. Si vous le parcouriez,
  l'affichage repart de sa racine.

### 8.3 Supprimer un raccourci

Clic droit sur le raccourci → **Delete shortcut**, puis confirmez. Tout le
monde en perd l'accès immédiatement.

---

## 9. Raccourcis clavier

| Touche | Action |
|---|---|
| `Échap` | Fermer la visionneuse, la fenêtre de raccourci ou le menu du clic droit |
| `Tab` / `Maj+Tab` | Passer d'une ligne de fichier à l'autre |
| `Entrée` | Ouvrir le fichier ou dossier sélectionné |

---

## 10. Dépannage

| Message ou symptôme | Que faire |
|---|---|
| *FTP login failed: 530 …* | L'identifiant ou le mot de passe FTP du raccourci est faux, ou le compte a changé sur le serveur FTP. Prévenez un administrateur. |
| *… (not retried for 5 min; an admin should check this shortcut)* | Après un échec de connexion FTP, le raccourci est mis en pause 5 minutes pour que des tentatives répétées ne fassent pas bloquer le serveur. Il reprend tout seul, ou immédiatement dès qu'un administrateur enregistre le raccourci. |
| *Not found, or no permission* | Le dossier ou le fichier a été déplacé ou supprimé, ou le compte FTP n'a pas le droit de le lire. Cliquez sur **↻** dans le dossier parent. |
| *The FTP server is busy …* | Trop de personnes utilisent ce serveur en même temps. Patientez quelques secondes et réessayez. |
| *Can't reach the FTP server* / *did not answer in time* / *took too long* | Le serveur FTP est arrêté, injoignable ou très lent. Réessayez plus tard ; prévenez un administrateur si cela persiste. |
| *The server can't be reached* | Votre propre connexion à Quick FTP Explorer est coupée. Vérifiez votre réseau. |
| Une vidéo affiche *can't be played in this browser* | Voir le [§6.2](#62-vidéo-et-audio) : téléchargez-la et utilisez un autre lecteur. |
| Un téléchargement échoue dans la liste des téléchargements | En général, l'un des problèmes FTP ci-dessus : réessayez, ou rouvrez le dossier du fichier pour vérifier qu'il existe toujours. |
| Un clic sur un PDF ne fait rien | Autorisez les fenêtres pop-up pour le site ([§6.4](#64-si-longlet-du-pdf-ne-souvre-pas)). |
| Vous revenez à la page de connexion | Votre session a expiré ou votre compte a été modifié. Reconnectez-vous. |

---

## 11. Confidentialité et données

- **Mots de passe.** Le mot de passe de votre compte n'est conservé que
  sous forme d'empreinte salée. Les mots de passe FTP sont stockés sur le
  serveur et n'apparaissent jamais dans aucune page.
- **Journal d'audit.** Pour la traçabilité, le serveur enregistre les
  connexions, les modifications de raccourcis, et les dossiers et fichiers
  ouverts par chaque utilisateur, avec l'heure et l'adresse réseau. Les
  enregistrements de caméras sont des données personnelles ; renseignez-vous
  auprès de votre administrateur sur les règles de conservation de votre
  organisation.
- **Votre poste.** Les fichiers ouverts ne sont pas conservés dans le cache
  du navigateur. Les fichiers téléchargés arrivent dans votre dossier
  Téléchargements comme n'importe quel téléchargement ; supprimez-les
  quand vous n'en avez plus besoin.
- **Le serveur** transmet les fichiers du serveur FTP jusqu'à vous sans les
  stocker.

---

## 12. FAQ

**Dois-je installer quelque chose ?**
Non. Un navigateur récent suffit.

**Puis-je l'utiliser sur un téléphone ou une tablette ?**
Sur tablette, oui : tout fonctionne au toucher (touchez pour ouvrir, faites
glisser la bordure entre les panneaux pour redimensionner). Sur téléphone,
utilisez l'orientation paysage ; la mise en page est conçue pour des écrans
plus larges.

**Puis-je envoyer, renommer ou supprimer des fichiers ?**
Non. Quick FTP Explorer est volontairement en lecture seule.

**Comment changer mon mot de passe, ou obtenir un compte pour un collègue ?**
Demandez à un administrateur.

**Pourquoi ne vois-je pas l'adresse du serveur FTP ?**
Seuls les administrateurs en ont besoin. Les autres utilisateurs ne voient
que les libellés des raccourcis.

**Je vois un dossier nommé `latest` (ou similaire) qui s'ouvre comme un fichier.**
Il s'agit probablement d'un lien sur le serveur FTP. Les liens sont
affichés comme des fichiers ; ouvrez directement le dossier vers lequel ils
pointent.
