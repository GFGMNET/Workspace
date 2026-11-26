# For AI assistants (any model)

Read these before you do anything, in this order:

1. **[`CLAUDE.md`](CLAUDE.md)** — the rules and every decision of the maintainer. It applies to any model, not only Claude.
2. **[`docs/HANDOVER.md`](docs/HANDOVER.md)** — where things stand and what comes next.
   First open points: **[`docs/NOT-REQUESTED-2026-11-26.md`](docs/NOT-REQUESTED-2026-11-26.md)** — things done without being asked; ask the maintainer about each one.
   And **[`docs/FORGOTTEN-2026-11-26.md`](docs/FORGOTTEN-2026-11-26.md)** — what was forgotten or couldn't be finished (GitHub release texts, screenshots, help in the app).
3. **[`docs/AGENT-GUIDE.md`](docs/AGENT-GUIDE.md)** — how to build, where things go, what bites, your environment's limits.
4. **[`docs/LAYOUT-AND-DESIGN.md`](docs/LAYOUT-AND-DESIGN.md)** — the app's look is fixed. Never change the layout; reuse the existing parts.
5. **[`docs/SKILLS.md`](docs/SKILLS.md)** — step lists for release, security gate, building a feature, writing a plan, checking a pull request
   (files in `.claude/skills/`).
6. **[`docs/DESIGN.md`](docs/DESIGN.md)** — how everything works, to look things up.

Three things above all:

- The maintainer is not a developer. Plain words, short answers.
- **Nothing he didn't ask for without his OK.** When he gives steps, do them in his order, nothing added.
- **Never touch a client's `data/` folder**, and never change the app's look.
