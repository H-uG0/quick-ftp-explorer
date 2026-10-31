# Quick FTP Explorer &mdash; User Manual (English)

Quick FTP Explorer lets you browse the FTP servers your organisation has
saved as **shortcuts**, and open the files they contain &mdash; camera
footage, snapshots, PDFs &mdash; right in your web browser. This manual
covers daily use and, in [§8](#8-managing-shortcuts-administrators), the
shortcut management reserved to administrators.

> Looking for the original Windows application (`.hta`)? Its manual is in
> [`legacy/docs/`](../legacy/docs/user-manual.en.md).

---

## 1. Overview

- Browse each shortcut's folders in a two-panel, File-Explorer-style
  layout.
- Open files without leaving the page: images in a built-in viewer, video
  and audio in the browser's player, PDFs and text in a new tab. Other
  files are downloaded.
- Search shortcuts and file names as you type.
- Nothing to install: everything runs on your organisation's server, and
  you use it through a web address.

Quick FTP Explorer is **read-only**: it never uploads, renames or deletes
anything on the FTP servers.

---

## 2. What you need

- A recent web browser: Chrome, Edge, Firefox or Safari, on a computer, a
  tablet or a phone.
- The **address** of your Quick FTP Explorer, for example
  `https://files.example.com`.
- An **account**: a username and a password given to you by an
  administrator. Accounts are personal; don't share yours.

---

## 3. Signing in and out

1. Open the address in your browser. You land on the **Sign in** page.
2. Enter your username (upper or lower case doesn't matter) and your
   password, then click **Sign in**.

Messages you may see on the sign-in page:

| Message | Meaning |
|---|---|
| *Wrong username or password.* | Check both and try again. |
| *Too many failed attempts. Wait 15 minutes, then try again.* | After 10 failed attempts the account (and your computer's address) is locked for 15 minutes, even with the right password. |
| *Your session has expired. Please sign in again.* | Sessions last 12 hours by default; you were signed out automatically. |

To sign out, click **Sign out** at the right end of the status bar.
Closing the tab does not sign you out; on a shared computer, always sign
out.

Your password manager can remember your credentials: the sign-in page is a
standard form.

---

## 4. The interface

```
+----------------------------------------------------------------------+
| ▣ Quick FTP Explorer | shortcut › folder › folder    | ↻ | Search... |  top bar
+------------------------+---------------------------------------------+
| SHORTCUTS      + New   | Name              Type   Size   Modified    |
| ▾ main-nvr Office      | Images            Folder        Apr 01 2026 |
|   ▸ Images             | clip 08h00.mp4    MP4    12 MB  Apr 01 2026 |
|   ▸ Videos             | snapshot.jpg      JPG    98 KB  Apr 01 2026 |
| ▸ back-office          |                                             |
+------------------------+---------------------------------------------+
| 2 shortcuts                       Signed in as alice   Sign out      |  status bar
+----------------------------------------------------------------------+
```

### 4.1 Top bar

- **Breadcrumb** &mdash; where you are: the shortcut, then each folder.
  Click any segment except the last to go back up to it.
- **↻ Refresh** &mdash; reloads the current folder from the server. Folder
  contents are remembered while the page is open, so use this to see files
  that appeared since (new recordings, for instance).
- **Search** &mdash; see [§7](#7-searching).

### 4.2 Left panel &mdash; shortcuts and folders

Each shortcut, shown with a camera icon, is the root of a tree that shows
**folders only**; files appear on the right.

- **Click a row** to show its contents on the right; it also opens the
  folder in the tree.
- **Click the triangle** (▸ / ▾) to open or close a folder in the tree
  without changing what the right panel shows.
- A ◌ triangle means the folder is loading. Errors appear in red under the
  folder; click it again to retry.

Drag the thin border between the two panels to resize them. The browser
remembers the width.

### 4.3 Right panel &mdash; files

A table of the current folder: **Name**, **Type**, **Size**, **Modified**.
Folders come first, then files, in natural order (`clip 2` before
`clip 10`).

- **Click a folder** to enter it.
- **Click a file** to open it (see [§6](#6-opening-files)).
- With the keyboard: `Tab` moves between rows, `Enter` opens.

If a folder can't be listed, the reason appears with a **Retry** button.

### 4.4 Status bar

The number of shortcuts, who is signed in (and whether you are an
administrator), and **Sign out**.

---

## 5. Browsing

1. Click a shortcut. Its folders appear in the tree and its contents on
   the right.
2. Click folders &mdash; in the tree, in the table, or in the breadcrumb
   &mdash; to move around.
3. Click **↻** when you expect new files.

Each folder is loaded once and then remembered until you reload the page
or press **↻**, so going back is instant. The first time, the server
connects to the FTP server for you; on slow servers a small *Loading
folder…* indicator appears in the bottom-right corner.

### 5.1 Links, bookmarks and the Back button

The address bar always shows the folder you are in, for example
`https://files.example.com/#/main-nvr/Images/2026`. So:

- the browser's **Back** and **Forward** buttons move between the folders
  you visited;
- you can **bookmark** a folder, or **send its address** to a colleague:
  it opens that folder for anyone who can sign in (after the sign-in page,
  if needed);
- reloading the page keeps you where you were.

A link to a shortcut that no longer exists simply opens the start page.

### 5.2 On a phone

On narrow screens the shortcuts panel slides in from the left: tap **☰**
in the top bar to show it, then tap a shortcut or folder; the panel closes
by itself and the files fill the screen. Tap **☰** again (or outside the
panel) to switch back. To keep the table readable, only the **Name** and
**Size** columns are shown.

---

## 6. Opening files

What happens when you click a file depends on its type:

| Type | Examples | What happens |
|---|---|---|
| Images | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.bmp` | Built-in image viewer ([§6.1](#61-image-viewer)) |
| Video | `.mp4` `.m4v` `.webm` `.mov` `.avi` `.mkv` `.dav` `.264` | Built-in player, with seeking ([§6.2](#62-video-and-audio)) |
| Audio | `.mp3` `.wav` `.ogg` `.m4a` `.aac` `.flac` | Built-in player |
| PDF and text | `.pdf` `.txt` `.log` | Opens in a new browser tab |
| Everything else | `.docx` `.xlsx` `.zip` `.html` `.svg`… | Downloaded to your Downloads folder |

Files are streamed from the FTP server through Quick FTP Explorer and are
not kept on the server. The one exception: a video that needs converting
stays in the server's memory for a few minutes, so replaying it or seeking
in it is quick.

### 6.1 Image viewer

A dark overlay fills the window.

- **Fit** &mdash; the whole image fits the window (default).
- **100%** &mdash; actual size.
- **− / +** &mdash; zoom out / in. The **mouse wheel** zooms too.
- **Drag** the image to move around when it is larger than the window.
- **Download** &mdash; saves the file.
- **Close (Esc)** &mdash; or press `Esc`, or click outside the image area.

### 6.2 Video and audio

Videos play in the browser's own player: play, pause, volume, full screen,
and **seeking** &mdash; you can jump anywhere in a long recording without
downloading it first.

Many cameras record in formats browsers can't play, such as XviD (MPEG-4)
in `.avi` files. Quick FTP Explorer converts those on the server when you
open them: *Loading…* or *Converting the video for this browser…* shows for
a moment, then the video plays like any other.

A few videos still can't play in the browser: a damaged file, or one larger
than the server's conversion limit (50 MB unless your administrator changed
it). The viewer then says why and offers **Download it instead**; open the
downloaded file with your usual player (VLC, the recorder vendor's
player…).

### 6.3 Why some files always download

Web pages (`.html`), vector images (`.svg`) and similar files can contain
code. If the browser displayed them inside Quick FTP Explorer, that code
would run with your session. They are therefore always **downloaded**,
never displayed &mdash; even though, for example, an `.svg` is an image.

### 6.4 If the PDF tab doesn't open

Some browsers block new tabs opened by a page. If clicking a PDF does
nothing, allow pop-ups for the Quick FTP Explorer address.

---

## 7. Searching

Type in the **Search** box in the top bar to find **files and folders** by
name:

- With a folder open, it searches that folder **and all its subfolders**.
  The box says where, for example *Search Images*.
- With nothing open, it searches **every site**, and lists matching sites
  first.

Results appear on the right as you type. Each one shows, under its name,
the folder it is in, with the matching part highlighted. Click a file to
open it, or a folder or site to go there. **Search all sites** widens a
search to every site.

- Upper/lower case and accents don't matter: `ete` finds `Été`.
- Several words must all appear, in any order: `garage 0830` finds
  `1234_Garage 1_20261030083000.avi`.
- Clear the box, or press `Esc`, to get back to the folder.

The first search of a place reads its folders from the server, which can
take a few seconds on a big site; searching there again is instant. One
search reads at most 300 folders: to search deeper, open a subfolder first.

---

## 8. Managing shortcuts (administrators)

Only accounts with the **admin** role see the **+ New** button and the
right-click menu in the left panel. Shortcuts are shared: every change is
immediately visible to everyone (after they reload the list, for instance
by reloading the page).

### 8.1 Creating a shortcut

Click **+ New** (or right-click in the left panel → **New shortcut…**).

| Field | Notes |
|---|---|
| **Username** | The FTP account. Required. It also identifies the shortcut, so two shortcuts can't share a username. |
| **Custom label text** | Optional. The label shown in the tree is the username followed by this text, e.g. `main-nvr Main office`. The preview below shows the result. |
| **Host** and **Port** | The FTP server. Prefilled with your organisation's defaults. |
| **Password** | Defaults to the username, and follows it as you type until you type a password of your own. |

Click **Save**. Problems are shown at the top of the form, for example
*A shortcut for username "…" already exists* or *Username contains control
characters*.

### 8.2 Editing a shortcut

Right-click the shortcut → **Edit shortcut…**.

- The password field is **empty**: saved passwords are never sent to
  browsers. Leave it empty to keep the current password.
- **If you change the host or the port, you must type the password
  again.** This prevents anyone from sending a stored password to a
  different server.
- Changing the **username** renames the shortcut. If you were browsing it,
  the view restarts from its root.

### 8.3 Deleting a shortcut

Right-click the shortcut → **Delete shortcut**, then confirm. Everyone
loses access to it at once.

---

## 9. Keyboard shortcuts

| Key | Action |
|---|---|
| `Esc` | Close the viewer, the shortcut dialog, the right-click menu or the phone's shortcuts panel |
| `Alt+←` / `Alt+→` | The browser's Back / Forward: previous / next folder |
| `Tab` / `Shift+Tab` | Move between file rows |
| `Enter` | Open the focused file or folder |

---

## 10. Troubleshooting

| Message or symptom | What to do |
|---|---|
| *FTP login failed: 530 …* | The shortcut's FTP username or password is wrong, or the account was changed on the FTP server. Tell an administrator. |
| *… (not retried for 5 min; an admin should check this shortcut)* | After a failed FTP login, the shortcut pauses for 5 minutes so repeated attempts don't get the server blocked. It resumes on its own, or at once when an administrator saves the shortcut. |
| *Not found, or no permission* | The folder or file was moved or deleted, or the FTP account may not read it. Press **↻** on the parent folder. |
| *The FTP server is busy …* | Too many people are using that server at once. Wait a few seconds and retry. |
| *Can't reach the FTP server* / *did not answer in time* / *took too long* | The FTP server is down, unreachable or very slow. Retry later; tell an administrator if it persists. |
| *The server can't be reached* | Your own connection to Quick FTP Explorer dropped. Check your network. |
| A video shows *can't be played in this browser* | See [§6.2](#62-video-and-audio): download it and use another player. |
| A download fails in the browser's download list | Usually one of the FTP problems above; retry, or open the file's folder again to check it still exists. |
| Clicking a PDF does nothing | Allow pop-ups for the site ([§6.4](#64-if-the-pdf-tab-doesnt-open)). |
| You are sent back to the sign-in page | Your session expired or your account was changed. Sign in again. |

---

## 11. Privacy and data

- **Passwords.** Your account password is stored only as a salted hash.
  FTP passwords are stored on the server and are never shown in any page.
- **Audit trail.** For accountability, the server records sign-ins, changes
  to shortcuts, and which folders and files each user opened, with the time
  and the network address. Recordings from cameras are personal data; ask
  your administrator about your organisation's retention rules.
- **Your computer.** Files you open are not kept by the browser's cache.
  Downloaded files go to your Downloads folder like any download; delete
  them when you no longer need them.
- **The server** streams files from the FTP server to you without storing
  them.

---

## 12. FAQ

**Do I need to install anything?**
No. A recent browser is enough.

**Can I use it on a phone or tablet?**
Yes. Everything works with touch. On a phone, the shortcuts panel opens
with the **☰** button ([§5.2](#52-on-a-phone)).

**Can I send a colleague a link to a folder?**
Yes: copy the address bar ([§5.1](#51-links-bookmarks-and-the-back-button)).
They need their own account to open it.

**Can I upload, rename or delete files?**
No. Quick FTP Explorer is read-only by design.

**How do I change my password, or get an account for a colleague?**
Ask an administrator.

**Why can't I see the FTP server's address?**
Only administrators need it. Everyone else just sees the shortcut labels.

**I see a folder called `latest` (or similar) that opens as a file.**
It is probably a link on the FTP server. Links are shown as files; open the
folder they point to directly.
