# 07.09 Arnés de Pruebas de Sanidad (Scaffold)

[Traducción hermana: 07.09 (EN) Test Harness Sanity](../../en/07-structure/09-test-harness-sanity.md)

## Para qué sirve

Garantiza que el ejecutor de pruebas (`bun test`) está correctamente instalado, configurado y es capaz de correr aserciones. En la vida real, es como probar que el micrófono está encendido diciendo "Probando, uno, dos, tres" antes de empezar el discurso: si el micrófono no funciona, no importa lo que vayas a decir.

## Archivos

- `src/modules/scoring/scaffold.test.ts`: Prueba unitaria aislada que no prueba el código de la librería, sino al propio motor de pruebas (sin enlace a ficha).

## Cómo funciona

1. El archivo contiene un único bloque `describe` que no importa ninguna función del proyecto.
2. Contiene una sola prueba con una aserción matemática trivial (`expect(1 + 1).toBe(2)`).
3. La suite de pruebas completa del proyecto se ejecuta corriendo `bun test` en la terminal (definido en `package.json`).
4. Para la verificación de tipos, la suite incluye la ejecución de `bun run typecheck`, que internamente llama a `tsc --noEmit`.

## Casos borde y decisiones

- Aislamiento de configuración: Si las pruebas complejas fallan, es útil saber de un vistazo si están fallando por errores lógicos o porque el entorno local de Bun está roto. Si esta prueba mínima también falla, se deduce inmediatamente que el problema está en la instalación local, no en el código de Atlas.

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| `the test runner is wired up` | Verifica que `1 + 1` es `2`; no prueba código de Atlas, solo que el ejecutor encuentra una prueba y su aserción `expect` funciona. |

## Dónde se usa

- Este archivo no es importado por ningún otro módulo de la librería. Es detectado y ejecutado automáticamente cuando el orquestador o el desarrollador ejecuta `bun test`.
