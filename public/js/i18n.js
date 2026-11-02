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
    "nav.pick": "Select a site",
    "nav.current": "Current folder",
    "nav.resize": "Drag to resize",
    "nav.refresh": "Refresh this folder",
    "nav.loadingFolder": "Loading folder…",
    "nav.refreshing": "Refreshing…",
    "count.sites": { one: "{n} site", other: "{n} sites" },
    "tree.noSubfolders": "(no subfolders)",
    "tree.emptyAdmin": "No sites yet. Click + New site (or right-click here) to add one.",
    "tree.emptyUser": "No sites yet. Ask an administrator to add some.",

    "files.pick": "Select a site to browse its files, or search them all from the top bar.",
    "files.empty": "(empty folder)",
    "col.name": "Name",
    "col.type": "Type",
    "col.size": "Size",
    "col.modified": "Modified",
    "type.folder": "Folder",
    "type.file": "File",
    "type.site": "Site",

    "search.label": "Search files and folders",
    "search.in": "Search {place}",
    "search.allSites": "Search all sites",
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
    "viewer.close": "Close (Esc)",
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
  },

  fr: {
    "common.loading": "Chargement…",
    "common.retry": "Réessayer",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.optional": "(facultatif)",
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
    "nav.pick": "Choisissez un site",
    "nav.current": "Dossier courant",
    "nav.resize": "Faites glisser pour redimensionner",
    "nav.refresh": "Actualiser ce dossier",
    "nav.loadingFolder": "Chargement du dossier…",
    "nav.refreshing": "Actualisation…",
    "count.sites": { one: "{n} site", other: "{n} sites" },
    "tree.noSubfolders": "(aucun sous-dossier)",
    "tree.emptyAdmin": "Aucun site pour l'instant. Cliquez sur + Nouveau site (ou faites un clic droit ici) pour en ajouter un.",
    "tree.emptyUser": "Aucun site pour l'instant. Demandez à un administrateur d'en ajouter.",

    "files.pick": "Choisissez un site pour parcourir ses fichiers, ou cherchez dans tous les sites depuis la barre du haut.",
    "files.empty": "(dossier vide)",
    "col.name": "Nom",
    "col.type": "Type",
    "col.size": "Taille",
    "col.modified": "Modifié le",
    "type.folder": "Dossier",
    "type.file": "Fichier",
    "type.site": "Site",

    "search.label": "Rechercher des fichiers et des dossiers",
    "search.in": "Rechercher dans {place}",
    "search.allSites": "Rechercher dans tous les sites",
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
    "viewer.close": "Fermer (Échap)",
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

export function formatSize(bytes, lang = "en") {
  const n = Number(bytes) || 0;
  const [b, kb, mb, gb] = MESSAGES[valid(lang)]["size.units"];
  const fixed = (value, digits) => value.toLocaleString(LOCALES[valid(lang)], { minimumFractionDigits: digits, maximumFractionDigits: digits });
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
