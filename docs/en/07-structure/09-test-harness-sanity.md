# 07.09 Test Harness Sanity (Scaffold)

[Sister translation: 07.09 (ES) Arnés de Pruebas de Sanidad (Scaffold)](../../es/07-estructura/09-arnes-pruebas-sanidad.md)

## What it is for

Checks that the test runner (`bun test`) finds and runs a test and that its `expect` assertion responds. In real life, it is like testing if a microphone is on by saying "Testing, one, two, three" before starting a speech: if the mic is broken, it does not matter what you are going to say.

## Files

- `src/modules/scoring/scaffold.test.ts`: Isolated unit test that does not test the library's code, but rather the test engine itself (it has no card in another chapter).

## How it works

1. The file contains a single `describe` block that does not import any function from the project (`src/modules/scoring/scaffold.test.ts:11`).
2. Contains a single test with a trivial mathematical assertion (`expect(1 + 1).toBe(2)`) (`src/modules/scoring/scaffold.test.ts:16-19`).
3. The project's complete test suite is executed by running `bun test` in the terminal (defined in `package.json`).
4. Type checking is not part of this test or of `bun test`: it runs separately with `bun run typecheck`, which internally calls `tsc --noEmit` (`package.json`, `scripts.typecheck`); the CI runs it after the tests (`.github/workflows/verify.yml:66`).

## Edge cases and decisions

- Configuration isolation: If complex tests fail, it is useful to know at a glance whether they are failing due to logical errors or because the local Bun environment is broken. If this minimal test also fails, it is immediately deduced that the problem lies in the local installation, not in the Atlas code.

## Tests

| Test | What it checks |
|------|----------------|
| `the test runner is wired up` | Verifies that `1 + 1` is `2`; it does not test Atlas code, only that the runner finds a test and its `expect` assertion works. |

## Where it is used

- This file is not imported by any other file in the project. `bun test` detects and runs it on its own, both when a developer runs it and in the CI (`.github/workflows/verify.yml:65`).
