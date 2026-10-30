/*
 * login.js - explain why the previous sign-in attempt bounced back here
 * (the server redirects to /login?error=<code>), and carry the URL
 * fragment through sign-in, so a shared link to a folder still opens that
 * folder. The form itself is plain HTML.
 */

// Browsers keep the fragment across the "/" -> "/login" redirect, but a
// form post would drop it: hand it to the server, which redirects back to it.
document.getElementById("next").value = location.hash;

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
