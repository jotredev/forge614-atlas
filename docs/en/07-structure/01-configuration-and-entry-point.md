# 07.01 Environment Configuration and Entry Point

[Sister translation: 07.01 (ES) Configuración del Entorno y Punto de Entrada](../../es/07-estructura/01-configuracion-y-punto-entrada.md)

## What it is for

Configures compilation rules, version control ignores, and the main access point for anyone importing the Atlas library. As a real-life example, it is like the reception of a building, where the rules (`tsconfig.json` and `.gitignore`) are displayed and a directory or receptionist (`src/index.ts`) redirects to the different offices (modules).

## Files

- `tsconfig.json`: Compilation rules and strict typing for TypeScript (it has no card in another chapter).
- `.gitignore`: List of folders and files that Git ignores (it has no card in another chapter).
- `src/index.ts`: Entry point of the library; re-exports public functions grouped in 11 sections ([Card in Chapter 06](../06-typescript-api-reference.md)).
- For `package.json`, see [Chapter 13](../13-data-files.md#packagejson).

## How it works

1. `tsconfig.json` turns on TypeScript's strict mode (`strict`), sets `ESNext` as the target and module format, and declares the Bun types (`types: ["bun-types"]`); `tsc --noEmit` (`bun run typecheck`) reads it, and it only checks types and generates no files.
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
   - Section 9: Engines client (`src/index.ts:42`).
   - Section 10: CLI core (`src/index.ts:49`).
   - Section 11: Workers client (`src/index.ts:57`).

## Edge cases and decisions

- Unified entry point: A single `index.ts` (a “barrel”: a file that only gathers and re-exports what others define, `src/index.ts:2-3`) means that whoever imports Atlas as a library does not need to know the internal structure of `src/modules/` or `src/interfaces/`.

## Tests

| Test | What it checks |
|------|----------------|
| (No direct tests) | The configuration and the barrel file do not contain executable logic that requires standalone unit tests. |

## Where it is used

- `tsconfig.json`: Used by `bun run typecheck` (`tsc --noEmit`); the binary is produced by `bun build` (`package.json`, `scripts.build`).
- `.gitignore`: Used by Git to prevent tracking certain paths.
- `src/index.ts`: No other file in this repository imports it (the program, `src/interfaces/cli/commands.ts:9-14`, imports the modules directly); it exists for whoever uses Atlas as a library, because `package.json` declares it in `exports` (`package.json:7`).
