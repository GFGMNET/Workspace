# Desktop app

The Windows and Linux downloads open the workspace in **their own window**. Node.js and the browser engine are included (Electron), so nothing needs to be installed.

## Start

| System | Start |
|---|---|
| Windows | `ProjectWorkspace.exe` |
| Linux | `./project-workspace` |
| Linux server without a desktop | `./project-workspace-server` (no window; open `http://localhost:4321` in a browser) |

Options: a port number (e.g. `4322`), `--browser` (open a normal browser tab instead of the window), `--hidden` (start in the tray), `--version`.

Starting it a second time just brings the window to the front. If a workspace already runs on the port (e.g. from `start.bat`), the window shows that one.

## Menu

Press **Alt** if the menu is hidden.

- **Workspace → Open in browser:** the same workspace in your normal browser. Both work at the same time.
- **Workspace → Open data folder:** your `data` folder in Explorer / Files.
- **View:** reload, zoom, full screen.
- **Help → Wiki.**

Links to the wiki, GitHub and other websites open in your normal browser.

## Tray, reminders and start with Windows

Right-click the **tray icon** (next to the clock):

- **Keep running in the tray when the window is closed** (on by default). Closing the window hides it, so reminders keep coming. To stop the workspace, choose **Quit** in the tray menu or **Workspace → Quit** (Ctrl+Q). Turned off, closing the window stops the workspace.
- **Remind me of what is due** (on by default). Every 30 minutes the app checks all projects. It shows a notification for each task or event that is due today or overdue, once per day. Clicking it opens the item.
- **Start with Windows** (off by default). The workspace starts in the tray when you sign in. If you move the program folder, start it once from the new place.

The home page lists **Coming up in all projects**: overdue tasks first, then everything in the next 14 days. Dates come from calendar events and date fields such as `due` (see [[Tasks|Feature-Tasks]], [[Calendar|Feature-Calendar]]).

These settings are kept in `data/.desktop.json`.

## Linux notes

- The Linux packages can't carry Chromium's root-owned sandbox helper, so the start script runs the window without it. It only ever shows your local workspace. To use the sandbox: `sudo chown root chrome-sandbox && sudo chmod 4755 chrome-sandbox` in the program folder.
- The tray icon needs a desktop with tray support (on GNOME: the *AppIndicator* extension).

## Updates

The app checks for updates once a week (see [[Data and Updates|Data-and-Updates]]). After **Update now** it restarts by itself. When a release brings a new browser engine, it is swapped in while the app restarts.

See also: [[Getting Started|Getting-Started]], [[FAQ]].
