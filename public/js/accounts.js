/*
 * accounts.js - the admins' "Comptes" dialog: who may sign in, and as what.
 *
 *   accounts.open(me)   show it; `me` is the signed-in admin's username
 *
 * A table of the accounts: each one's role can be changed, a new password
 * given, or the account deleted; a form below adds one. Passwords are
 * suggested here (strong, random) and shown once, after saving, so the admin
 * can pass them on: the server keeps only their hash. The server refuses to
 * let admins remove their own admin role or account, so one always remains.
 * Names reach the page as text only.
 */

import * as api from "./api.js";
import { el } from "./ui.js";
import { t, tn } from "./i18n.js";

let dialog = null, list = null, notice = null, error = null, form = null, fields = null;
let me = "";

// 16 characters from 12 random bytes: far beyond the 10 the server asks for.
function suggestPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function button(text, className, action) {
  const b = el("button", className, text);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}

/* ---- messages ---- */

function say(text) {
  error.hidden = true;
  notice.replaceChildren(el("p", "", text));
  notice.hidden = false;
}

// After saving a password: show it once, with a way to copy it.
function sayPassword(text, password) {
  error.hidden = true;
  const value = el("code", "acc-password", password);
  const copy = button(t("acc.copy"), "btn-secondary btn-sm", async () => {
    try {
      await navigator.clipboard.writeText(password);
      copy.textContent = t("acc.copied");
    } catch {
      getSelection().selectAllChildren(value);   // then Ctrl+C
    }
  });
  const line = el("p", "acc-password-line");
  line.append(document.createTextNode(t("acc.passwordIs", { password: "" })), value, copy);
  notice.replaceChildren(el("p", "", text), line, el("p", "muted", t("acc.passOn")));
  notice.hidden = false;
}

function fail(err) {
  notice.hidden = true;
  error.textContent = err.message;
  error.hidden = false;
}

/* ---- the table ---- */

function roleSelect(user) {
  const select = el("select", "acc-role");
  select.setAttribute("aria-label", t("acc.roleOf", { name: user.name }));
  for (const role of ["user", "admin"]) {
    const option = el("option", "", t(role === "admin" ? "acc.roleAdmin" : "acc.roleUser"));
    option.value = role;
    select.append(option);
  }
  select.value = user.role;
  if (user.name === me) {
    select.disabled = true;
    select.title = t("acc.selfTip");
  }
  select.addEventListener("change", async () => {
    try {
      await api.updateUser(user.name, { role: select.value });
      user.role = select.value;
      say(t("acc.roleChanged", { name: user.name, role: select.selectedOptions[0].textContent }));
    } catch (err) {
      select.value = user.role;
      fail(err);
    }
  });
  return select;
}

function render(users) {
  const rows = users.map((user) => {
    const tr = el("tr");
    const name = el("td", "acc-name", user.name);
    if (user.name === me) name.append(el("span", "muted", ` ${t("acc.you")}`));
    const actionsCell = el("td", "acc-actions-cell");
    const actions = el("div", "acc-actions");
    actionsCell.append(actions);
    const reset = button(t("acc.newPassword"), "btn-secondary btn-sm", async () => {
      if (!confirm(t("acc.confirmPassword", { name: user.name }))) return;
      const password = suggestPassword();
      try {
        await api.updateUser(user.name, { password });
        sayPassword(t("acc.passwordSet", { name: user.name }), password);
      } catch (err) {
        fail(err);
      }
    });
    reset.setAttribute("aria-label", t("acc.newPasswordFor", { name: user.name }));
    const remove = button(t("acc.delete"), "btn-secondary btn-sm acc-delete", async () => {
      if (!confirm(t("acc.confirmDelete", { name: user.name }))) return;
      try {
        await api.deleteUser(user.name);
        say(t("acc.deleted", { name: user.name }));
        await refresh();
      } catch (err) {
        fail(err);
      }
    });
    remove.setAttribute("aria-label", t("acc.deleteName", { name: user.name }));
    if (user.name === me) {
      remove.disabled = true;
      remove.title = t("acc.selfTip");
    }
    actions.append(reset, remove);
    const role = el("td");
    role.append(roleSelect(user));
    tr.append(name, role, actionsCell);
    return tr;
  });
  list.tBodies[0].replaceChildren(...rows);
  list.caption.textContent = tn("acc.count", users.length);
}

async function refresh() {
  try {
    render(await api.users());
  } catch (err) {
    fail(err);
  }
}

/* ---- the dialog ---- */

function build() {
  dialog = el("dialog", "modal accounts");
  dialog.id = "accounts-dialog";
  dialog.setAttribute("aria-labelledby", "accounts-title");
  const title = el("h3", "", t("acc.title"));
  title.id = "accounts-title";
  notice = el("div", "acc-notice");
  notice.setAttribute("role", "status");
  notice.hidden = true;
  error = el("p", "form-error");
  error.setAttribute("role", "alert");
  error.hidden = true;

  list = el("table", "acc-table");
  list.createCaption().className = "acc-caption";
  const head = list.createTHead().insertRow();
  for (const key of ["acc.name", "acc.role", "acc.actions"]) {
    const th = el("th", "", t(key));
    th.scope = "col";
    head.append(th);
  }
  list.createTBody();

  // The new account's form.
  form = el("form", "acc-form");
  const field = (label, input, hint) => {
    const box = el("div", "field");
    const l = el("label", "", label);
    l.htmlFor = input.id;
    box.append(l, input);
    if (hint) {
      const h = el("p", "field-hint muted", hint);
      h.id = `${input.id}-hint`;
      input.setAttribute("aria-describedby", h.id);
      box.append(h);
    }
    return box;
  };
  fields = {
    name: Object.assign(el("input"), { id: "acc-new-name", type: "text", required: true, autocomplete: "off", spellcheck: false }),
    role: el("select"),
    password: Object.assign(el("input"), { id: "acc-new-password", type: "text", required: true, autocomplete: "new-password", spellcheck: false }),
  };
  fields.role.id = "acc-new-role";
  for (const role of ["user", "admin"]) {
    const option = el("option", "", t(role === "admin" ? "acc.roleAdmin" : "acc.roleUser"));
    option.value = role;
    fields.role.append(option);
  }
  fields.password.minLength = 10;
  const passwordBox = field(t("acc.password"), fields.password, t("acc.passwordHint"));
  passwordBox.append(button(t("acc.generate"), "btn-secondary btn-sm", () => { fields.password.value = suggestPassword(); }));
  const row = el("div", "field-row");
  row.append(field(t("acc.name"), fields.name, t("acc.nameHint")), field(t("acc.role"), fields.role));
  const submit = el("button", "", t("acc.create"));
  submit.type = "submit";
  form.append(el("h4", "", t("acc.newTitle")), row, passwordBox, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = fields.password.value;
    try {
      const { name } = await api.createUser({ name: fields.name.value.trim(), role: fields.role.value, password });
      sayPassword(t("acc.created", { name }), password);
      fields.name.value = "";
      fields.role.value = "user";
      fields.password.value = suggestPassword();
      await refresh();
    } catch (err) {
      fail(err);
    }
  });

  const actions = el("div", "modal-actions");
  actions.append(button(t("common.close"), "", () => dialog.close()));
  dialog.append(title, el("p", "muted acc-intro", t("acc.intro")), notice, error, list, form, actions);
  document.body.append(dialog);
}

async function open(name) {
  me = name;
  if (!dialog) build();
  notice.hidden = error.hidden = true;
  fields.password.value = suggestPassword();
  await refresh();
  if (!dialog.open) dialog.showModal();
  fields.name.focus();
}

export const accounts = { open };
