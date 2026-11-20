# Desktop app

The Windows and Linux downloads open the workspace in **their own window**. They use the browser engine your system already has (WebView2 on Windows 11, WebKitGTK on Linux), so nothing else needs to be installed.

## Start

| System | Start |
|---|---|
| Windows | `Workspace.exe` |
| Linux | `./workspace` |
| Linux server without a desktop | `./workspace-server` (no window; open `http://localhost:4321` in a browser) |

Options: a port number (e.g. `4322`), `--browser` (open a normal browser tab instead of the window), `--hidden` (start in the tray), `--version`.

Starting it a second time just brings the window to the front.

**The X closes the app.** To keep reminders while you work elsewhere, minimise the window instead.

## Two layouts

Choose in the menu with **Menu left** / **Menu top** (next to *Light / Dark / Auto*). The app remembers it on this PC.

- **Menu left** (the classic one): projects and links on the left, the features of a project as tabs along the top. **Collapse** (or Ctrl+B) shrinks the menu to icons.
- **Menu top**: the menu is a bar at the top, the projects are in a **drop-down** there, and the features of a project are a list on the left. **« Collapse** at the bottom of that list (or Ctrl+B) shrinks it to icons; **»** opens it again.

In both, **Tabs** (the eye) chooses which features a project shows, and the gear (⚙) next to the project name holds `project.yaml`.

## Tray, reminders and start with Windows

Click the **tray icon** (next to the clock):

- **Open Workspace**
- **Due today:** the tasks and events due today or overdue, in all projects — click one to open it.
- **Remind me of what is due** (on by default): every 30 minutes the app checks all projects and shows a notification for what is due today or overdue, once per day.
- **Start with Windows** (off by default): the workspace starts in the tray when you sign in. If you move the program folder, start it once from the new place.
- **Open in browser**, **Open data folder**, **Wiki**, **Quit**.

The home page lists **Coming up in all projects**: overdue tasks first, then everything in the next 14 days. Dates come from calendar events and date fields such as `due` (see [[Tasks|Feature-Tasks]], [[Calendar|Feature-Calendar]]).

These settings are kept in `data/.desktop.json`, the window size in `data/.window.json`.

## Linux notes

- The window needs WebKitGTK 4.1 (most desktops have it).
- The tray icon needs a desktop with tray support (on GNOME: the *AppIndicator* extension).

## Updates

The app checks for updates once a week (see [[Data and Updates|Data-and-Updates]]). After **Update now** it restarts by itself.

See also: [[Getting Started|Getting-Started]], [[FAQ]].
