/*
 * login.js - explain why the previous sign-in attempt bounced back here.
 * The server redirects to /login?error=<code>; the form itself is plain HTML.
 */

const MESSAGES = {
  invalid: "Wrong username or password.",
  rate: "Too many failed attempts. Wait 15 minutes, then try again.",
  expired: "Your session has expired. Please sign in again.",
};

const code = new URLSearchParams(location.search).get("error");
const box = document.getElementById("login-error");
if (code && Object.hasOwn(MESSAGES, code)) {
  box.textContent = MESSAGES[code];
  box.hidden = false;
}
