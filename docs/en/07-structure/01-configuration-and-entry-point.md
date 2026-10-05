# 07.01 Environment Configuration and Entry Point

[Sister translation: 07.01 (ES) Configuración del Entorno y Punto de Entrada](../../es/07-estructura/01-configuracion-y-punto-entrada.md)

## What it is for

Configures compilation rules, version control ignores, and the main access point for anyone importing the Atlas library. As a real-life example, it is like the reception of a building, where the rules (`tsconfig.json` and `.gitignore`) are displayed and a directory or receptionist (`src/index.ts`) redirects to the different offices (modules).

## Files

- `tsconfig.json`: Compilation rules and strict typing for TypeScript (no index card link).
- `.gitignore`: List of folders and files that Git ignores (no index card link).
- `src/index.ts`: Entry point of the library; re-exports public functions grouped in 11 sections ([Card in Chapter 06](../06-typescript-api-reference.md)).
- For `package.json`, see [Chapter 13](../13-package-metadata.md).

## How it works

1. `tsconfig.json` defines rules to compile to `ESNext` and use the `Bun` engine.
2. `.gitignore` hides local dependencies, build outputs, and secrets, keeping the repository clean.
3. `src/index.ts` contains no logic; instead, it re-exports elements grouped into these sections:
   - Section 1: Module discovery (`src/index.ts:9`).
   - Section 2: Cyclomatic complexity (`src/index.ts:13`).
   - Section 3: Fan-in dependency centrality (`src/index.ts:16`).
   - Section 4: Git volatility (`src/index.ts:19`).
   - Section 5: Coverage gap (`src/index.ts:22`).
   - Section 6: Composite score (`src/index.ts:25`).
   - Section 7: Tier allocation (`src/index.ts:29`).
   - Section 8: Engram integration (`src/index.ts:33`).
   - Section 9: Engines client (`src/index.ts:41`).
   - Section 10: CLI core (`src/index.ts:47`).
   - Section 11: Workers client (`src/index.ts:55`).

## Edge cases and decisions

- Unified entry point: By using a single `index.ts` barrel file, external importers do not need to know the internal structure of `src/modules/` or `src/interfaces/` (`src/index.ts:1-7`).

## Tests

| Test | What it checks |
|------|----------------|
| (No direct tests) | The configuration and the barrel file do not contain executable logic that requires standalone unit tests. |

## Where it is used

- `tsconfig.json`: Used by `bun test`, `bun run typecheck`, and the build process.
- `.gitignore`: Used by Git to prevent tracking certain paths.
- `src/index.ts`: Imported externally by the general orchestrator or CLI when using the library.
