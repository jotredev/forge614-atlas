# 07.09 Arnés de Pruebas de Sanidad (Scaffold)

[Traducción hermana: 07.09 (EN) Test Harness Sanity](../../en/07-structure/09-test-harness-sanity.md)

## Para qué sirve

Comprueba que el ejecutor de pruebas (`bun test`) encuentra y corre una prueba y que su aserción `expect` responde. En la vida real, es como probar que el micrófono está encendido diciendo "Probando, uno, dos, tres" antes de empezar el discurso: si el micrófono no funciona, no importa lo que vayas a decir.

## Archivos

- `src/modules/scoring/scaffold.test.ts`: Prueba unitaria aislada que no prueba el código de la librería, sino al propio motor de pruebas (no tiene ficha en otro capítulo).

## Cómo funciona

1. El archivo contiene un único bloque `describe` que no importa ninguna función del proyecto (`src/modules/scoring/scaffold.test.ts:11`).
2. Contiene una sola prueba con una aserción matemática trivial (`expect(1 + 1).toBe(2)`) (`src/modules/scoring/scaffold.test.ts:16-19`).
3. La suite de pruebas completa del proyecto se ejecuta corriendo `bun test` en la terminal (definido en `package.json`).
4. La verificación de tipos no forma parte de esta prueba ni de `bun test`: se corre aparte con `bun run typecheck`, que internamente llama a `tsc --noEmit` (`package.json`, `scripts.typecheck`); la CI la ejecuta después de las pruebas (`.github/workflows/verify.yml:66`).

## Casos borde y decisiones

- Aislamiento de configuración: Si las pruebas complejas fallan, es útil saber de un vistazo si están fallando por errores lógicos o porque el entorno local de Bun está roto. Si esta prueba mínima también falla, se deduce inmediatamente que el problema está en la instalación local, no en el código de Atlas.

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `the test runner is wired up` | Verifica que `1 + 1` es `2`; no prueba código de Atlas, solo que el ejecutor encuentra una prueba y su aserción `expect` funciona. |

## Dónde se usa

- Este archivo no es importado por ningún otro archivo del proyecto. `bun test` lo detecta y lo ejecuta por sí solo, tanto cuando lo corre quien desarrolla como en la CI (`.github/workflows/verify.yml:65`).
