# How a security finding is handled

Checks: [Rust security check](https://github.com/GFGMNET/Workspace/actions/workflows/rust-security.yml) · [CodeQL](https://github.com/GFGMNET/Workspace/security/code-scanning) · Open: [label security](https://github.com/GFGMNET/Workspace/issues?q=is%3Aissue+is%3Aopen+label%3Asecurity) · Wiki: [Known security issues](https://github.com/GFGMNET/Workspace/wiki/Known-security-issues)

```mermaid
flowchart TD
   A["Finding: Rust security check, CodeQL or a report"] --> B["Issue with label security, one per real problem<br/>(the Rust security check opens a message with label security-check)"]
   B --> C["Fixed first, like a bug — also during a code freeze"]
   C --> D{"A Rust library?"}
   D -->|Yes| E["Actions: Rust lock update with the crate names<br/>→ commit the new Cargo.lock from branch rust-lock-update"]
   D -->|No| F["Fix the code"]
   E --> G["Checks run again"]
   F --> G
   G --> H{"Clean?"}
   H -->|No| C
   H -->|Yes| I["Issue closed; release notes: Security"]
   I --> R{"Is the affected version already released?"}
   R -->|Yes| U["Urgent fix version as soon as possible<br/>(e.g. 1.0.1 → 1.0.1.1) — URGENT-FIX-WORKFLOW"]
   R -->|No| V["Goes out with the open version"]
   U --> J([End])
   V --> J
```

Never release with a failing security check.
