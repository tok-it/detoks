# Dependency Workflow

Use the repository root as the single source of truth for dependencies:

- Runtime and development dependencies go in `package.json`.
- The lockfile is `package-lock.json`.
- Do not add secondary dependency manifests under feature folders.

## Why

- avoids scattered dependency files
- keeps version control simple
- prevents team members from adding packages in inconsistent places
- keeps the runtime boundary aligned with the Node-only application architecture

## TypeScript Workflow

Run npm commands from the repository root:

```bash
npm install <package>
npm install -D <package>
npm install
```

Examples:

```bash
npm install zod
npm install -D vitest
npm install
```

## Rules

- Do not create extra `package.json` files under `src/*`.
- If a dependency is shared by multiple TypeScript modules, add it once at the root.
- Keep runtime dependencies and dev-only tooling separated with `dependencies` and `devDependencies`.
- Prefer built-in Node APIs when they meet the need without adding meaningful complexity.
- Any package that affects the runtime boundary must be documented in `docs/STACK_VERSIONS.md`.

## Tooling Note

The dependency workflow assumes npm and the root lockfile. Install and update packages through npm so the manifest and lockfile remain consistent.
