# Quick FTP Explorer — Manuel utilisateur (français)

Outil Windows portable, sans installation, pour parcourir des raccourcis FTP
et ouvrir les fichiers qu'ils contiennent. Ce manuel couvre tout ce qu'un
nouvel utilisateur doit savoir : installation, interface, utilisation
quotidienne, dépannage et sujets avancés.

---

## 1. Présentation

Quick FTP Explorer est une application Windows portable, livrée sous forme
d'une unique application HTML (`.hta`). Elle permet de :

- Enregistrer plusieurs serveurs FTP sous forme de **raccourcis** nommés.
- Parcourir la hiérarchie de chaque serveur dans une interface à deux
  panneaux, inspirée de l'Explorateur Windows.
- Ouvrir les fichiers directement &mdash; les images s'affichent dans une
  visionneuse intégrée avec zoom et déplacement ; tous les autres types
  (vidéo, PDF, audio, documents, archives) sont téléchargés dans un dossier
  temporaire puis ouverts avec votre application Windows par défaut.
- Filtrer raccourcis et fichiers en direct.
- Créer, modifier et supprimer des raccourcis depuis l'interface.

Toutes les données sont stockées dans des fichiers ordinaires à côté de
l'application, ce qui permet une sauvegarde ou une migration par simple
copie du dossier `config/`.

---

## 2. Pré-requis système

- **Système d'exploitation :** Windows 10 version 1803 (avril 2018) ou plus
  récent, ou Windows 11.
- **Espace disque :** moins de 200 Ko pour l'application elle-même ; les
  téléchargements temporaires se trouvent dans `config/temp/` et sont
  supprimés au démarrage et à la fermeture de l'application.
- **Aucun runtime requis :** l'application s'appuie sur `mshta.exe` (hôte
  d'applications HTML) et `curl.exe` (client FTP), tous deux présents par
  défaut sur Windows.
- **Réseau :** accès TCP sortant vers vos serveurs FTP sur le port
  configuré (21 par défaut ; n'importe quel port est pris en charge).

---

## 3. Installation

1. Récupérez l'archive `quick-ftp-explorer.zip` (produite par `package.bat`
   ou téléchargée depuis le projet).
2. Décompressez-la dans un dossier où vous avez les droits d'écriture
   (Bureau, Documents, clé USB, etc.). N'installez **pas** sous
   `C:\Program Files\` sauf si vous comptez exécuter en administrateur
   &mdash; l'application écrit dans son propre dossier `config/`.
3. Ouvrez le dossier décompressé et double-cliquez sur
   **`quick-ftp-explorer.hta`**.

Il n'y a pas d'installateur, pas de clé de registre, pas de service, et
aucun raccourci Bureau n'est créé automatiquement. Pour « désinstaller »,
supprimez simplement le dossier.

**Note de premier lancement :** sur des installations Windows très récentes,
Microsoft Edge peut demander l'autorisation d'exécuter l'HTA. Cliquez sur
**Autoriser** ou **Exécuter**. L'application est entièrement locale
&mdash; elle ne contacte aucun serveur autre que les FTP que vous
configurez explicitement.

---

## 4. Premier démarrage

Au premier lancement :

1. La fenêtre s'ouvre avec la barre supérieure, deux panneaux vides et un
   pied de page indiquant `0 shortcuts`.
2. Le fichier `config/data.csv` est créé automatiquement avec des valeurs
   par défaut pour l'hôte et le port. Voir
   [§11 Valeurs par défaut](#11-valeurs-par-défaut) pour les personnaliser.
3. Cliquez avec le bouton droit dans le panneau de gauche, puis choisissez
   **New shortcut&hellip;** pour ajouter votre premier serveur FTP.

---

## 5. L'interface

```
+------------------------------------------------------------------+
|  ● Quick FTP Explorer    [ Fil d'Ariane ]         [ Search... ]  |  <- barre du haut
+----------------+-+-----------------------------------------------+
| SHORTCUTS      | |                                               |
|                | |                                               |
|  ▸ srv-main    | |                                               |
|  ▾ srv-branch  |S|    Name          Type   Size     Modified     |
|    ▸ 2024      |é|    ▸ Archive     Folder ...                   |  <- panneaux
|    ▸ 2025      |p|    ▸ Live        Folder ...                   |
|  ▸ srv-office  |a|    ◌ photo.jpg   JPG    2,3 Mo   2026-04-10   |
|                |r|    ◌ clip.mp4    MP4   12,8 Mo   2026-04-08   |
|                | |                                               |
+----------------+-+-----------------------------------------------+
|  3 shortcuts                                 default 127.0.0.1:21|  <- barre d'état
+------------------------------------------------------------------+
```

### 5.1 Barre du haut

- **Marque** (gauche) : le nom de l'application.
- **Fil d'Ariane** (centre) : indique votre emplacement courant. Les segments
  sont cliquables &mdash; cliquez sur un ancêtre pour y remonter. Le dernier
  segment (le dossier courant) n'est pas cliquable. Quand aucun raccourci
  n'est sélectionné, le fil d'Ariane affiche _Select a shortcut_.
- **Recherche** (droite) : filtre en direct les deux panneaux par
  sous-chaîne, insensible à la casse. Voir [§10 Recherche](#10-recherche).

### 5.2 Panneau de gauche &mdash; raccourcis et arborescence

Chaque raccourci s'affiche comme une ligne racine avec une icône de serveur
et son libellé. Cliquer sur un raccourci :

1. Récupère le listing racine depuis le serveur.
2. Développe la ligne pour afficher ses dossiers.
3. Remplit le panneau de droite avec les fichiers à la racine.

Cliquer sur un dossier développe l'arbre d'un niveau supplémentaire et
affiche son contenu à droite. Cliquer uniquement sur le petit triangle
(▸ / ▾) à gauche d'une ligne bascule l'expansion **sans** changer la
sélection courante.

Seuls les dossiers apparaissent dans l'arbre. Les fichiers sont toujours
affichés dans le panneau de droite.

Le panneau de gauche est **redimensionnable** &mdash; faites glisser la
barre verticale entre les deux panneaux.

### 5.3 Panneau de droite &mdash; liste des fichiers

Le panneau de droite affiche un tableau avec :

- **Name** (Nom) &mdash; avec une icône indiquant le type (dossier, image,
  vidéo, audio, document, fichier générique).
- **Type** &mdash; `Folder` pour les dossiers, sinon l'extension en
  majuscules (par ex. `MP4`, `JPG`).
- **Size** (Taille) &mdash; formatée en o / Ko / Mo / Go. Vide pour les
  dossiers.
- **Modified** (Modifié) &mdash; la date renvoyée par le serveur (format
  dépendant du serveur, typiquement `MMM JJ AAAA` ou `MMM JJ HH:MM` pour
  les fichiers très récents).

Les dossiers sont toujours listés en premier, par ordre alphabétique ;
les fichiers suivent, également par ordre alphabétique.

Cliquer sur une ligne :
- **Dossier** &mdash; y entre ; l'arbre se développe et le panneau de
  droite est mis à jour.
- **Fichier** &mdash; le télécharge et l'ouvre
  (voir [§9 Ouverture des fichiers](#9-ouverture-des-fichiers)).

### 5.4 Barre d'état

Deux informations :

- **Gauche :** le nombre de raccourcis enregistrés.
- **Droite :** l'hôte et le port par défaut courants (ce que la boîte
  **New shortcut&hellip;** pré-remplira).

---

## 6. Créer et modifier des raccourcis

Trois façons de gérer les raccourcis : création via l'interface, modification
via l'interface, ou édition directe des fichiers JSON. La **suppression**
a sa propre section ([§7](#7-supprimer-un-raccourci)).

### 6.1 Création via l'interface (recommandé)

1. **Clic droit** n'importe où dans le panneau de gauche.
2. Dans le menu contextuel, cliquez sur **New shortcut&hellip;**.
3. Remplissez la boîte de dialogue (titre : _New shortcut_) :
   - **Username** (Nom d'utilisateur) : le compte FTP. _Requis._
   - **Custom label text** (Texte personnalisé) : une description libre
     ajoutée au libellé (par ex. `Main office NVR`). Facultatif.
   - **Host** (Hôte) : adresse du serveur FTP (IP ou nom d'hôte).
     Pré-rempli depuis `config/data.csv`.
   - **Port** : port FTP. Pré-rempli depuis `config/data.csv` (21 par
     défaut).
   - **Password** (Mot de passe) : recopie automatiquement le nom
     d'utilisateur tant que vous ne le modifiez pas manuellement.
     Correspond à la convention habituelle où le mot de passe est égal au
     nom d'utilisateur ; changez-le si votre serveur utilise d'autres
     identifiants.
   - **Label preview** (Aperçu du libellé) : aperçu en direct du libellé
     final, formé comme `<username> <custom text>` (ou simplement
     `<username>` si le texte personnalisé est vide).
4. Cliquez sur **Save**.

Le nouveau raccourci apparaît dans le panneau de gauche, trié
alphabétiquement par libellé.

Le fichier `config/shortcuts/<username>.json` est écrit lors de
l'enregistrement. Il contient le libellé, l'hôte, le port, le nom
d'utilisateur et le mot de passe au format JSON. Voir
[§13 Référence des fichiers](#13-référence-des-fichiers-et-dossiers).

### 6.2 Création en écrivant le fichier JSON à la main

Pour créer de nombreux raccourcis par programme, déposez directement des
fichiers JSON dans `config/shortcuts/`. Chaque fichier a cette structure :

```json
{
  "label": "main-nvr Main office NVR",
  "host": "192.0.2.10",
  "port": 21,
  "username": "main-nvr",
  "password": "main-nvr"
}
```

Le nom de fichier doit être `<username-assaini>.json` où « assaini » signifie
caractères alphanumériques plus `.`, `_`, `-`. Les autres caractères sont
remplacés par `_`.

Les nouveaux fichiers sont pris en compte au prochain lancement ou à toute
opération qui relit la liste des raccourcis.

### 6.3 Modifier un raccourci existant

Faites un **clic droit** sur la ligne racine d'un raccourci dans le panneau
de gauche (la ligne de premier niveau, avec l'icône serveur &mdash; pas un
dossier ni un fichier). Dans le menu contextuel, cliquez sur
**Edit shortcut&hellip;**. La même boîte de dialogue s'ouvre, mais :

- Son titre indique **Edit shortcut**.
- Tous les champs sont pré-remplis avec les valeurs actuelles du
  raccourci.
- Le champ **Custom label text** contient ce qui suit le nom d'utilisateur
  dans le libellé courant (voir §6.1 pour la règle de formation du
  libellé). Si le libellé ne commence pas par `<username> `, le libellé
  entier est placé dans le champ personnalisé ; ajustez-le avant
  d'enregistrer.
- Le champ **Password** affiche le mot de passe courant en clair. Il ne
  recopie plus automatiquement les modifications du nom d'utilisateur
  &mdash; ce que vous tapez ici fait foi.

Modifiez les champs voulus puis cliquez sur **Save**.

**Comportement à l'enregistrement :**

- Si vous gardez le même **Username**, le fichier JSON existant est
  écrasé avec les nouvelles valeurs. L'arbre conserve son état
  d'expansion, et votre sélection courante est maintenue si elle
  appartient à ce raccourci.
- Si vous changez le **Username**, l'ancien
  `config/shortcuts/<old-id>.json` est **supprimé** et un nouveau
  `config/shortcuts/<new-id>.json` est créé. Cela équivaut à un
  renommage. L'identité du raccourci ayant changé, tout état d'affichage
  en cours pour lui est effacé ; recliquez sur le raccourci pour relancer
  la navigation. Les sous-dossiers déjà ouverts devront être re-récupérés
  (le cache mémoire est indexé par l'identifiant du raccourci).

**Annuler :** cliquez sur **Cancel**, appuyez sur **Échap**, ou cliquez à
l'extérieur de la fenêtre modale. Aucune modification n'est écrite.

**Alternative (utilisateurs avancés) :** que l'application soit fermée ou
non, ouvrez `config/shortcuts/<id>.json` dans un éditeur de texte,
modifiez les champs puis enregistrez. Les changements prennent effet à
la prochaine opération qui relit la liste des raccourcis (sélection
d'un autre raccourci, création ou suppression, redémarrage de
l'application).

---

## 7. Supprimer un raccourci

1. **Clic droit** sur la ligne racine du raccourci dans le panneau de gauche.
2. Cliquez sur **Delete shortcut**.
3. Confirmez dans la boîte de dialogue.

Le fichier correspondant dans `config/shortcuts/` est supprimé. Si ce
raccourci était sélectionné, le panneau de droite se vide.

Vous pouvez aussi supprimer un raccourci en retirant son fichier JSON de
`config/shortcuts/` manuellement, puis en relançant l'application.

---

## 8. Parcourir un serveur FTP

Après avoir cliqué sur un raccourci :

1. Un indicateur de chargement apparaît en bas à droite pendant le
   chargement du listing racine.
2. Le raccourci se développe pour afficher ses dossiers.
3. Le panneau de droite se remplit avec le contenu de la racine.

Chaque dossier cliqué fait de même : récupération, expansion, affichage.
Les résultats sont mis en cache en mémoire pendant la session ; revenir
dans un dossier est instantané. Si une opération échoue (erreur réseau,
identifiants incorrects, temps d'attente dépassé), un message d'erreur
rouge apparaît sous le nœud ; un nouveau clic relance la tentative.

Pour sortir d'un dossier :

- **Cliquer sur un ancêtre** dans le fil d'Ariane en haut.
- **Cliquer sur n'importe quel dossier** dans l'arbre de gauche, à
  n'importe quel niveau.
- **Cliquer sur le triangle** d'un dossier de l'arbre pour le refermer
  sans changer la sélection.

---

## 9. Ouverture des fichiers

Cliquer sur une ligne de fichier déclenche un téléchargement et une
ouverture.

### 9.1 Téléchargement

Le fichier est récupéré via `curl.exe` dans `config/temp/` sous un nom
unique (un préfixe horodaté évite les collisions). Un indicateur en bas
à droite signale le téléchargement en cours ; plusieurs téléchargements
simultanés sont possibles, et l'indicateur reste affiché jusqu'à ce que
tous soient terminés.

### 9.2 Ouverture

- **Images** (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`) ouvrent
  dans la visionneuse intégrée. Voir [§9.3](#93-visionneuse-dimages-intégrée).
- **Tout le reste** (`.mp4`, `.webm`, `.mov`, `.mkv`, `.avi`, `.mp3`,
  `.wav`, `.pdf`, `.docx`, `.zip`, &hellip;) est ouvert avec l'application
  Windows par défaut via `start ""`. Votre lecteur vidéo ou lecteur PDF
  prend le relais.

### 9.3 Visionneuse d'images intégrée

Une fenêtre modale sombre recouvre l'interface. Les contrôles dans
l'en-tête :

- **Fit** &mdash; ajuste l'image à la taille de la fenêtre (par défaut).
- **100%** &mdash; taille réelle, un pixel image pour un pixel écran.
- **&minus; / +** &mdash; zoom avant / arrière par pas de 1,25&times;.
- **Open externally** &mdash; ouvre le même fichier dans votre visionneuse
  d'images par défaut (pratique pour imprimer ou retoucher).
- **Close (Esc)** &mdash; ferme la fenêtre. La touche `Échap` fait la même
  chose.

Interactions :

- **Molette** &mdash; zoom avant / arrière.
- **Cliquer-glisser** &mdash; déplacer l'image quand elle dépasse la
  fenêtre.
- **Clic en dehors de l'image** &mdash; ferme la fenêtre.

### 9.4 Cycle de vie du dossier temporaire

Les fichiers téléchargés restent dans `config/temp/` jusqu'à ce qu'un des
événements suivants se produise :

- L'application est lancée (tout le contenu non caché de `config/temp/`
  est effacé).
- L'application est fermée (même nettoyage, au mieux possible).
- Un fichier est encore ouvert par une application externe au moment de
  la fermeture &mdash; il sera effacé au prochain lancement.

Vous n'avez pas à nettoyer `config/temp/` manuellement.

---

## 10. Recherche

Commencez à taper dans le champ **Search** de la barre du haut. La requête
s'applique en direct (pas besoin d'appuyer sur Entrée), en minuscules, et
comme une sous-chaîne :

- Dans le **panneau de gauche**, seuls les raccourcis dont le **libellé**
  contient la requête sont affichés. Si rien ne correspond, l'indication
  _No shortcuts match_ apparaît.
- Dans le **panneau de droite**, seules les entrées (dossiers et fichiers)
  du dossier ouvert dont le **nom** contient la requête sont affichées.
  Si rien ne correspond, le panneau affiche _No entries match_.

La recherche ne modifie pas l'état d'expansion de l'arbre ; effacer le
champ restaure tout instantanément.

La recherche est purement locale &mdash; elle ne parcourt pas
récursivement les dossiers distants. Pour chercher dans un sous-dossier,
ouvrez-le d'abord, puis tapez.

---

## 11. Valeurs par défaut

`config/data.csv` contient les valeurs par défaut à l'échelle de
l'application, utilisées par la boîte **New shortcut&hellip;** :

```
key,value
default_host,127.0.0.1
default_port,21
```

Ouvrez le fichier avec n'importe quel éditeur de texte (le Bloc-notes
suffit). Les changements prennent effet à la prochaine création de
raccourci &mdash; aucun rechargement nécessaire. Les autres clés sont
ignorées mais conservées, vous pouvez y ajouter vos propres notes.

Si le fichier n'existe pas au démarrage, il est créé automatiquement avec
des valeurs de repli.

---

## 12. Raccourcis clavier

| Contexte | Touches | Action |
|---|---|---|
| N'importe quelle modale | `Échap` | Ferme la modale |
| Menu contextuel | `Échap` | Ferme le menu |
| Visionneuse d'images | `Échap` | Ferme la visionneuse |
| Champ de recherche | touches d'édition classiques | Édite la requête en direct |
| Partout | `Alt+F4` | Quitte l'application (standard Windows) |

---

## 13. Référence des fichiers et dossiers

```
quick-ftp-explorer/
├── quick-ftp-explorer.hta     Point d'entrée. Double-cliquer pour lancer.
├── ui/
│   ├── styles.css             Styles visuels.
│   └── js/
│       ├── shell.js           Pont .hta <-> .bat + aides système fichier.
│       ├── config.js          Persistance de data.csv + raccourcis.
│       ├── ftp.js             Listing / téléchargement / construction d'URL.
│       ├── ui.js              Arbre de gauche + tableau de fichiers à droite.
│       ├── viewer.js          Visionneuse d'images intégrée.
│       └── app.js             Orchestration / câblage des événements.
├── scripts/
│   ├── list.bat               curl LIST -> fichier de sortie.
│   ├── download.bat           curl RETR -> fichier de sortie.
│   └── open.bat               start "" "<chemin local>".
├── config/
│   ├── data.csv               Valeurs par défaut modifiables.
│   ├── shortcuts/             Un fichier <username>.json par raccourci.
│   └── temp/                  Téléchargements temporaires. Nettoyés à chaque démarrage + arrêt.
├── docs/
│   ├── architecture.md        Notes de conception côté développeur.
│   ├── user-manual.en.md      Manuel utilisateur en anglais.
│   └── user-manual.fr.md      Ce fichier.
├── package.bat                Construit dist/quick-ftp-explorer.zip.
├── README.md
└── LICENSE
```

**Ce que vous pouvez modifier sans risque :**

- `config/data.csv` &mdash; modifier les valeurs par défaut à volonté.
- `config/shortcuts/*.json` &mdash; éditer manuellement pour ajuster
  libellés, hôtes, identifiants.
- `config/temp/` &mdash; le contenu peut être supprimé à tout moment.

**À ne pas toucher sans raison (dev) :**

- `ui/*`, `scripts/*`, le `.hta` lui-même.

---

## 14. Dépannage

### 14.1 L'HTA ne s'ouvre pas au double-clic

- Vérifiez que votre version de Windows est au moins 10.0.17134
  (build 1803). Les versions antérieures peuvent ne pas disposer de
  `curl.exe` ou de `mshta.exe` à jour.
- Clic droit sur le fichier `.hta`, **Propriétés**, cochez **Débloquer**
  si l'option apparaît (Windows bloque les fichiers téléchargés depuis
  internet tant qu'on ne les débloque pas).
- Certaines politiques d'entreprise désactivent `mshta.exe`. Si votre
  organisation restreint le scripting, contactez votre équipe
  informatique.

### 14.2 « Failed to connect » / « curl exited with code 7 »

Le serveur FTP est injoignable.

- Vérifiez l'hôte et le port dans le JSON du raccourci ou la boîte
  **New shortcut**.
- Vérifiez votre connexion internet.
- Vérifiez le pare-feu Windows et tout VPN qui pourrait bloquer les
  connexions FTP sortantes (port TCP 21 ou celui utilisé par votre
  serveur).

### 14.3 « curl exited with code 67 » ou « 530 Login incorrect »

Nom d'utilisateur ou mot de passe erroné.

- Vérifiez les identifiants auprès de l'administrateur du serveur.
- Par défaut, l'application met `password = username` ; si votre serveur
  attend un mot de passe différent, éditez le JSON du raccourci ou
  recréez-le.

### 14.4 Les libellés affichent des caractères incorrects (é&rarr;Ã©)

L'application utilise UTF-8 pour toutes les entrées/sorties. Si vous voyez
des caractères mal affichés, le JSON a probablement été écrit par un outil
utilisant un autre encodage. Recréez le raccourci depuis l'interface (la
boîte de dialogue écrit toujours en UTF-8) ou ré-enregistrez le JSON en
UTF-8 avec un outil comme Notepad++.

### 14.5 Un fichier ne s'ouvre pas dans l'application externe

- Vérifiez qu'une application par défaut est bien associée à l'extension
  dans Windows (clic droit sur un fichier local du même type &rarr;
  **Ouvrir avec** &rarr; **Toujours utiliser cette application**).
- Le fichier téléchargé est toujours dans `config/temp/` &mdash; vous
  pouvez l'ouvrir manuellement depuis là jusqu'au prochain nettoyage.

### 14.6 L'application met longtemps à lister un gros dossier

La lenteur vient du serveur, pas de l'application. Vous pouvez :

- Ouvrir un sous-dossier plus petit.
- Le cache mémorise le listing pour la session une fois chargé.

### 14.7 Un fichier image ou vidéo reste dans `config/temp/` après fermeture

Si une application externe tenait le fichier ouvert à la fermeture, le
nettoyage n'a pas pu le supprimer. Relancez l'application &mdash; le
nettoyage au démarrage s'en charge. Vous pouvez aussi supprimer
`config/temp/` manuellement à tout moment.

### 14.8 J'ai supprimé un raccourci par erreur

Les fichiers de raccourcis sont retirés de `config/shortcuts/`.
Restaurez-les depuis une sauvegarde si vous en avez ; sinon, recréez-les
via **New shortcut&hellip;**.

---

## 15. Confidentialité et gestion des données

- **Strictement local.** L'application n'ouvre aucune connexion sortante
  autre que vers les serveurs FTP que vous configurez. Aucune remontée
  d'informations, aucune vérification de mise à jour, aucune télémétrie.
- **Les identifiants sont stockés en JSON non chiffré** dans
  `config/shortcuts/`. Ils sont lisibles par quiconque a accès au
  système de fichiers de la machine. Protégez ce dossier via les
  permissions NTFS si cela vous concerne.
- **Les fichiers temporaires** contiennent des copies complètes de tout
  ce que vous ouvrez. Ils sont nettoyés au démarrage et à la fermeture.
  Si vous ouvrez du contenu sensible sur un poste partagé, fermez
  l'application immédiatement après consultation.
- **Les libellés de raccourcis** peuvent apparaître dans le titre de la
  fenêtre et la barre des tâches ; attention aux informations sensibles.

---

## 16. Sauvegarde et migration

Pour sauvegarder votre configuration, copiez le dossier **`config/`**.
Pour restaurer, remplacez le dossier `config/` d'une autre installation
par votre sauvegarde.

Pour déplacer l'application sur une autre machine, copiez le dossier
entier. Aucune entrée de registre ni fichier utilisateur à gérer.

---

## 17. Désinstallation

Fermez l'application, puis supprimez le dossier. Rien d'autre à faire.

Si vous avez configuré une association de fichier ou créé un raccourci
Bureau manuellement, retirez-les vous-même.

---

## 18. Sujets avancés

### 18.1 Utilisation en ligne de commande

L'application est un outil graphique ; il n'y a pas de CLI. En revanche,
les scripts `.bat` de `scripts/` peuvent être appelés directement :

```
scripts\list.bat     <user> <pass> <url-ftp-terminée-par-/> <fichier-sortie>
scripts\download.bat <user> <pass> <url-ftp>                <fichier-sortie>
scripts\open.bat     <chemin-local>
```

Chaque script écrit stderr dans `<fichier-sortie>.err` et le code de
sortie dans `<fichier-sortie>.done` en toute dernière étape &mdash;
pratique pour un polling depuis un autre script.

### 18.2 Exécuter les HTAs de test

Les développeurs peuvent valider la couche config, le round-trip FTP et
l'analyseur de listing avec les HTAs du dossier `tests/`. Chaque HTA se
lance par double-clic. Voir [`docs/architecture.md`](architecture.md)
pour les détails.

### 18.3 Créer votre propre zip

Lancez `package.bat` depuis la racine du projet. Il stage une copie
propre de l'application (pas de `.git`, pas de `tests/`, pas de
raccourcis utilisateur, pas de fichiers temp) puis la zippe dans
`dist/quick-ftp-explorer.zip`.

---

## 19. FAQ

**Q : Prend-il en charge FTPS ou SFTP ?**
R : Non. FTP simple uniquement. Simplification volontaire &mdash;
l'objectif était une application sans dépendances, et le `curl.exe`
livré avec Windows est le seul client FTP que nous utilisons.

**Q : Puis-je téléverser ou renommer des fichiers distants ?**
R : Non. L'application est en lecture seule du côté serveur.

**Q : Pourquoi un HTA ? C'est obsolète.**
R : Pour rendre l'installation « décompresser et double-cliquer ». Toute
machine Windows 10/11 a déjà `mshta.exe` et `curl.exe`, donc aucun
runtime, aucune compilation, aucune dépendance externe. En contrepartie,
l'interface s'affiche via le moteur de rendu IE11 hérité.

**Q : Fonctionne-t-il sur macOS ou Linux ?**
R : Non. Windows uniquement, par conception.

**Q : Pourquoi certaines icônes manquent pour certains fichiers ?**
R : Le moteur IE11 intégré peut ne pas afficher certains glyphes emoji.
Le comportement reste correct, seule l'icône est concernée.

**Q : Puis-je protéger l'application par un mot de passe ?**
R : Non en natif. Utilisez les permissions NTFS de Windows pour
restreindre l'accès au dossier `config/shortcuts/`.

---

## 20. Obtenir de l'aide

Ouvrez un ticket sur le dépôt du projet, ou consultez les notes de
développement dans [`docs/architecture.md`](architecture.md) pour une
compréhension plus approfondie du fonctionnement interne.
