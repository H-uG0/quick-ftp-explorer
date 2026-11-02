# Quick FTP Explorer &mdash; User Manual (English)

Quick FTP Explorer lets you browse the FTP servers of your organisation's
**sites**, and open the files they contain &mdash; camera footage,
snapshots, PDFs &mdash; right in your web browser. It works like Windows
File Explorer: the sites on the left, the files on the right, the newest
first. This manual covers daily use and, in
[§8](#8-managing-sites-administrators), the site management reserved to
administrators.

> Looking for the original Windows application (`.hta`)? Its manual is in
> [`legacy/docs/`](../legacy/docs/user-manual.en.md).

---

## 1. Overview

- Browse each site in a two-panel layout like File Explorer's: the sites on
  the left; on the right, a list with each file's **Name**, **Camera**,
  **Date** and **Size**, the newest first.
- Sort by any column, and narrow the list with **filters**: a period (the
  last hour, today, around a given time…), a camera, a type of file.
- Select several clips the way you do in Windows, and download them in one
  go, as a single ZIP file.
- Open files without leaving the page: videos, images and audio in a
  viewer that steps from clip to clip with **Previous** and **Next**; PDFs
  and text in a new tab. Other files are downloaded.
- Search sites and file names as you type.
- Send a colleague a link to a folder or to one clip. The browser's
  **Back** button brings back what you were looking at.
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

To sign out, click **Sign out** at the right end of the status bar (on a
phone, at the foot of the **☰** panel). Closing the tab does not sign you
out; on a shared computer, always sign out.

Your password manager can remember your credentials: the sign-in page is a
standard form.

---

## 4. The interface

```
+----------------------------------------------------------------------------------------------+
| ▣ Quick FTP Explorer   ← → ↑   All sites › 1234 Résidence        ↻   [Search 1234 Résidence] |  top bar
+----------------------+-----------------------------------------------------------------------+
| SITES     + New site | Open  Download  Copy link   Sort [Newest first ▾]                     |  command bar
| [Find a site     ]   | Period [Any date ▾]   Camera [All cameras (81) ▾]                     |
|   All sites          +-----------------------------------------------------------------------+
|   1234 Résidence     | [ ] Name                           Camera  Date ↓              Size   |  the list
|   5678 Entrepôt      | Today — Sunday, 1 November 2026 · 12 items                            |
| ▸ 9012 Dépôt         |     1234_Cam 2_202611011615.avi    Cam 2   01/11/2026 16:15  2.0 KB   |
|                      |     1234_Cam 1_202611011558.avi    Cam 1   01/11/2026 15:58  1.9 KB   |
|                      |     1234_Cam 2_202611011541.avi    Cam 2   01/11/2026 15:41  2.0 KB   |
|                      | …                                                                     |
+----------------------------------------------------------------------------------------------+
| 81 items · Updated at 16:20                  Signed in as alice   Help   Français   Sign out |  status bar
+----------------------------------------------------------------------------------------------+
```

The interface follows your browser's language: French, or English. To
change it, click **Français** in the status bar (on a phone, at the foot of
the **☰** panel) or on the sign-in page; that browser remembers the choice.

Lost? Press `?`, or click **Help** in the status bar: it gives three tips
for finding a clip, and the keyboard shortcuts.

### 4.1 Top bar

- **← → ↑** &mdash; **Back**, **Forward** and **Up**, as in File Explorer.
  Back and Forward move through the places you visited in this tab. Back
  never leaves Quick FTP Explorer, and Forward is greyed out when there is
  nothing ahead. Up opens the folder above, or **All sites** from a site,
  and selects the folder or site you came from. The same keys as in
  Windows work: `Alt+←`, `Alt+→`, `Alt+↑`, and `Backspace` for Back.
- **Breadcrumb** &mdash; where you are: **All sites**, then the site, then
  each folder. Every part but the last is a link: click it to go there,
  `Ctrl`+click it or middle-click it to open it in a new tab, or
  right-click it to copy its address.
- **↻** (Refresh this folder) &mdash; reloads the open folder from the
  server. The list stays on screen while it reloads, with your selection
  and your place in it; files that appeared meanwhile are tagged **New**
  ([§5.3](#53-new-files)). If the refresh fails, the list stays as it was
  and a line above it says why, with **Retry**.
- **Search** &mdash; `Ctrl+F` or `F3` puts you in the box; see
  [§7.1](#71-the-search-box).

### 4.2 Sites panel

The left panel starts with **All sites**, then lists each site, shown with
a camera icon. Under a site, the tree shows **folders only**; files appear
on the right.

- **Click a row** to show its contents on the right; a site or folder also
  opens in the tree.
- **Click the chevron** (▸) to open or close a folder in the tree without
  changing what the right panel shows. Once a site or folder turns out to
  have no subfolders, its chevron goes away. While a folder loads, a small
  spinner takes the chevron's place. Errors appear in red under the
  folder; click it again to retry.
- **Find a site** &mdash; type part of a site's name: only the sites that
  match every word you type stay, with the words highlighted (case and
  accents don't matter). `Enter` opens the first match, `↓` moves into the
  tree, `Esc` clears the box. **All sites** and the site you are in always
  stay.
- **With the keyboard**, the tree is a single stop of the `Tab` key. `↑`
  and `↓` move, `→` opens a branch or goes into it, `←` closes it or goes
  to its parent, `Home` and `End` go to the ends, and `Enter` or `Space`
  shows the item on the right. Typing the first letters or digits of a
  name jumps to it. The arrows never open anything on their own: each
  opening asks the FTP server for a listing.

The thin border between the two panels resizes them: drag it, or click it
(each click steps through three widths), or reach it with `Tab` and use `←`
and `→` (with `Shift`, in bigger steps), `Home`, `End`, or `Enter` for the
usual width. The browser remembers the width.

### 4.3 The list

With no site open, the right panel lists **All sites**, in alphabetical
order: double-click one, or press `Enter`, to open it. In a site, it lists
the open folder: its folders first, then its files.

**Columns.**

| Column | What it shows |
|---|---|
| **Name** | The name of the file, folder or site. |
| **Camera** | The camera, read from the clip's name. The column appears when at least one name carries a camera. |
| **Date** | When the clip was recorded, read from its name; otherwise when the file was last changed, according to the FTP server. |
| **Size** | The file's size. |

**Where the date comes from.** Recorders name their clips after the camera
and the time, for example `1234_Cam 1_202611011558.avi`: site `1234`,
camera `Cam 1`, recorded on 1 November 2026 at 15:58. Quick FTP Explorer
reads names of the form *site_camera_time* or *camera_time*, where the time
is written `YYYYMMDDhhmm`, `YYYYMMDDhhmmss` (with seconds), or as a Unix
time (10 digits). When a name gives no time, the date is the one the FTP
server gives for the file. Dates are shown in your computer's local time,
the way Windows lists them: `01/11/2026 15:58`, with seconds only when the
name has them. Point at a date to see where it comes from, and the FTP
server's time as well. A date the server didn't give in a form Quick FTP
Explorer can read is shown as the server wrote it, greyed out.

**Sorting.** The list starts with the **newest files first**. Click a
column header to sort by it: the first click puts the latest dates and the
largest sizes first, and names and cameras from A to Z; click it again to
reverse the order. The **Sort** list in the command bar does the same, in
words ([§4.4](#44-command-bar)). Folders always stay above the files, and
files without a date go last. The browser remembers your choice; All sites
is always sorted by name (click **Name** to reverse it).

**Day headings.** Sorted by date, the list is split by day:
*Today — Sunday, 1 November 2026 · 12 items*, *Yesterday — …*, then one
heading per earlier day, and *Unknown date* for files without one. While
you scroll, the heading of the day you are in stays at the top.

**Selecting.** As in File Explorer, a click **selects** and a
**double-click opens**:

- click a row to select it alone; `Ctrl`+click adds or removes one row;
  `Shift`+click selects every row from the last one you clicked to this one
  (`Ctrl+Shift`+click adds them to the selection);
- the check box at the start of a file's row adds or removes it, and leaves
  the others selected. The boxes show when you point at a row, and on every
  row once something is selected. The box in the header selects every file
  shown, or none;
- `Ctrl+A` selects every file shown (not the folders);
- click the empty space below the rows, or press `Esc`, to clear the
  selection.

Selected rows are tinted, with a bar on their left and a tick in their
box. The status bar counts them and adds up their size
([§4.5](#45-status-bar)). Changing the sort, a filter or refreshing keeps
the selection (files a filter hides leave it); opening another folder
clears it.

**Opening.** Double-click a row, or select it and press `Enter` or click
**Open**. A folder or a site opens on the right; a file opens as described
in [§6](#6-opening-files). On a touch screen, one tap opens. Until you have
opened something this way once, the status bar reminds you:
*Double-click (or press Enter) to open.*

**With the keyboard**, the list is a single stop of the `Tab` key; the
**Skip to the file list** button, the first stop on the page, takes you
straight there. Then:

- `↑`, `↓`, `Home`, `End`, `Page Up` and `Page Down` move and select;
- with `Shift` they extend the selection; with `Ctrl` they move without
  changing it;
- `Space` selects or unselects the row you are on;
- `Enter` opens it, and `Shift+F10` or the Menu key opens its menu
  ([§4.6](#46-right-click-menus)).

On All sites, typing the first letters of a site jumps to it.

If a folder can't be listed, the reason appears with a **Retry** button. An
empty folder says *(empty folder)*.

### 4.4 Command bar

Above the list, in a folder and in search results:

- **Open** &mdash; opens the selected item. With several files selected, it
  opens the first one in the viewer, which then steps through the selected
  files only.
- **Download** &mdash; downloads the selected file. With several files
  selected it reads **Download (3)** and downloads them as one ZIP file
  ([§6.4](#64-downloading-several-files-as-one-zip)). Folders in the
  selection are left out.
- **Copy link** &mdash; copies a link to the selected item, or to the open
  folder when nothing is selected. With several items selected it reads
  **Copy links** and gives one link per line
  ([§5.1](#51-links-bookmarks-and-the-back-button)).
- **Sort** &mdash; the order, in words: *Newest first*, *Oldest first*,
  *Name (A to Z)*, *Name (Z to A)*, *Camera (A to Z)* and *Camera (Z to A)*
  (when there is a Camera column), *Largest first*, *Smallest first*.
- **Period**, **Camera** and **Type** &mdash; the filters
  ([§7.2](#72-filters)). **Clear filters** appears while one is on.

Buttons that can't act on the current selection are greyed out, as in File
Explorer; point at a greyed-out **Download** to see why. In a narrow window
the bar wraps onto a second line. On All sites there is no command bar.

### 4.5 Status bar

On the left:

- the number of items: *81 items*, or *12 of 81 items* when filters hide
  some; *128 results* (or *12 of 128 results*) during a search; *3 sites*
  on All sites;
- the selection: *3 items selected (5.8 KB)*, the size adding up the
  selected files;
- *Updated at 16:20*: when the list on screen was read from the FTP server;
- the reminder on how to open, until you have opened something once.

On the right: who is signed in (and whether you are an administrator),
**Help**, **Français** to switch the interface to French, and **Sign out**.
On a phone the status bar is hidden, and these move to the foot of the
**☰** panel.

### 4.6 Right-click menus

Right-click anything in the list or in the Sites panel for its commands.
From the keyboard, press `Shift+F10` or the Menu key on the row or the tree
item you are on; then `↑` and `↓` choose, `Enter` runs the command, and
`Esc` closes the menu. Right-clicking a row that isn't selected selects it
first; on a selected row, the menu acts on the whole selection.

| Right-click on | Commands |
|---|---|
| A file | **Open**, **Download** (or **Download (n)**), **Copy link**, **Open file location** (in search results), **Select all** |
| A folder or a site, in the list | **Open**, **Open in new tab**, **Copy link** |
| A site or a folder, in the Sites panel | **Open**, **Open in new tab** |
| **All sites**, in the Sites panel | **Open** |
| The empty part of the list | **Refresh this folder**, **Select all** |

Administrators also find **Edit site…** and **Delete site** on sites, and
**New site…** on the empty part of the Sites panel
([§8](#8-managing-sites-administrators)). In the list, a middle click on a
folder or a site opens it in a new tab. Links, such as the breadcrumb's,
and text boxes keep the browser's own menu.

---

## 5. Browsing

1. Quick FTP Explorer opens on **All sites**, which lists every site.
   Double-click one, or click it in the Sites panel.
2. Move around by double-clicking folders in the list, by clicking them in
   the tree, or with the breadcrumb; **↑** goes up a level.
3. Click **↻** when you expect new files &mdash; or let Quick FTP Explorer
   tell you ([§5.3](#53-new-files)).

Each folder is loaded once and then remembered while the page is open, so
going back is instant. If you come back to a folder more than a minute
after it was loaded, it shows at once and is quietly reloaded behind the
scenes. The first time, the server connects to the FTP server for you; on
slow servers a small *Loading folder…* indicator appears in the
bottom-right corner.

### 5.1 Links, bookmarks and the Back button

The address bar always shows where you are, for example
`https://files.example.com/#/1234/Cameras`. So:

- you can **bookmark** a folder, or **send its address** to a colleague:
  it opens that folder for anyone who can sign in (after the sign-in page,
  if needed);
- **Copy link**, in the command bar, the right-click menus and the viewer,
  copies a link for you: to the selected file or folder, or to the open
  folder when nothing is selected, and one link per line for several items.
  *Link copied.* confirms it. On a phone or a tablet that can share, it
  reads **Share link** and opens the share sheet. If the browser doesn't
  let the page copy, a small window shows the link, selected: press
  `Ctrl+C`;
- a link to a **clip** opens its folder, then the clip in the viewer, for
  example
  `https://files.example.com/#/1234/Cameras?open=1234_Cam%201_202611011558.avi`.
  If the file is gone, the folder opens with *This file is no longer in
  this folder.*;
- the browser's **Back** and **Forward** buttons, like **←** and **→**,
  move between the places you visited, and **Back closes the viewer**
  first when it is open;
- each place remembers how you left it: the search, the filters, the
  selection and how far you had scrolled. Back, Forward and reloading the
  page (`F5`) bring all of that back. Going somewhere new starts with a
  clean view, in your usual sort order.

A link to a site that no longer exists, or that you can't see, simply
opens All sites.

### 5.2 On a phone

```
+----------------------------------------------+
| ☰  1234 Résidence                      ⌕   ↻ |  top bar
+----------------------------------------------+
| [Newest first         ▾]  [Filters (1)]  [✓] |  Sort, Filters, Select
| [Today ×]                     12 of 81 items |  while a filter is on
+----------------------------------------------+
| Today — Sunday, 1 November 2026 · 12 items   |
| 1234_Cam 2_202611011615.avi                  |  the whole name,
|   16:15 · Cam 2 · 2.0 KB                     |  then time · camera · size
| 1234_Cam 1_202611011558.avi                  |
|   15:58 · Cam 1 · 1.9 KB                     |
+----------------------------------------------+
```

On narrow screens (700 pixels wide or less, so most phones):

- **The top bar** holds **☰**, which opens the Sites panel, the name of
  the place you are in, **⌕**, which lays the search box over the bar
  (**←** closes it and clears the search), and **↻**. There are no
  **← → ↑** buttons: use your phone's Back gesture, which also closes the
  viewer.
- **The Sites panel** slides in from the left, with **Find a site** at the
  top. Tap a site or a folder and the panel closes by itself; tap outside
  it to close it. Its foot holds who is signed in, **Help**, **Français**
  and **Sign out**.
- **Sort and filters** sit under the top bar: the **Sort** list and
  **Filters**, which opens a panel from the bottom with Period, Camera and
  Type. Changes apply at once; **Show 12 items** closes the panel. While a
  filter is on, the button reads **Filters (1)**, and a line of chips names
  each filter, with the count: tap a chip to remove its filter.
- **The list** shows each name in full, then a line with the date, the
  camera and the size (just the time, under a day heading). One tap opens a
  file or a folder.
- **Selecting**: tap **✓** (**Select**) to put a check box on every file.
  Taps then tick files instead of opening them, and a bar at the bottom
  shows how many are selected, with **Select all**, a link button and a
  **Download** button (one ZIP for several files). **×**, `Esc`, leaving
  the folder or unticking the last file ends selection mode.
- **The viewer** keeps **×** (Close) and the caption at the top, and puts
  **Previous**, the position, **Next**, the link and **Download** in a bar
  at the bottom, within reach of your thumb.

The status bar is hidden on phones.

### 5.3 New files

While a folder is open, Quick FTP Explorer checks it for new files every
minute, as long as the tab is visible, you have used the page in the last
half hour, and no search, viewer, menu or window is open. It never slips
new rows in under your pointer: a quiet line above the list says
*2 new files · Show*. Click **Show** to put them in their place in the
list, tagged **New** for 10 minutes or until you open them; your selection
and your place in the list stay as they were. Files that disappeared from
the server leave the list at the same time, or on their own when nothing
new arrived. **↻** tags new files the same way.

When you come back to the tab after more than a minute away, the check
runs at once.

---

## 6. Opening files

Double-click a file, or select it and press `Enter` or click **Open**; on a
touch screen, tap it. What happens depends on its type:

| Type | Examples | What happens |
|---|---|---|
| Images | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.bmp` | The viewer ([§6.1](#61-the-viewer)), with zoom ([§6.3](#63-images)) |
| Video | `.mp4` `.m4v` `.webm` `.mov` `.avi` `.mkv` `.dav` `.264` | The viewer, with seeking ([§6.2](#62-video-and-audio)) |
| Audio | `.mp3` `.wav` `.ogg` `.m4a` `.aac` `.flac` | The viewer |
| PDF and text | `.pdf` `.txt` `.log` | Opens in a new browser tab |
| Everything else | `.docx` `.xlsx` `.zip` `.html` `.svg`… | Downloaded to your Downloads folder |

Files are streamed from the FTP server through Quick FTP Explorer and are
not kept on the server. The one exception: a video that needs converting
stays in the server's memory for a few minutes, so replaying it or seeking
in it is quick.

### 6.1 The viewer

Videos, images and audio open in a viewer over the page. Its caption gives
the clip's camera and time, for example *Cam 1 · 01/11/2026 15:58*, with
the file name below it (and, for a search result, where the file is).

- **Previous** and **Next** step through the list as you see it: in its
  order, with its filters, or through the search results. *3 of 160* says
  where you are. If several files are selected and you open one of them,
  the viewer steps through the selected files only. Only videos, images
  and audio are included, and the list doesn't loop: Previous stops at the
  first file and Next at the last.
- **Play one after another** (for videos): tick it, and the next clip plays
  a second after one ends; a key or a click during that second cancels it.
  The browser remembers the choice. To review a night in order, sort by
  *Oldest first* before you open the first clip.
- **Copy link** copies a link to the clip on screen
  ([§5.1](#51-links-bookmarks-and-the-back-button)); **Download** saves it.
- **Close**, `Esc` or the browser's **Back** button closes the viewer. The
  last clip you looked at is then selected in the list.

Keys: `←` and `→`, or `Page Up` and `Page Down`, go to the previous and the
next clip; `Home` and `End` go to the first and the last. While the video
player itself has the focus, `←` and `→` seek in the video instead, and
`Page Up` and `Page Down` still change clips. `Space` plays or pauses.

Each step stops the clip before it, and its download with it; nothing is
loaded in advance. A clip that can't play says why, and Previous and Next
keep working.

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

### 6.3 Images

An image first fits the window.

- **Fit** &mdash; the whole image fits the window (default).
- **100%** &mdash; actual size.
- **− / +** &mdash; zoom out / in. The **mouse wheel** zooms too.
- **Drag** the image to move around when it is larger than the window.

### 6.4 Downloading several files as one ZIP

Select 2 to 200 files of one site and click **Download (n)** (or use the
right-click menu, or the selection bar on a phone): they arrive as **one ZIP
file**, so the browser asks no questions about multiple downloads.
*Preparing the download…* shows for a moment, then the browser's download
list shows the progress.

- The archive is named after the site and the time of the download, for
  example `1234 Résidence 2026-11-01 16-20.zip`.
- The files are stored as they are (camera clips don't shrink), each dated
  with the recording time from its name. Two files with the same name, from
  different folders, become `clip.avi` and `clip (2).avi`.
- Limits: 200 files per archive, all from one site, and 2 GB in all. With
  more than 200 files, or with files from several sites (in search
  results), **Download** is greyed out; point at it to see why.
- If a file can't be fetched, or stops halfway, the archive still opens:
  its last file, **ERRORS.txt** (**ERREURS.txt** when the interface is in
  French), lists each file that is missing or incomplete, with the reason.
  Files left out because the archive reached 2 GB are listed there too.

### 6.5 Why some files always download

Web pages (`.html`), vector images (`.svg`) and similar files can contain
code. If the browser displayed them inside Quick FTP Explorer, that code
would run with your session. They are therefore always **downloaded**,
never displayed &mdash; even though, for example, an `.svg` is an image.

### 6.6 If the PDF tab doesn't open

Some browsers block new tabs opened by a page. If opening a PDF does
nothing, allow pop-ups for the Quick FTP Explorer address.

---

## 7. Searching and filtering

The search box finds files by name; the filters narrow a list by date,
camera and type. The two work together.

### 7.1 The search box

Type in the search box of the top bar (`Ctrl+F` or `F3` takes you there; on
a phone, tap **⌕**) to find **files and folders** by name:

- With a folder open, it searches that folder **and all its subfolders**.
  The box says where, for example *Search 1234 Résidence*.
- On All sites, it searches **every site**, and lists matching sites
  first.

Results appear in the list as you type, with the same columns, the folder
each one is in under its name, and the matching part highlighted. They
follow the sort order and the filters: with *Today* chosen, a search for
`garage` finds today's clips with "garage" in their name, the newest first.
Open them like
any file; the viewer then steps through the results. Right-click one and
choose **Open file location** to go to its folder, with the file selected.
**Search all sites** widens a search to every site.

- Upper/lower case and accents don't matter: `ete` finds `Été`.
- Several words must all appear, in any order: `garage 0830` finds
  `1234_Garage 1_202610300830.avi`.
- `Enter` searches at once; `↓` moves to the first result.
- Clear the box with **×** or `Esc` to get back to the folder.

Going to another folder ends the search. Pressing `Ctrl+F` again while you
are in the box opens the browser's own Find.

The first search of a place reads its folders from the server, which can
take a few seconds on a big site; searching there again is instant. One
search reads at most 300 folders: to search deeper, open a subfolder first.
At most 500 results are shown: the first 500 in the current order, so the
500 newest when the list is sorted newest first. Add words to narrow the
search.

### 7.2 Filters

The filters of the command bar narrow the list of a folder, or the search
results. On a phone, they are in the **Filters** panel
([§5.2](#52-on-a-phone)).

- **Period**:
  - *Any date*: no filter;
  - *Last hour* and *Last 24 hours*;
  - *Today*, since midnight, and *Yesterday*, from midnight to midnight;
  - *Last 7 days*: today and the six days before;
  - *Around a time…* shows **Time** and **Margin**, and keeps the files
    within 5, 15, 30 or 60 minutes either side of that time (15 to begin
    with). **Time** starts at the current minute: type the time of the
    alarm you are checking;
  - *Custom range…* shows **From** and **To**, starting with the last hour.
    Either may be left empty, for no limit on that side; the minute typed
    in **To** is included, and the two may come in either order.

  The period goes by the **Date** column. The recent periods have no end,
  so a clip from a camera whose clock runs a little fast still shows. Files
  without a date are hidden while a period is chosen.
- **Camera**: *All cameras (81)*, then each camera with its number of files.
  It shows when the list has at least two cameras.
- **Type**: *All types*, *Videos*, *Images* and *Other files*, each with its
  count. It shows when the list mixes kinds of file.

The numbers in brackets take the other filters into account. Filters
combine: *Today* and *Cam 2* show today's Cam 2 files. Folders are never
hidden. A filter that is on gets a highlighted border, the status bar says
*12 of 81 items*, and **Clear filters** removes them all. When the filters
hide every file, the list says *No file matches these filters.*, offers
**Clear filters**, and gives the date of the newest file.

Filters apply as soon as you change them, and periods such as *Last hour*
move with the clock. They stay when you refresh, or start or clear a
search, and Back brings them back. **Opening another folder or site starts
without filters**, so that a forgotten filter can never hide clips
somewhere else; the sort order stays.

---

## 8. Managing sites (administrators)

Only accounts with the **admin** role see **+ New site** in the Sites
panel, and the site commands below. Sites are shared: every change is
immediately visible to everyone (after they reload the page).

### 8.1 Creating a site

Click **+ New site** (or right-click an empty part of the Sites panel →
**New site…**).

| Field | Notes |
|---|---|
| **Username** | The FTP account. Required. It also identifies the site, so two sites can't share a username. |
| **Custom label text** | Optional. The label shown in the tree is the username followed by this text, e.g. `1234 Résidence`. The preview below shows the result. |
| **Host** and **Port** | The FTP server. Prefilled with your organisation's defaults. |
| **Password** | Defaults to the username, and follows it as you type until you type a password of your own. |

Click **Save**. Problems are shown at the top of the form, for example
*A site for username "…" already exists* or *Username contains control
characters*.

### 8.2 Editing a site

Right-click the site, in the Sites panel or on All sites → **Edit site…**.
On a touch screen, use the **⋯** button on the open site's row in the Sites
panel; from the keyboard, press `Shift+F10` on the site.

- The password field is **empty**: saved passwords are never sent to
  browsers. Leave it empty to keep the current password.
- **If you change the host or the port, you must type the password
  again.** This prevents anyone from sending a stored password to a
  different server.
- Changing the **username** renames the site. If you were browsing it,
  the view restarts from its root.

### 8.3 Deleting a site

In the same menu, choose **Delete site**, then confirm. Everyone loses
access to it at once.

---

## 9. Keyboard shortcuts

The same list as in **Help** (`?`):

| Keys | Action |
|---|---|
| `Ctrl+F` or `F3` | Go to the search box |
| Double-click or `Enter` | Open |
| Arrows, `Home`, `End`, `Page Up`, `Page Down` | Move in the list or the tree |
| `Space`, `Ctrl`+click, `Shift`+click | Select several files |
| `Shift+F10` or the Menu key | Actions for the selection |
| `←` / `→`, `Page Up` / `Page Down` | Previous / next clip in the viewer |
| `Esc` | Close; clear the selection, then the search |
| `Alt+←`, `Alt+→`, `Alt+↑`, `Backspace` | Back, forward, up a level |
| `?` | This help |

In more detail:

- **In the list**: the arrows, `Home`, `End`, `Page Up` and `Page Down`
  move and select; with `Shift` they extend the selection, with `Ctrl` they
  move without selecting. `Space` selects or unselects the row,
  `Ctrl+A` selects every file shown, `Enter` opens, and `Esc` clears the
  selection, then the search. On All sites, typing a site's first letters
  jumps to it.
- **In the Sites panel**: `↑`, `↓`, `Home` and `End` move; `→` opens a
  branch or goes into it, `←` closes it or goes up; `Enter` or `Space`
  opens the item on the right; typing jumps to a name. In **Find a site**,
  `Enter` opens the first match, `↓` goes into the tree, and `Esc` clears.
- **In the search box**: `Enter` searches at once, `↓` goes to the first
  result, `Esc` clears. `Ctrl+F` there opens the browser's own Find.
- **In the viewer**: `←` and `→` (when the video player has the focus,
  they seek in the video instead), `Page Up` and `Page Down` change clips;
  `Home` and `End` go to the first and the last; `Space` plays or pauses;
  `Esc` closes.
- **In a menu**: `↑`, `↓`, `Home` and `End` choose; `Enter` or `Space`
  runs; `Esc` or `Tab` closes.
- **On the border between the panels**: `←` and `→` resize (with `Shift`,
  in bigger steps); `Home` and `End` give the narrowest and the widest;
  `Enter` the usual width.

`Esc` closes one thing at a time: a menu, the phone's search box, the Sites
panel, selection mode. Windows such as the viewer or Help close with their
own `Esc`. `Alt+↑`, `Backspace` and `?` do nothing in a text box, where
they type. The browser's own keys keep working: `F5` reloads the page (and
brings the view back), and `Alt+←` and `Alt+→` go back and forward.

---

## 10. Troubleshooting

| Message or symptom | What to do |
|---|---|
| *FTP login failed: 530 …* | The site's FTP username or password is wrong, or the account was changed on the FTP server. Tell an administrator. |
| *… (not retried for 5 min; an admin should check this site)* | After a failed FTP login, the site pauses for 5 minutes so repeated attempts don't get the server blocked. It resumes on its own, or at once when an administrator saves the site. |
| *Not found, or no permission* | The folder or file was moved or deleted, or the FTP account may not read it. Press **↻** on the parent folder. |
| *The FTP server is busy …* | Too many people are using that server at once. Wait a few seconds and retry. |
| *Can't reach the FTP server* / *did not answer in time* / *took too long* | The FTP server is down, unreachable or very slow. Retry later; tell an administrator if it persists. |
| *The server can't be reached* | Your own connection to Quick FTP Explorer dropped. Check your network. |
| *Couldn't refresh: …* | The list on screen is the one from before. Click **Retry**. |
| A clip seems to be missing | Look at the status bar: *12 of 81 items* means filters hide some files; click **Clear filters** ([§7.2](#72-filters)). Look at *Updated at*: the list may be older than the clip, so press **↻**. In a search, only the first 500 results are shown ([§7.1](#71-the-search-box)). |
| Times look an hour or two off | The date of a clip comes from its name, on the recorder's own clock; otherwise it is the FTP server's time, in your computer's local time. Point at the date to see both. If they disagree, the recorder's clock is probably wrong. |
| A click doesn't open the file | A click selects. Double-click, press `Enter` or click **Open** ([§4.3](#43-the-list)). On a phone in selection mode, taps tick files: tap **×** to leave it. |
| **Download** is greyed out | Point at it to see why: more than 200 files are selected, or files from several sites (in search results), or only folders. |
| The ZIP contains **ERRORS.txt** | Some files are missing or incomplete; the file says which, and why. Download those again. |
| *The download couldn't be prepared: …* | The reason follows. Try again; tell an administrator if it persists. |
| A ZIP download fails in the browser's download list | The server may already be building two archives, or the link expired (it lasts 2 minutes). Click **Download** again. |
| *This file is no longer in this folder.* | The clip of the link you opened was moved or deleted. |
| **Copy link** shows a small window | Your browser didn't let the page copy: press `Ctrl+C`, then **Close**. |
| `Ctrl+F` opens the browser's Find | You were already in the search box: that's the way to the browser's own Find. |
| A video shows *can't be played in this browser* | See [§6.2](#62-video-and-audio): download it and use another player. |
| A download fails in the browser's download list | Usually one of the FTP problems above; retry, or open the file's folder again to check it still exists. |
| Opening a PDF does nothing | Allow pop-ups for the site ([§6.6](#66-if-the-pdf-tab-doesnt-open)). |
| You are sent back to the sign-in page | Your session expired or your account was changed. Sign in again. |

---

## 11. Privacy and data

- **Passwords.** Your account password is stored only as a salted hash.
  FTP passwords are stored on the server and are never shown in any page.
- **Audit trail.** For accountability, the server records sign-ins,
  changes to sites, which folders and files each user opened, and every
  ZIP download with the files it held, with the time and the network
  address. The page's own checks for new files are recorded at most once
  every 10 minutes per folder. Recordings from cameras are personal data;
  ask your administrator about your organisation's retention rules.
- **Your computer.** Files you open are not kept by the browser's cache.
  Downloaded files go to your Downloads folder like any download; delete
  them when you no longer need them. The browser remembers four choices
  for you: the sort order, the width of the Sites panel, whether you have
  seen the reminder on how to open files, and *Play one after another*;
  never a file name. Like any web page's, the tab's history keeps the
  places you visited, here with what each one showed (the search, the
  filters, the selection), so that Back can bring it back.
- **The server** streams files from the FTP server to you without storing
  them.

---

## 12. FAQ

**Do I need to install anything?**
No. A recent browser is enough.

**Can I use it on a phone or tablet?**
Yes. Everything works with touch, and one tap opens. On a phone, the Sites
panel opens with the **☰** button ([§5.2](#52-on-a-phone)).

**Why doesn't a click open a file?**
As in File Explorer, a click selects, so that you can select several files.
Double-click, press `Enter` or click **Open**. On a touch screen, one tap
opens.

**Can I download several clips at once?**
Yes. Select them (`Ctrl`+click, `Shift`+click, the check boxes or
`Ctrl+A`), then click **Download (n)**: you get one ZIP file, of up to 200
files of one site ([§6.4](#64-downloading-several-files-as-one-zip)).

**How do I review a night of clips?**
Choose *Yesterday* (or *Around a time…*) in **Period**, sort by *Oldest
first*, open the first clip, and tick **Play one after another**, or step
with **Next**.

**Can I send a colleague a link to a folder, or to one clip?**
Yes: select it and click **Copy link**, or copy the address bar
([§5.1](#51-links-bookmarks-and-the-back-button)). A clip link opens the
clip in the viewer. They need their own account to open it.

**Can I upload, rename or delete files?**
No. Quick FTP Explorer is read-only by design.

**How do I change my password, or get an account for a colleague?**
Ask an administrator.

**Why can't I see the FTP server's address?**
Only administrators need it. Everyone else just sees the site labels.

**I see a folder called `latest` (or similar) that opens as a file.**
It is probably a link on the FTP server. Links are shown as files; open the
folder they point to directly.
