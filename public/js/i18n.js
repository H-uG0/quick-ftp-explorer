/*
 * i18n.js - every text of the interface, in English and French. One table
 * for the browser and for the server's messages, so they can't drift apart
 * (the server imports this file, as it does filetypes.js).
 *
 *   translate(lang, key, params)   the text, with {name} slots filled; a param
 *                                  may itself be msg(...), translated too
 *   plural(lang, key, n, params)   "{n} result" / "{n} results", by the
 *                                  language's plural rules
 *   msg(key, params)               a text to translate later (server errors)
 *   pickLanguage(cookie, accept)   the qfe_lang cookie if valid, else the
 *                                  best of Accept-Language, else English
 *   formatSize(bytes, lang)        "1.5 KB" / "1,5 Ko"
 *   formatDate(raw, lang)          an FTP listing's "Apr 01 2026" as "1 avr. 2026"
 *   formatDateTime(ms, precision)  "01/04/2026 14:34", as Windows lists times
 *   formatLongDateTime(ms, precision, lang)   "mercredi 1 avril 2026 à 14:34:00"
 *   formatDayHeading(ms, lang)     "dimanche 1 novembre 2026", for the list's day headings
 *
 * In the browser, once useLanguage() has run:
 *   t(key, params) / tn(key, n, params)   translate into the page's language
 *   language()                            "en" | "fr"
 *   translatePage(root)                   fill [data-i18n] and [data-i18n-attr]
 *   switchLanguage(lang)                  remember the choice (cookie), reload
 */

export const LANGUAGES = ["en", "fr"];
export const COOKIE = "qfe_lang";

// French typography: a no-break space before ":" and inside « », a narrow
// one before "?", "!" and ";".
const NB = " ", NNB = " ";

export const MESSAGES = {
  en: {
    "common.loading": "Loading…",
    "common.retry": "Retry",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.optional": "(optional)",
    "common.close": "Close",
    "lang.switch": "Français",
    "lang.switchCode": "fr",

    "auth.pageTitle": "Sign in",
    "auth.username": "Username",
    "auth.password": "Password",
    "auth.signIn": "Sign in",
    "auth.signOut": "Sign out",
    "auth.signedInAs": "Signed in as {name}",
    "auth.signedInAsAdmin": "Signed in as {name} (admin)",
    "auth.error.invalid": "Wrong username or password.",
    "auth.error.rate": "Too many failed attempts. Wait 15 minutes, then try again.",
    "auth.error.expired": "Your session has expired. Please sign in again.",
    "api.unreachable": "The server can't be reached. Check your connection and try again.",
    "api.failed": "Request failed ({status})",

    "nav.shortcuts": "Sites",
    "nav.current": "Location",
    "nav.resize": "Resize the site panel",
    "nav.refresh": "Refresh this folder",
    "nav.loadingFolder": "Loading folder…",
    "nav.refreshing": "Refreshing…",
    "count.sites": { one: "{n} site", other: "{n} sites" },
    "tree.emptyAdmin": "No sites yet. Click + New site (or right-click here) to add one.",
    "tree.emptyUser": "No sites yet. Ask an administrator to add some.",

    "files.empty": "(empty folder)",
    "col.name": "Name",
    "col.size": "Size",
    "nav.home": "All sites",
    "nav.back": "Back (Alt+Left arrow)",
    "nav.forward": "Forward (Alt+Right arrow)",
    "nav.up": "Up to \"{parent}\" (Alt+Up arrow)",
    "nav.upPlain": "Up",
    "nav.findSite": "Find a site",
    "nav.noSiteMatch": "No site matches \"{query}\".",
    "share.copy": "Copy link",
    "share.copyMany": "Copy links",
    "share.share": "Share link",
    "share.copied": { one: "Link copied.", other: "{n} links copied." },
    "share.dialogTitle": "Copy this link",
    "share.dialogHint": "Press Ctrl+C to copy it.",
    "share.gone": "This file is no longer in this folder.",
    "nav.resizeTip": "Drag, click or use the arrow keys to resize",
    "tree.more": "More actions for {name}",
    "a11y.skip": "Skip to the file list",
    "a11y.gridLabel": "Contents of {place}",
    "a11y.results": "Search results",
    "a11y.folder": "Folder, ",
    "a11y.site": "Site, ",
    "col.camera": "Camera",
    "group.today": "Today — {date}",
    "group.yesterday": "Yesterday — {date}",
    "group.day": "{date}",
    "group.unknown": "Unknown date",
    "group.heading": "{label} · {count}",
    "col.date": "Date",
    "date.modified": "Modified on {date} (from the FTP server)",
    "date.recorded": "Recorded on {date} (from the file name)",
    "count.items": { one: "{n} item", other: "{n} items" },
    "count.itemsOf": { one: "{n} of {total} items", other: "{n} of {total} items" },
    "count.resultsOf": { one: "{n} of {total} results", other: "{n} of {total} results" },
    "count.selected": { one: "{n} item selected", other: "{n} items selected" },
    "status.selection": "{selected} ({size})",
    "status.updated": "Updated at {time}",
    "status.loaded": "{place}: {count}",
    "sel.selectAll": "Select all files shown",
    "sel.hint": "Double-click (or press Enter) to open.",
    "sel.mode": "Select",
    "sel.cancel": "Cancel selection",
    "sel.count": { one: "{n} selected", other: "{n} selected" },
    "cmd.actions": "Actions",
    "cmd.open": "Open",
    "cmd.download": "Download",
    "cmd.downloadCount": "Download ({n})",
    "sort.label": "Sort",
    "sort.by": "Sort by {column}",
    "sort.dateDesc": "Newest first",
    "sort.dateAsc": "Oldest first",
    "sort.nameAsc": "Name (A to Z)",
    "sort.nameDesc": "Name (Z to A)",
    "sort.cameraAsc": "Camera (A to Z)",
    "sort.cameraDesc": "Camera (Z to A)",
    "sort.sizeDesc": "Largest first",
    "sort.sizeAsc": "Smallest first",
    "sort.announce": "Sorted: {order}",
    "filter.group": "Filters",
    "filter.openCount": "Filters ({n})",
    "filter.period": "Period",
    "filter.periodAll": "Any date",
    "filter.periodHour": "Last hour",
    "filter.periodDay": "Last 24 hours",
    "filter.periodToday": "Today",
    "filter.periodYesterday": "Yesterday",
    "filter.periodWeek": "Last 7 days",
    "filter.periodAround": "Around a time…",
    "filter.periodRange": "Custom range…",
    "filter.at": "Time",
    "filter.margin": "Margin",
    "filter.marginMinutes": "± {n} min",
    "filter.from": "From",
    "filter.to": "To",
    "filter.camera": "Camera",
    "filter.cameraAll": "All cameras ({n})",
    "filter.option": "{value} ({n})",
    "filter.kind": "Type",
    "filter.kindAll": "All types ({n})",
    "filter.kindVideo": "Videos",
    "filter.kindImage": "Images",
    "filter.kindOther": "Other files",
    "filter.clear": "Clear filters",
    "filter.none": "No file matches these filters.",
    "filter.newest": "The newest file here is from {date}.",
    "filter.around": "{at} ± {n} min",
    "filter.range": "{from} – {to}",
    "filter.show": { one: "Show {n} item", other: "Show {n} items" },
    "filter.remove": "Remove the \"{value}\" filter",
    "menu.openNewTab": "Open in new tab",
    "menu.openLocation": "Open file location",
    "menu.selectAll": "Select all",
    "menu.label": "Actions for {name}",
    "menu.listLabel": "Folder actions",
    "kbd.ctrlA": "Ctrl+A",
    "refresh.failed": "Couldn't refresh: {reason}",
    "refresh.new": { one: "{n} new file", other: "{n} new files" },
    "refresh.show": "Show",
    "refresh.tag": "New",
    "acc.open": "Accounts",
    "acc.title": "Accounts",
    "acc.intro": "Everyone signs in with an account of their own. Administrators also manage the sites and the accounts.",
    "acc.name": "Username",
    "acc.role": "Role",
    "acc.actions": "Actions",
    "acc.roleOf": "Role of {name}",
    "acc.roleUser": "User",
    "acc.roleAdmin": "Administrator",
    "acc.you": "(you)",
    "acc.selfTip": "Not for your own account: another administrator can do it.",
    "acc.newPassword": "New password",
    "acc.newPasswordFor": "New password for {name}",
    "acc.delete": "Delete",
    "acc.deleteName": "Delete {name}",
    "acc.newTitle": "New account",
    "acc.nameHint": "Letters, digits, \".\", \"_\" or \"-\"; it is stored in lower case.",
    "acc.password": "Password",
    "acc.passwordHint": "At least 10 characters. A strong one is suggested.",
    "acc.generate": "Suggest another",
    "acc.create": "Create the account",
    "acc.created": "Account \"{name}\" created.",
    "acc.passwordSet": "New password for \"{name}\": their open sessions have ended.",
    "acc.passwordIs": "Password: {password}",
    "acc.passOn": "Pass it on now: it won't be shown again.",
    "acc.copy": "Copy",
    "acc.copied": "Copied",
    "acc.roleChanged": "Role of \"{name}\": {role}.",
    "acc.deleted": "Account \"{name}\" deleted.",
    "acc.confirmDelete": "Delete the account \"{name}\"?\nThey are signed out at once.",
    "acc.confirmPassword": "Give \"{name}\" a new password?\nThe current one stops working and they are signed out.",
    "acc.count": { one: "{n} account", other: "{n} accounts" },
    "err.userName": "Usernames are 1 to 64 characters: letters, digits, \".\", \"_\" or \"-\", starting with a letter or a digit",
    "err.passwordShort": "Passwords need at least {min} characters",
    "err.role": "The role must be user or admin",
    "err.noUser": "No such account",
    "err.userExists": "An account named \"{name}\" already exists",
    "err.userSelf": "You can't delete your own account",
    "err.userSelfRole": "You can't remove your own administrator role",
    "help.open": "Help",
    "help.title": "Help",
    "help.findTitle": "Find a clip",
    "help.find1": "Pick a site on the left: the newest clips come first.",
    "help.find2": "Narrow the list with Period and Camera, above it.",
    "help.find3": "Type several words in the search box, for example \"garage 0830\".",
    "help.keysTitle": "Keyboard shortcuts",
    "help.keyCol": "Keys",
    "help.actionCol": "Action",
    "kbd.searchKeys": "Ctrl+F or F3",
    "kbd.search": "Go to the search box",
    "kbd.openKeys": "Double-click or Enter",
    "kbd.open": "Open",
    "kbd.moveKeys": "Arrows, Home, End, Page Up, Page Down",
    "kbd.move": "Move in the list or the tree",
    "kbd.selectKeys": "Space, Ctrl+click, Shift+click",
    "kbd.select": "Select several files",
    "kbd.menuKeys": "Shift+F10 or the Menu key",
    "kbd.menu": "Actions for the selection",
    "kbd.viewerKeys": "Left/Right arrow, Page Up/Page Down",
    "kbd.viewer": "Previous/next clip in the viewer",
    "kbd.escKeys": "Esc",
    "kbd.esc": "Close; clear the selection, then the search",
    "kbd.navKeys": "Alt+Left, Alt+Right, Alt+Up, Backspace",
    "kbd.nav": "Back, forward, up a level",
    "kbd.helpKeys": "?",
    "kbd.help": "This help",

    "search.label": "Search files and folders",
    "search.in": "Search {place}",
    "search.allSites": "Search all sites",
    "search.tip": "Search (Ctrl+F)",
    "search.clear": "Clear search",
    "search.open": "Search",
    "search.close": "Close search",
    "search.started": "Searching {scope}…",
    "search.scopeAll": "all sites",
    "search.running": "Searching {scope}… {folders}, {results} so far.",
    "search.done": "{results} for \"{query}\" in {scope}.",
    "search.none": "Nothing matches \"{query}\" in {scope}.",
    "search.capped": "Showing the first {n}: add words to narrow the search.",
    "search.truncated": "The search stopped after {max} folders: open a subfolder to search it fully.",
    "search.failed": { one: "{n} folder couldn't be read.", other: "{n} folders couldn't be read." },
    "count.results": { one: "{n} result", other: "{n} results" },
    "count.foldersRead": { one: "{n} folder read", other: "{n} folders read" },

    "sc.newButton": "+ New site",
    "sc.menuNew": "New site…",
    "sc.menuEdit": "Edit site…",
    "sc.menuDelete": "Delete site",
    "sc.titleNew": "New site",
    "sc.titleEdit": "Edit site",
    "sc.username": "Username",
    "sc.custom": "Custom label text",
    "sc.customExample": "e.g. Main office NVR",
    "sc.host": "Host",
    "sc.port": "Port",
    "sc.password": "Password",
    "sc.passwordUnchanged": "Unchanged",
    "sc.passwordDefault": "Defaults to the username",
    "sc.passwordHint": "Leave blank to keep the current password. Required if you change the host or port.",
    "sc.preview": "Label preview:",
    "sc.saving": "Saving…",
    "sc.deleting": "Deleting…",
    "sc.confirmDelete": "Delete site \"{label}\"?\nEveryone loses access to it.",
    "sc.deleteFailed": "Delete failed: {reason}",

    "viewer.download": "Download",
    "viewer.close": "Close",
    "viewer.closeTip": "Close (Esc)",
    "viewer.prev": "Previous",
    "viewer.next": "Next",
    "viewer.prevTip": "Previous (Left arrow, Page Up)",
    "viewer.nextTip": "Next (Right arrow, Page Down)",
    "viewer.position": "{n} of {total}",
    "viewer.caption": "{camera} · {time}",
    "viewer.nameIn": "{name} in {place}",
    "viewer.autoplay": "Play one after another",
    "viewer.autoplayNext": "Next: {caption}",
    "viewer.downloadInstead": "Download it instead",
    "viewer.cantPlay": "This file can't be played in this browser (unsupported format or codec). Download it to watch it in another player.",
    "viewer.converting": "Converting the video for this browser…",
    "viewer.badImage": "This image couldn't be loaded or isn't in a format the browser can show.",
    "viewer.zoomOut": "Zoom out",
    "viewer.zoomIn": "Zoom in",
    "viewer.fit": "Fit",

    "size.units": ["B", "KB", "MB", "GB"],

    "page.error": "Error {status}",
    "page.back": "Back to the explorer",

    "field.username": "Username",
    "field.host": "Host",
    "field.label": "Label",

    "err.internal": "Internal server error",
    "err.bodyTooLarge": "Request body too large",
    "err.badJson": "Malformed JSON body",
    "err.expectedObject": "Expected a JSON object",
    "err.crossOrigin": "Cross-origin request refused",
    "err.jsonOnly": "Expected Content-Type: application/json",
    "err.signIn": "Sign-in required",
    "err.adminsOnly": "Admins only",
    "err.method": "Method not allowed",
    "err.notFound": "Not found",
    "err.badTarget": "Bad request target",
    "err.noShortcut": "No such site",
    "err.notAFile": "Not a file path",
    "err.badPath": "Invalid path",
    "err.range": "Range not satisfiable",
    "err.clientGone": "Client went away",
    "err.ftpBusy": "The FTP server is busy (connection limit reached); try again in a moment",
    "err.ftpLogin": "FTP login failed: {reply}",
    "err.ftpNotFound": "Not found, or no permission: {reply}",
    "err.ftpRefused": "The FTP server refused the connection: {reply}",
    "err.ftpAnswered": "The FTP server answered: {reply}",
    "err.ftpUnreachable": "Can't reach the FTP server ({code})",
    "err.ftpSilent": "The FTP server did not answer in time",
    "err.ftpSlow": "The FTP server took too long to answer",
    "err.ftpFailed": "FTP connection failed: {reason}",
    "err.ftpUnknown": "unknown error",
    "err.hostNotAllowed": "This site's host is not in FTP_ALLOWED_HOSTS",
    "err.loginPaused": "{reason} (not retried for {minutes} min; an admin should check this site)",
    "err.tooBigToPlay": "This file is too big to play here (over {mb} MB): download it instead.",
    "err.stillWriting": "This file is still being written; try again in a moment",
    "err.convertBusy": "The server is busy converting videos; try again in a moment",
    "err.noConverter": "This video needs converting, but the server has no converter (ffmpeg). Download it to watch it in a video player.",
    "err.convertSlow": "Converting this video took too long",
    "err.convertFailed": "This video couldn't be converted: its format isn't supported, or the file is damaged.",
    "err.expectedShortcut": "Expected a site object",
    "err.required": "{field} is required",
    "err.tooLong": "{field} is longer than {max} characters",
    "err.controlChars": "{field} contains control characters",
    "err.badHost": "Host must be a hostname or an IP address",
    "err.hostNotInList": "Host \"{host}\" is not in FTP_ALLOWED_HOSTS",
    "err.badPort": "Port must be a whole number between 1 and 65535",
    "err.passwordTooLong": "Password is longer than 256 characters",
    "err.passwordControl": "Password contains control characters",
    "err.reenterPassword": "Re-enter the FTP password when changing the host or port",
    "err.duplicate": "A site for username \"{username}\" already exists",
    "zip.tooltip": "Download {n} files (ZIP)",
    "zip.tooMany": "Select at most {max} files per download.",
    "zip.oneSite": "Select files from a single site.",
    "zip.preparing": "Preparing the download…",
    "zip.failed": "The download couldn't be prepared: {reason}",
    "zip.errorsName": "ERRORS.txt",
    "zip.errorsIntro": "These files couldn't be added to the archive:",
    "zip.errorLine": "{name}: {reason}",
    "zip.incomplete": "{name}: incomplete, the transfer stopped after {size}",
    "zip.full": "left out, the archive is full (2 GB at most)",
    "err.zipCount": "Select between 1 and {max} files",
    "err.zipDuplicate": "The same file is listed twice",
    "err.zipExpired": "This download link has expired: start the download again.",
    "err.zipBusy": "Too many downloads are being prepared; try again in a moment",
  },

  fr: {
    "common.loading": "Chargement…",
    "common.retry": "Réessayer",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.optional": "(facultatif)",
    "common.close": "Fermer",
    "lang.switch": "English",
    "lang.switchCode": "en",

    "auth.pageTitle": "Connexion",
    "auth.username": "Identifiant",
    "auth.password": "Mot de passe",
    "auth.signIn": "Se connecter",
    "auth.signOut": "Se déconnecter",
    "auth.signedInAs": "Connecté en tant que {name}",
    "auth.signedInAsAdmin": "Connecté en tant que {name} (administrateur)",
    "auth.error.invalid": "Identifiant ou mot de passe incorrect.",
    "auth.error.rate": "Trop de tentatives échouées. Patientez 15 minutes, puis réessayez.",
    "auth.error.expired": "Votre session a expiré. Veuillez vous reconnecter.",
    "api.unreachable": "Le serveur est injoignable. Vérifiez votre connexion et réessayez.",
    "api.failed": "La requête a échoué ({status})",

    "nav.shortcuts": "Sites",
    "nav.current": "Emplacement",
    "nav.resize": "Redimensionner le panneau des sites",
    "nav.refresh": "Actualiser ce dossier",
    "nav.loadingFolder": "Chargement du dossier…",
    "nav.refreshing": "Actualisation…",
    "count.sites": { one: "{n} site", other: "{n} sites" },
    "tree.emptyAdmin": "Aucun site pour l'instant. Cliquez sur + Nouveau site (ou faites un clic droit ici) pour en ajouter un.",
    "tree.emptyUser": "Aucun site pour l'instant. Demandez à un administrateur d'en ajouter.",

    "files.empty": "(dossier vide)",
    "col.name": "Nom",
    "col.size": "Taille",
    "nav.home": "Tous les sites",
    "nav.back": "Précédent (Alt+Flèche gauche)",
    "nav.forward": "Suivant (Alt+Flèche droite)",
    "nav.up": `Monter jusqu'à «${NB}{parent}${NB}» (Alt+Flèche haut)`,
    "nav.upPlain": "Monter",
    "nav.findSite": "Trouver un site",
    "nav.noSiteMatch": `Aucun site ne correspond à «${NB}{query}${NB}».`,
    "share.copy": "Copier le lien",
    "share.copyMany": "Copier les liens",
    "share.share": "Partager le lien",
    "share.copied": { one: "Lien copié.", other: "{n} liens copiés." },
    "share.dialogTitle": "Copiez ce lien",
    "share.dialogHint": "Appuyez sur Ctrl+C pour le copier.",
    "share.gone": "Ce fichier n'est plus dans ce dossier.",
    "nav.resizeTip": "Faites glisser, cliquez ou utilisez les flèches pour redimensionner",
    "tree.more": "Plus d'actions pour {name}",
    "a11y.skip": "Aller à la liste des fichiers",
    "a11y.gridLabel": "Contenu de {place}",
    "a11y.results": "Résultats de la recherche",
    "a11y.folder": "Dossier, ",
    "a11y.site": "Site, ",
    "col.camera": "Caméra",
    "group.today": "Aujourd'hui — {date}",
    "group.yesterday": "Hier — {date}",
    "group.day": "{date}",
    "group.unknown": "Date inconnue",
    "group.heading": "{label} · {count}",
    "col.date": "Date",
    "date.modified": "Modifié le {date} (d'après le serveur FTP)",
    "date.recorded": "Enregistré le {date} (d'après le nom du fichier)",
    "count.items": { one: "{n} élément", other: "{n} éléments" },
    "count.itemsOf": { one: "{n} élément sur {total}", other: "{n} éléments sur {total}" },
    "count.resultsOf": { one: "{n} résultat sur {total}", other: "{n} résultats sur {total}" },
    "count.selected": { one: "{n} élément sélectionné", other: "{n} éléments sélectionnés" },
    "status.selection": "{selected} ({size})",
    "status.updated": "Mis à jour à {time}",
    "status.loaded": `{place}${NB}: {count}`,
    "sel.selectAll": "Sélectionner tous les fichiers affichés",
    "sel.hint": "Double-cliquez (ou appuyez sur Entrée) pour ouvrir.",
    "sel.mode": "Sélectionner",
    "sel.cancel": "Annuler la sélection",
    "sel.count": { one: "{n} sélectionné", other: "{n} sélectionnés" },
    "cmd.actions": "Actions",
    "cmd.open": "Ouvrir",
    "cmd.download": "Télécharger",
    "cmd.downloadCount": "Télécharger ({n})",
    "sort.label": "Trier",
    "sort.by": "Trier par {column}",
    "sort.dateDesc": "Plus récents d'abord",
    "sort.dateAsc": "Plus anciens d'abord",
    "sort.nameAsc": "Nom (de A à Z)",
    "sort.nameDesc": "Nom (de Z à A)",
    "sort.cameraAsc": "Caméra (de A à Z)",
    "sort.cameraDesc": "Caméra (de Z à A)",
    "sort.sizeDesc": "Plus volumineux d'abord",
    "sort.sizeAsc": "Moins volumineux d'abord",
    "sort.announce": `Tri${NB}: {order}`,
    "filter.group": "Filtres",
    "filter.openCount": "Filtres ({n})",
    "filter.period": "Période",
    "filter.periodAll": "Toutes les dates",
    "filter.periodHour": "Dernière heure",
    "filter.periodDay": "24 dernières heures",
    "filter.periodToday": "Aujourd'hui",
    "filter.periodYesterday": "Hier",
    "filter.periodWeek": "7 derniers jours",
    "filter.periodAround": "Autour d'une heure…",
    "filter.periodRange": "Plage personnalisée…",
    "filter.at": "Heure",
    "filter.margin": "Écart",
    "filter.marginMinutes": `±${NB}{n}${NB}min`,
    "filter.from": "Du",
    "filter.to": "Au",
    "filter.camera": "Caméra",
    "filter.cameraAll": "Toutes les caméras ({n})",
    "filter.option": "{value} ({n})",
    "filter.kind": "Type",
    "filter.kindAll": "Tous les types ({n})",
    "filter.kindVideo": "Vidéos",
    "filter.kindImage": "Images",
    "filter.kindOther": "Autres fichiers",
    "filter.clear": "Effacer les filtres",
    "filter.none": "Aucun fichier ne correspond à ces filtres.",
    "filter.newest": "Le fichier le plus récent date du {date}.",
    "filter.around": `{at}${NB}±${NB}{n}${NB}min`,
    "filter.range": "{from} – {to}",
    "filter.show": { one: "Afficher {n} élément", other: "Afficher {n} éléments" },
    "filter.remove": `Retirer le filtre «${NB}{value}${NB}»`,
    "menu.openNewTab": "Ouvrir dans un nouvel onglet",
    "menu.openLocation": "Ouvrir l'emplacement du fichier",
    "menu.selectAll": "Tout sélectionner",
    "menu.label": "Actions pour {name}",
    "menu.listLabel": "Actions sur le dossier",
    "kbd.ctrlA": "Ctrl+A",
    "refresh.failed": `Actualisation impossible${NB}: {reason}`,
    "refresh.new": { one: "{n} nouveau fichier", other: "{n} nouveaux fichiers" },
    "refresh.show": "Afficher",
    "refresh.tag": "Nouveau",
    "acc.open": "Comptes",
    "acc.title": "Comptes",
    "acc.intro": "Chacun se connecte avec son propre compte. Les administrateurs gèrent aussi les sites et les comptes.",
    "acc.name": "Identifiant",
    "acc.role": "Rôle",
    "acc.actions": "Actions",
    "acc.roleOf": "Rôle de {name}",
    "acc.roleUser": "Utilisateur",
    "acc.roleAdmin": "Administrateur",
    "acc.you": "(vous)",
    "acc.selfTip": `Pas pour votre propre compte${NB}: un autre administrateur peut le faire.`,
    "acc.newPassword": "Nouveau mot de passe",
    "acc.newPasswordFor": "Nouveau mot de passe pour {name}",
    "acc.delete": "Supprimer",
    "acc.deleteName": "Supprimer {name}",
    "acc.newTitle": "Nouveau compte",
    "acc.nameHint": `Lettres, chiffres, «${NB}.${NB}», «${NB}_${NB}» ou «${NB}-${NB}»${NNB}; enregistré en minuscules.`,
    "acc.password": "Mot de passe",
    "acc.passwordHint": "Au moins 10 caractères. Un mot de passe solide est proposé.",
    "acc.generate": "En proposer un autre",
    "acc.create": "Créer le compte",
    "acc.created": `Compte «${NB}{name}${NB}» créé.`,
    "acc.passwordSet": `Nouveau mot de passe pour «${NB}{name}${NB}»${NB}: ses sessions ouvertes sont fermées.`,
    "acc.passwordIs": `Mot de passe${NB}: {password}`,
    "acc.passOn": `Transmettez-le maintenant${NB}: il ne sera plus affiché.`,
    "acc.copy": "Copier",
    "acc.copied": "Copié",
    "acc.roleChanged": `Rôle de «${NB}{name}${NB}»${NB}: {role}.`,
    "acc.deleted": `Compte «${NB}{name}${NB}» supprimé.`,
    "acc.confirmDelete": `Supprimer le compte «${NB}{name}${NB}»${NNB}?\nLa personne est déconnectée aussitôt.`,
    "acc.confirmPassword": `Donner un nouveau mot de passe à «${NB}{name}${NB}»${NNB}?\nL'actuel ne fonctionnera plus et la personne sera déconnectée.`,
    "acc.count": { one: "{n} compte", other: "{n} comptes" },
    "err.userName": `L'identifiant fait de 1 à 64 caractères${NB}: lettres, chiffres, «${NB}.${NB}», «${NB}_${NB}» ou «${NB}-${NB}», en commençant par une lettre ou un chiffre`,
    "err.passwordShort": "Le mot de passe doit faire au moins {min} caractères",
    "err.role": "Le rôle doit être utilisateur ou administrateur",
    "err.noUser": "Ce compte n'existe pas",
    "err.userExists": `Un compte «${NB}{name}${NB}» existe déjà`,
    "err.userSelf": "Vous ne pouvez pas supprimer votre propre compte",
    "err.userSelfRole": "Vous ne pouvez pas retirer votre propre rôle d'administrateur",
    "help.open": "Aide",
    "help.title": "Aide",
    "help.findTitle": "Trouver un clip",
    "help.find1": `Choisissez un site à gauche${NB}: les clips les plus récents sont en tête.`,
    "help.find2": "Affinez la liste avec Période et Caméra, au-dessus d'elle.",
    "help.find3": `Tapez plusieurs mots dans la recherche, par exemple «${NB}garage 0830${NB}».`,
    "help.keysTitle": "Raccourcis clavier",
    "help.keyCol": "Touches",
    "help.actionCol": "Action",
    "kbd.searchKeys": "Ctrl+F ou F3",
    "kbd.search": "Aller à la recherche",
    "kbd.openKeys": "Double-clic ou Entrée",
    "kbd.open": "Ouvrir",
    "kbd.moveKeys": "Flèches, Origine, Fin, Pg. préc., Pg. suiv.",
    "kbd.move": "Se déplacer dans la liste ou l'arborescence",
    "kbd.selectKeys": "Espace, Ctrl+clic, Maj+clic",
    "kbd.select": "Sélectionner plusieurs fichiers",
    "kbd.menuKeys": "Maj+F10 ou la touche Menu",
    "kbd.menu": "Actions sur la sélection",
    "kbd.viewerKeys": "Flèche gauche/droite, Pg. préc./Pg. suiv.",
    "kbd.viewer": "Clip précédent/suivant dans la visionneuse",
    "kbd.escKeys": "Échap",
    "kbd.esc": `Fermer${NNB}; effacer la sélection, puis la recherche`,
    "kbd.navKeys": "Alt+Flèche gauche, Alt+Flèche droite, Alt+Flèche haut, Retour arrière",
    "kbd.nav": "Précédent, suivant, dossier parent",
    "kbd.helpKeys": "?",
    "kbd.help": "Cette aide",

    "search.label": "Rechercher des fichiers et des dossiers",
    "search.in": "Rechercher dans {place}",
    "search.allSites": "Rechercher dans tous les sites",
    "search.tip": "Rechercher (Ctrl+F)",
    "search.clear": "Effacer la recherche",
    "search.open": "Rechercher",
    "search.close": "Fermer la recherche",
    "search.started": "Recherche dans {scope}…",
    "search.scopeAll": "tous les sites",
    "search.running": "Recherche dans {scope}… {folders}, {results} pour l'instant.",
    "search.done": `{results} pour «${NB}{query}${NB}» dans {scope}.`,
    "search.none": `Aucun résultat pour «${NB}{query}${NB}» dans {scope}.`,
    "search.capped": `Seuls les {n} premiers sont affichés${NB}: ajoutez des mots pour affiner la recherche.`,
    "search.truncated": `La recherche s'est arrêtée après {max} dossiers${NB}: ouvrez un sous-dossier pour y chercher en entier.`,
    "search.failed": { one: "{n} dossier n'a pas pu être lu.", other: "{n} dossiers n'ont pas pu être lus." },
    "count.results": { one: "{n} résultat", other: "{n} résultats" },
    "count.foldersRead": { one: "{n} dossier lu", other: "{n} dossiers lus" },

    "sc.newButton": "+ Nouveau site",
    "sc.menuNew": "Nouveau site…",
    "sc.menuEdit": "Modifier le site…",
    "sc.menuDelete": "Supprimer le site",
    "sc.titleNew": "Nouveau site",
    "sc.titleEdit": "Modifier le site",
    "sc.username": "Identifiant",
    "sc.custom": "Texte du libellé",
    "sc.customExample": `ex.${NB}: enregistreur du bureau`,
    "sc.host": "Hôte",
    "sc.port": "Port",
    "sc.password": "Mot de passe",
    "sc.passwordUnchanged": "Inchangé",
    "sc.passwordDefault": `Par défaut${NB}: l'identifiant`,
    "sc.passwordHint": "Laissez vide pour garder le mot de passe actuel. Obligatoire si vous changez l'hôte ou le port.",
    "sc.preview": `Aperçu du libellé${NB}:`,
    "sc.saving": "Enregistrement…",
    "sc.deleting": "Suppression…",
    "sc.confirmDelete": `Supprimer le site «${NB}{label}${NB}»${NNB}?\nPlus personne n'y aura accès.`,
    "sc.deleteFailed": `La suppression a échoué${NB}: {reason}`,

    "viewer.download": "Télécharger",
    "viewer.close": "Fermer",
    "viewer.closeTip": "Fermer (Échap)",
    "viewer.prev": "Précédent",
    "viewer.next": "Suivant",
    "viewer.prevTip": "Précédent (Flèche gauche, Pg. préc.)",
    "viewer.nextTip": "Suivant (Flèche droite, Pg. suiv.)",
    "viewer.position": "{n} sur {total}",
    "viewer.caption": "{camera} · {time}",
    "viewer.nameIn": "{name} dans {place}",
    "viewer.autoplay": "Lecture enchaînée",
    "viewer.autoplayNext": `Suivant${NB}: {caption}`,
    "viewer.downloadInstead": "Le télécharger",
    "viewer.cantPlay": "Ce fichier ne peut pas être lu dans ce navigateur (format ou codec non pris en charge). Téléchargez-le pour le regarder dans un autre lecteur.",
    "viewer.converting": "Conversion de la vidéo pour ce navigateur…",
    "viewer.badImage": "Cette image n'a pas pu être chargée, ou le navigateur ne sait pas afficher son format.",
    "viewer.zoomOut": "Zoom arrière",
    "viewer.zoomIn": "Zoom avant",
    "viewer.fit": "Ajuster",

    "size.units": ["o", "Ko", "Mo", "Go"],

    "page.error": "Erreur {status}",
    "page.back": "Retour à l'explorateur",

    "field.username": "Identifiant",
    "field.host": "Hôte",
    "field.label": "Libellé",

    "err.internal": "Erreur interne du serveur",
    "err.bodyTooLarge": "Requête trop volumineuse",
    "err.badJson": "Corps JSON mal formé",
    "err.expectedObject": "Un objet JSON était attendu",
    "err.crossOrigin": "Requête d'une autre origine refusée",
    "err.jsonOnly": `Content-Type attendu${NB}: application/json`,
    "err.signIn": "Connexion requise",
    "err.adminsOnly": "Réservé aux administrateurs",
    "err.method": "Méthode non autorisée",
    "err.notFound": "Introuvable",
    "err.badTarget": "Cible de requête invalide",
    "err.noShortcut": "Ce site n'existe pas",
    "err.notAFile": "Ce chemin ne désigne pas un fichier",
    "err.badPath": "Chemin invalide",
    "err.range": "Plage demandée invalide",
    "err.clientGone": "Le client s'est déconnecté",
    "err.ftpBusy": `Le serveur FTP est occupé (limite de connexions atteinte)${NNB}; réessayez dans un instant`,
    "err.ftpLogin": `Échec de la connexion au serveur FTP${NB}: {reply}`,
    "err.ftpNotFound": `Introuvable, ou accès refusé${NB}: {reply}`,
    "err.ftpRefused": `Le serveur FTP a refusé la connexion${NB}: {reply}`,
    "err.ftpAnswered": `Le serveur FTP a répondu${NB}: {reply}`,
    "err.ftpUnreachable": "Impossible de joindre le serveur FTP ({code})",
    "err.ftpSilent": "Le serveur FTP n'a pas répondu à temps",
    "err.ftpSlow": "Le serveur FTP a mis trop de temps à répondre",
    "err.ftpFailed": `La connexion FTP a échoué${NB}: {reason}`,
    "err.ftpUnknown": "erreur inconnue",
    "err.hostNotAllowed": "L'hôte de ce site n'est pas dans FTP_ALLOWED_HOSTS",
    "err.loginPaused": `{reason} (pas de nouvel essai pendant {minutes}${NB}min${NNB}; un administrateur doit vérifier ce site)`,
    "err.tooBigToPlay": `Ce fichier est trop gros pour être lu ici (plus de {mb}${NB}Mo)${NB}: téléchargez-le.`,
    "err.stillWriting": `Ce fichier est encore en cours d'écriture${NNB}; réessayez dans un instant`,
    "err.convertBusy": `Le serveur est occupé à convertir des vidéos${NNB}; réessayez dans un instant`,
    "err.noConverter": "Cette vidéo doit être convertie, mais le serveur n'a pas de convertisseur (ffmpeg). Téléchargez-la pour la regarder dans un lecteur vidéo.",
    "err.convertSlow": "La conversion de cette vidéo a pris trop de temps",
    "err.convertFailed": `Cette vidéo n'a pas pu être convertie${NB}: son format n'est pas pris en charge, ou le fichier est endommagé.`,
    "err.expectedShortcut": "Un objet site était attendu",
    "err.required": `Le champ «${NB}{field}${NB}» est obligatoire`,
    "err.tooLong": `Le champ «${NB}{field}${NB}» dépasse {max} caractères`,
    "err.controlChars": `Le champ «${NB}{field}${NB}» contient des caractères de contrôle`,
    "err.badHost": "L'hôte doit être un nom d'hôte ou une adresse IP",
    "err.hostNotInList": `L'hôte «${NB}{host}${NB}» n'est pas dans FTP_ALLOWED_HOSTS`,
    "err.badPort": "Le port doit être un nombre entier entre 1 et 65535",
    "err.passwordTooLong": "Le mot de passe dépasse 256 caractères",
    "err.passwordControl": "Le mot de passe contient des caractères de contrôle",
    "err.reenterPassword": "Saisissez de nouveau le mot de passe FTP quand vous changez l'hôte ou le port",
    "err.duplicate": `Un site existe déjà pour l'identifiant «${NB}{username}${NB}»`,
    "zip.tooltip": "Télécharger {n} fichiers (ZIP)",
    "zip.tooMany": "Sélectionnez au plus {max} fichiers par téléchargement.",
    "zip.oneSite": "Sélectionnez des fichiers d'un seul site.",
    "zip.preparing": "Préparation du téléchargement…",
    "zip.failed": `Le téléchargement n'a pas pu être préparé${NB}: {reason}`,
    "zip.errorsName": "ERREURS.txt",
    "zip.errorsIntro": `Ces fichiers n'ont pas pu être ajoutés à l'archive${NB}:`,
    "zip.errorLine": `{name}${NB}: {reason}`,
    "zip.incomplete": `{name}${NB}: incomplet, le transfert s'est arrêté après {size}`,
    "zip.full": `laissé de côté, l'archive est pleine (2${NB}Go au plus)`,
    "err.zipCount": "Sélectionnez entre 1 et {max} fichiers",
    "err.zipDuplicate": "Le même fichier figure deux fois",
    "err.zipExpired": `Ce lien de téléchargement a expiré${NB}: relancez le téléchargement.`,
    "err.zipBusy": `Trop de téléchargements sont en préparation${NNB}; réessayez dans un instant`,
  },
};

const LOCALES = { en: "en-GB", fr: "fr-FR" };
const valid = (lang) => (LANGUAGES.includes(lang) ? lang : "en");

export const msg = (key, params) => ({ key, params });

export function translate(lang, key, params = {}) {
  lang = valid(lang);
  let text = MESSAGES[lang][key] ?? MESSAGES.en[key];
  if (text === undefined) return key;   // a missing key shows itself instead of breaking the page
  if (typeof text === "object" && !Array.isArray(text)) {
    text = text[new Intl.PluralRules(LOCALES[lang]).select(params.n ?? 0)] ?? text.other;
  }
  return String(text).replace(/\{(\w+)\}/g, (slot, name) => {
    const value = params[name];
    if (value === undefined || value === null) return slot;
    if (typeof value === "object" && "key" in value) return translate(lang, value.key, value.params);
    if (typeof value === "number") return value.toLocaleString(LOCALES[lang]);
    return String(value);
  });
}

export function plural(lang, key, n, params = {}) {
  return translate(lang, key, { ...params, n });
}

// "fr-FR,fr;q=0.9,en;q=0.8" -> "fr". The cookie, set by the language switch,
// wins; then the browser's preferences; then English.
export function pickLanguage(cookie, accept) {
  if (LANGUAGES.includes(cookie)) return cookie;
  const ranked = String(accept ?? "").split(",").map((part, i) => {
    const [tag, ...attrs] = part.trim().toLowerCase().split(";");
    const q = attrs.map((a) => /^\s*q=([\d.]+)\s*$/.exec(a)).find(Boolean);
    return { lang: tag.split("-")[0], q: q ? Number(q[1]) : 1, i };
  }).filter((x) => LANGUAGES.includes(x.lang) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return ranked[0]?.lang ?? "en";
}

const numberFormats = new Map();
export function formatSize(bytes, lang = "en") {
  const n = Number(bytes) || 0;
  const [b, kb, mb, gb] = MESSAGES[valid(lang)]["size.units"];
  const fixed = (value, digits) => {
    const key = `${valid(lang)}:${digits}`;
    if (!numberFormats.has(key)) {
      numberFormats.set(key, new Intl.NumberFormat(LOCALES[valid(lang)], { minimumFractionDigits: digits, maximumFractionDigits: digits }));
    }
    return numberFormats.get(key).format(value);
  };
  if (n < 1024) return `${n} ${b}`;
  if (n < 1024 ** 2) return `${fixed(n / 1024, 1)} ${kb}`;
  if (n < 1024 ** 3) return `${fixed(n / 1024 ** 2, 1)} ${mb}`;
  return `${fixed(n / 1024 ** 3, 2)} ${gb}`;
}

// FTP listings print dates the Unix "ls" way, in English: "Apr 01 2026" for
// older files, "Apr 01 08:30" for recent ones (this year). MLSD gives
// "2026-04-01 08:30". Anything else is shown as it came.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export function formatDate(raw, lang = "en") {
  const text = String(raw ?? "");
  const locale = LOCALES[valid(lang)];
  let m = /^([A-Za-z]{3})\s+(\d{1,2})\s+(?:(\d{4})|(\d{1,2}):(\d{2}))$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month < 0) return text;
    const day = new Date(Date.UTC(m[3] ? Number(m[3]) : 2000, month, Number(m[2])));
    const date = day.toLocaleDateString(locale, m[3]
      ? { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" });
    return m[3] ? date : `${date} ${m[4].padStart(2, "0")}:${m[5]}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text);
  if (m) {
    const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return `${day.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} ${m[4]}:${m[5]}`;
  }
  return text;
}

// A time from util.parseTime, the way Windows lists it: "01/04/2026 14:34",
// with seconds when known, or the day alone. The app's English is en-GB, so
// both languages read the same. Built from local fields: thousands of rows
// are drawn at once.
const pad2 = (n) => String(n).padStart(2, "0");
export function formatDateTime(ms, precision = "minute") {
  const d = new Date(ms);
  const day = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (precision === "day") return day;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return precision === "second" ? `${day} ${time}:${pad2(d.getSeconds())}` : `${day} ${time}`;
}

// The long form, for tooltips: "mercredi 1 avril 2026 à 14:34:00".
const longFormats = new Map();
export function formatLongDateTime(ms, precision = "minute", lang = "en") {
  const key = `${valid(lang)}:${precision}`;
  let format = longFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(LOCALES[valid(lang)], {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      ...(precision !== "day" && { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
      ...(precision === "second" && { second: "2-digit" }),
    });
    longFormats.set(key, format);
  }
  return format.format(ms);
}

const dayFormats = new Map();
export function formatDayHeading(ms, lang = "en") {
  const locale = LOCALES[valid(lang)];
  if (!dayFormats.has(locale)) {
    dayFormats.set(locale, new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  }
  return dayFormats.get(locale).format(ms);
}

/* ---- in the browser ---- */

let pageLanguage = "en";

export function useLanguage(lang) {
  pageLanguage = valid(lang);
  return pageLanguage;
}

export const language = () => pageLanguage;
export const t = (key, params) => translate(pageLanguage, key, params);
export const tn = (key, n, params) => plural(pageLanguage, key, n, params);

// The page's language from the browser: the cookie, else its preferences.
export function browserLanguage() {
  const cookie = /(?:^|;\s*)qfe_lang=([^;]*)/.exec(document.cookie)?.[1];
  return pickLanguage(cookie, (navigator.languages || [navigator.language]).join(","));
}

// <x data-i18n="key"> gets its text; <x data-i18n-attr="placeholder:key; title:key">
// its attributes. Pages start hidden (class "i18n-pending") to avoid a flash
// of English; this shows them.
export function translatePage(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  for (const node of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of node.dataset.i18nAttr.split(";")) {
      const [attribute, key] = pair.split(":").map((s) => s.trim());
      if (attribute && key) node.setAttribute(attribute, t(key));
    }
  }
  document.documentElement.lang = pageLanguage;
  document.documentElement.classList.remove("i18n-pending");
}

export function switchLanguage(lang) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${valid(lang)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  location.reload();
}
