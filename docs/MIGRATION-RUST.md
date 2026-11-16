# Migration plan: version 1.0 in Rust + Tauri

Issue: #41 · Design summary: [DESIGN.md](DESIGN.md), section 10 · Status: **planned**

## 1. Goal and scope

**Goal: fewer CVEs that we have to ship ourselves.** Today the desktop app bundles Chromium and Node.js (Electron), and almost all security updates we release come from there. Version 1.0:

- runs the screens in the **browser engine of the system**: WebView2 on Windows (updated by Windows), WebKitGTK on Linux (updated by the distribution);
- has a **core written in Rust**: memory-safe, one program file, no runtime;
- ships a **software bill of materials (SBOM)** with every release, and trusted (signed) releases as planned in [plans/RELEASE-TRUST.md](plans/RELEASE-TRUST.md).

**Stays the same (users notice nothing but a smaller download):**

- the `data` folder and every file in it (`project.yaml`, `features/*.yaml`, items, templates, settings);
- the screens (`app/public`: HTML, CSS, JavaScript), unchanged;
- the HTTP API: the same routes, answers and errors, including the live updates (SSE), the chat stream and the VS Code proxy;
- Claude CLI integration, the workspace MCP server's tools, `${secret:name}`.

**Not in scope:** new features. New features keep going into 0.x until the beta, then into both, then only into 1.0.

## 2. What exists today

| Part | Lines | Moves to |
|---|---|---|
| `app/lib/workspace.js`: projects, features, items, search, links, overview/due, templates, archive | 951 | `pw-core` |
| `app/lib/yaml.js`, `yaml-lenient.js`, `vendor/yaml` (bundled library) | 290 + lib | `pw-core::yaml` |
| `app/lib/files.js` (explorer), `exif.js` (photo dates) | 205 | `pw-core::files`, `pw-core::exif` |
| `app/lib/secrets.js` | 107 | `pw-core::secrets` |
| `app/server.js`: 55 routes + SSE, chat stream, files, static, security checks | 291 | `pw-server` |
| `app/lib/chat.js` (Claude CLI) | 177 | `pw-server::chat` |
| `app/lib/ide.js` (VS Code + proxy incl. WebSockets) | 170 | `pw-server::ide` |
| `app/lib/updater.js` | 193 | `pw-server::updater` |
| `app/lib/github.js` | 50 | `pw-server::github` |
| `app/mcp.js` (12 tools, stdio JSON-RPC) | 85 | `pw-mcp` |
| `app/electron/main.js`, `desktop.js` (window, tray, reminders, autostart) | 289 | `pw-app` (Tauri) |
| `app/public/*` (screens) | 1,731 | **unchanged** |

About 2,700 lines of JavaScript become Rust. The screens are reused, which is about 40 % of the code and most of the design work.

## 3. Target architecture

```
rust/                         Cargo workspace (same repository, next to app/)
  Cargo.toml  Cargo.lock      lock file committed
  deny.toml                   cargo-deny: advisories, licences, sources, duplicate crates
  crates/
    pw-core/                  everything about the data folder; no network, no processes
      yaml.rs                 full YAML + lenient fallback + comment-keeping record updates
      workspace.rs features.rs projects.rs items.rs search.rs links.rs
      overview.rs templates.rs archive.rs files.rs exif.rs secrets.rs
    pw-server/                axum on 127.0.0.1: the HTTP API, SSE, static files, security checks
      chat.rs ide.rs updater.rs github.rs watch.rs
    pw-mcp/                   workspace MCP server (stdio JSON-RPC)
    pw-cli/                   console program: project-workspace-server(.exe)
                              = server without window, and --mcp
    pw-app/                   Tauri 2 shell: ProjectWorkspace.exe / project-workspace
                              = window on http://localhost:<port>, tray, notifications,
                                autostart, single instance, window size
app/public/                   the screens, served by pw-server from the program folder
tests/contract/               API contract tests (JavaScript, node:test, no packages)
tests/yaml-corpus/            YAML files + the answers today's app gives (golden files)
```

**Why keep HTTP instead of Tauri's own IPC?** The screens stay unchanged, the browser keeps working (`--browser`, *Open in browser*), the VS Code tab keeps its same-origin proxy, and the window needs **no** Tauri commands at all: the page gets zero native permissions (Tauri capabilities: none for this origin).

**Package (Windows):**

```
ProjectWorkspace/
  ProjectWorkspace.exe            Tauri app (~8–12 MB)
  project-workspace-server.exe    console: server without window, MCP (--mcp)
  app/public/  docs/  README.md  LICENSE  package.json (version, update repo)
  runtime.json                    {"engine":"system-webview"} (tells 0.x updaters what's runtime)
  data/                           created on first start
```

Linux: `project-workspace`, `project-workspace-server`; needs `libwebkit2gtk-4.1` and, for the tray, `libayatana-appindicator3` (installed on most desktops; the server needs neither).

## 4. Crates (to confirm in the prototype)

| Need | Choice | Notes |
|---|---|---|
| Async, HTTP server | `tokio`, `axum`, `tower-http` | SSE via axum; own security middleware (Host / Origin checks) |
| Reverse proxy incl. WebSockets (VS Code) | `hyper`, `hyper-util` | upgrade both sides, `copy_bidirectional` |
| HTTP client (updates, GitHub) | `reqwest` with `rustls` | no OpenSSL |
| JSON | `serde`, `serde_json` | |
| YAML | `saphyr` (or `yaml-rust2`) | `serde_yaml` is unmaintained. Must pass the YAML corpus (§6) |
| File watching | `notify` | recursive, also `location:` folders |
| Zip (updater) | `zip` | keep Unix modes |
| Secrets | `aes-gcm`, `rand`; key: DPAPI (`windows` crate), `keyring` (Linux Secret Service, macOS Keychain) | |
| Signatures | `ed25519-dalek` (verify) / minisign format | |
| Photo dates | `kamadak-exif` | |
| Desktop | `tauri` 2 + plugins `single-instance`, `notification`, `autostart`, `window-state`, `opener`; tray built in | |
| Windows PATH refresh | `winreg` | as `chat.js` does today |

Rules for our crates: `#![forbid(unsafe_code)]` (only the DPAPI module may use `unsafe`, kept tiny), default features off, every crate checked by `cargo-deny`.

## 5. Phases

Each phase ends with a check before the next starts. Estimates are working days for one developer with Claude.

### Phase S: trusted releases

Decided 2026-11-16, details in [plans/RELEASE-TRUST.md](plans/RELEASE-TRUST.md) (#49, #31): free code signing by SignPath Foundation for the 1.0 Windows program (one *Approve* click per release), updater checks the signature (Windows) and checksum + GitHub build attestation (Linux). Work items: apply at SignPath before phase 4; signing in the Windows build of phase 4; updater checks in phase 3; *Code signing policy* section in README and wiki.

### Phase 0: the safety net (3–4 days)

**Status (2026-11-16): done.** `tests/contract/` (32 tests: core, items, explorer + security, chat with a fake Claude CLI incl. permission questions, services with fake GitHub / update server / VS Code server, MCP) and `tests/yaml-corpus/` (33 cases with golden answers, record updates keep comments) run on every push on Linux and Windows (`.github/workflows/tests.yml`). The Rust parts plug in with `PW_SERVER_CMD`, `PW_MCP_CMD`, `PW_YAML_CMD`. Found and fixed on the way: explorer pictures/downloads (#63). Not covered yet: installing an update (`/api/update/apply`, restarts the server), opening the desktop VS Code (`/api/fs/vscode`). Crates can't be downloaded in Claude's work environment, so Rust is built and tested on GitHub's runners.

- **API contract tests** in `tests/contract/`: start a server against a copy of a test data folder (`PW_SERVER_CMD`, default: today's Node server) and check every route: answers, status codes, errors, files written to disk, SSE events, refused hosts/origins, private files. Run in CI on every push.
- **YAML corpus** in `tests/yaml-corpus/`: every YAML file from the starter features and examples, the sloppy original example, edge cases (anchors, merge keys, several documents, block scalars, broken files), each with the JSON that today's app reads from it, the warning it gives, and the text that a record update writes (comments kept).
- **Data migration tests:** a data folder from 0.6 (with secrets, templates, archive, `location:` project) as a fixture.
- Done when: the suite is green against the Node server and covers all 55 routes plus SSE, chat stream (with a fake `claude`), files and the proxy.

### Phase 1: prototype and decision (5–7 days)

**Status (2026-11-16): prototype built**, waiting for the test on Windows. `rust/` (crates `pw-core`, `pw-server`, `pw-app`), built by `.github/workflows/rust.yml` on Linux and Windows.

| Measured | Electron (0.6) | Rust + Tauri prototype |
|---|---|---|
| Windows download (zip) | 157 MB | **4.7 MB** |
| Desktop program | Electron runtime (~180 MB unpacked) | `ProjectWorkspace.exe` 6.9 MB |
| Server without window | runtime + `ELECTRON_RUN_AS_NODE` | `project-workspace-server.exe` 1.4 MB |
| Starts and answers (CI, Windows + Linux) | yes | yes |
| YAML corpus | 33/33 | 26/33 (missing: lenient reading of broken files, duplicate keys, comment-keeping updates) |
| API contract tests | 32/32 | 5/32 (prototype: info, features, projects, pages; the rest is phase 2–3) |

In the prototype: project list, project pages, overview tiles, wiki/knowledge pages (read and edit), features list, `project.yaml` view. Not yet: records, pictures, files, explorer, chat, VS Code tab, search, links, templates, secrets, updates.

- `pw-app` (Tauri) opening a window on `pw-server`, which serves `app/public`, `/api/info`, `/api/projects`, one project, the wiki feature (read, write, upload, paste a picture), live updates, and YAML reading incl. the sloppy example.
- Try on Windows 10, Windows 11, Ubuntu 24.04, Raspberry Pi OS: Mermaid diagrams, code highlighting, drag & drop of files (Tauri's own file drop turned off so the page gets it), paste, dark mode, the VS Code tab (iframe + WebSockets through the proxy), notifications, tray.
- Measure: download size, memory, start time.
- **Decision:** go on, or stay with Electron. Stop if WebView2/WebKitGTK break something central that can't be fixed, or YAML parity is out of reach.

### Phase 2: the core (10–15 days)

- `pw-core` complete: features (aliases, normalisation), projects (`location:`, overview, rename, archive, restore, delete), items for every storage type (markdown, images, files, records, diagram, chat history), search, links and backlinks, templates, due, explorer, photo dates, secrets.
- `pw-server` routes for all of it, SSE file watching.
- Done when: contract tests and YAML corpus green against the Rust server (`PW_SERVER_CMD=project-workspace-server`), except chat, VS Code, updates, MCP.

### Phase 3: the rest (8–10 days)

- Chat with Claude CLI: stream-json parsing, resume, permission modes, denials, secrets as environment variables, Windows PATH refresh, sign-in hint.
- VS Code: start/stop `code serve-web` (process tree), proxy with token cookie, redirect rewrite, frame headers.
- Updater: weekly check, download, backup, replace, restart; asset choice by platform (plus the checks from RELEASE-TRUST.md).
- MCP server: the 12 tools, same answers.
- GitHub issues feature, secrets API.
- Desktop (`pw-app`): tray, reminders (same rules as `desktop.js`), autostart, single instance, window size, menu, links to the browser, `--hidden`, `--browser`.
- **Secrets migration:**
  - **Windows:** 0.x protected the key with Electron's safeStorage, whose own key is kept in `data/.app/Local State`, protected by DPAPI. 1.0 reads it with DPAPI, unwraps our key and protects it again in its own format, so nothing has to be entered again (to be confirmed in phase 1; otherwise secrets are entered again once).
  - **Linux:** if unwrapping fails, the app asks to enter the secrets again (as for a copied data folder).
- Done when: the full contract suite is green against Rust; the MCP tools give the same answers as `app/mcp.js`.

### Phase 4: beta next to 0.x (2–4 weeks of use, little work)

- `.github/workflows/build-rust.yml` builds Windows x64, Linux x64/arm64 and publishes **pre-releases** (`v1.0.0-beta.N`). The 0.x updater only looks at the latest *full* release, so nobody gets the beta by accident.
- You (and anyone who wants) run the beta on a **copy** of the data folder, then on the real one.
- Security check (§7) runs for Rust too. Bugs → issues with label `v1.0`.
- 0.x keeps getting automatic security releases.

### Phase 5: release 1.0 (1–2 days)

- Last 0.x release (0.x.y) first: its updater removes runtime files that the new package doesn't list (Electron's DLLs, `resources/`, `locales/`), so the move to 1.0 leaves nothing behind.
- Release 1.0.0 as the latest release. 0.x apps offer the update; after the restart the Tauri app starts.
- Docs: README, Getting started, wiki (Desktop App, Data and Updates, Security), DESIGN.md (the Node/Electron sections become "history").
- macOS is not built (#56, later).
- `app/server.js`, `app/lib`, `app/electron`, `start.bat`/`start.sh` are removed from the package (kept in git history).

**Total:** about 6–8 weeks of work, plus the beta period.

### After 1.0: new features in Rust

Decided 2026-11-16: these features are built in the Rust version, not in 0.x.

| Version | Feature | Plan |
|---|---|---|
| 1.1 | Ticketsystem: GLPI 11 (read, then write) | [plans/TICKETSYSTEM.md](plans/TICKETSYSTEM.md), #59 |
| 1.2 | Versions: Git (local, share, own server), then SVN | [plans/VERSION-CONTROL.md](plans/VERSION-CONTROL.md), #60 |

## 6. Testing

| What | How |
|---|---|
| API behaviour | contract tests (phase 0), the same suite for Node and Rust |
| YAML | corpus with golden answers, incl. warnings and comment-keeping updates |
| Core logic | Rust unit tests in `pw-core` |
| Screens in the system webview | build check like today: the app opens its window, the page renders, `/api/info` and `/api/due` answer (`PW_SMOKE_FILE`); on Windows and Linux runners |
| MCP | the same `initialize` / `tools/list` / `tools/call` checks as today |
| Updates | 0.x → 1.0 and 1.0 → 1.0.1 on a test data folder |
| By hand (Windows) | VS Code tab, chat with real Claude CLI, tray and reminders, update from 0.6 |

## 7. Security from day one

- `cargo-deny check` (advisories, licences, allowed sources) and `cargo audit` on every push; weekly in `security.yml`: a new advisory for a crate in `Cargo.lock` → issue right away, a patched version → patch release.
- Dependabot for `cargo` (weekly).
- CodeQL: Rust analysis next to JavaScript (screens) and workflows.
- SBOM (`cargo cyclonedx`) attached to every release.
- Trusted releases as decided in plans/RELEASE-TRUST.md.
- Tauri: no IPC commands for the page, CSP unchanged, navigation outside localhost opens the system browser, devtools off in release builds.
- No more browser engine of our own: WebView2 / WebKitGTK are updated by the system. The security page explains that Windows Update (and the Linux package manager) now deliver those fixes.

## 8. Risks

| Risk | Effect | Plan |
|---|---|---|
| YAML parity (lenient reading, comment-keeping updates) | files read differently | corpus in phase 0; own text-level update of top-level keys |
| WebKitGTK differences (Linux) | something looks or works differently | test in phase 1; WebKitGTK only where Linux users have a desktop |
| Old Windows 10 without WebView2 | window doesn't open | Tauri's WebView2 bootstrapper, or a clear message with the download link |
| Electron safeStorage on Linux | secrets can't be migrated | re-enter them (documented); Windows migrates automatically |
| Unsigned exe (#31) | SmartScreen warning stays | separate decision; a smaller exe doesn't change it |
| Rust know-how for later changes | slower changes by hand | Claude does most changes; DESIGN.md explains the crates; screens stay JavaScript |
| Time | 1.0 takes longer | phase 1 decides early; 0.x stays supported meanwhile |

## 9. Decisions

1. **Node.js package:** 1.0 drops the "run with Node.js" package (`start.bat`/`start.sh`); machines without a screen use `project-workspace-server`. **Decided: yes** (2026-11-16).
2. **macOS:** not part of 1.0; later improvement (#56). **Decided** (2026-11-16).
3. **Where the screens live:** served from `app/public` on disk, updates replace files as today. **Decided: on disk** (2026-11-16).
4. **Signing:** reopened, see [plans/RELEASE-TRUST.md](plans/RELEASE-TRUST.md).

## 10. Tracking

- Milestone **v1.0 (Rust)** on GitHub with one issue per phase: S #49 (now: RELEASE-TRUST.md), 0 #50, 1 #51, 2 #52, 3 #53, 4 #54, 5 #55.
- [REQUIREMENTS.md](REQUIREMENTS.md) D21 points here; DESIGN.md section 10 summarises it.
