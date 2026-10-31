/*
 * login.js - the sign-in page in the reader's language, why the previous
 * attempt bounced back here (the server redirects to /login?error=<code>),
 * and the URL fragment carried through sign-in, so a shared link to a
 * folder still opens that folder. The form itself is plain HTML.
 */

import { useLanguage, browserLanguage, translatePage, switchLanguage, t } from "./i18n.js";

useLanguage(browserLanguage());
translatePage();
document.title = `${t("auth.pageTitle")} · Quick FTP Explorer`;

const langSwitch = document.getElementById("lang-switch");
langSwitch.textContent = t("lang.switch");
langSwitch.lang = t("lang.switchCode");
langSwitch.addEventListener("click", () => switchLanguage(t("lang.switchCode")));

// Browsers keep the fragment across the "/" -> "/login" redirect, but a
// form post would drop it: hand it to the server, which redirects back to it.
document.getElementById("next").value = location.hash;

const code = new URLSearchParams(location.search).get("error");
const box = document.getElementById("login-error");
if (["invalid", "rate", "expired"].includes(code)) {
  box.textContent = t(`auth.error.${code}`);
  box.hidden = false;
}
