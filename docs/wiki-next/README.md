# Wiki pages that are not published yet

`docs/wiki/` is published to the GitHub wiki (and, from 1.0.4, comes with the app) on every push. Pages for a version that
is **not released yet** wait here, so they don't go online too early (maintainer's decisions 2026-11-20 and 2026-11-23):

- **1.0:** the `.md` files directly in this folder. On 27 Nov the 1.0 release task copies them (except this README and
  `GETTING-STARTED.md`) into `docs/wiki/`, `GETTING-STARTED.md` over `docs/GETTING-STARTED.md`, deletes `docs/wiki/Beta-1.0.md`,
  and removes those files from here.
- **Later versions:** one folder per version, e.g. `v1.0.1/`, `v1.0.2/`, `v1.0.3/`. Put new or changed pages for that version
  there (whole pages, same file names as in `docs/wiki/`; a changed `_Sidebar.md` too). The release of that version moves the
  folder's pages into `docs/wiki/` and deletes the folder — then the wiki is published.

Edit wiki text for a coming version here, not in `docs/wiki/`.
