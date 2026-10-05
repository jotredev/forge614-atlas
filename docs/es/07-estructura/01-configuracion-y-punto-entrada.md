# 07.01 Configuración del Entorno y Punto de Entrada

[Traducción hermana: 07.01 (EN) Environment Configuration and Entry Point](../../en/07-structure/01-configuration-and-entry-point.md)

## Para qué sirve

Configura las reglas de compilación, las exclusiones del control de versiones y el punto de acceso principal para quien importe la librería Atlas. Como ejemplo de la vida real, es como la recepción de un edificio, donde están las normas (`tsconfig.json` y `.gitignore`) y un directorio o recepcionista (`src/index.ts`) que redirige a las distintas oficinas (módulos).

## Archivos

- `tsconfig.json`: Reglas de compilación y tipado estricto para TypeScript (no tiene ficha en otro capítulo).
- `.gitignore`: Lista de carpetas y archivos que Git ignora (no tiene ficha en otro capítulo).
- `src/index.ts`: Punto de entrada de la librería; reexporta las funciones públicas agrupadas en 11 secciones ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).
- Para `package.json`, ver el [Capítulo 13](../13-archivos-de-datos.md#packagejson).

## Cómo funciona

1. `tsconfig.json` activa el modo estricto de TypeScript (`strict`), fija `ESNext` como destino y formato de módulos, y declara los tipos de Bun (`types: ["bun-types"]`); lo lee `tsc --noEmit` (`bun run typecheck`), que solo revisa tipos y no genera archivos.
2. `.gitignore` oculta las dependencias locales, las salidas de compilación y los secretos, manteniendo el repositorio limpio.
3. `src/index.ts` no contiene lógica, sino que reexporta elementos agrupados en estas secciones:
   - Sección 1: Descubrimiento de módulos (`src/index.ts:9`).
   - Sección 2: Complejidad ciclomática (`src/index.ts:13`).
   - Sección 3: Centralidad de dependencias (`src/index.ts:16`).
   - Sección 4: Volatilidad de Git (`src/index.ts:19`).
   - Sección 5: Brecha de cobertura (`src/index.ts:22`).
   - Sección 6: Puntuación compuesta (`src/index.ts:25`).
   - Sección 7: Asignación de niveles (`src/index.ts:29`).
   - Sección 8: Integración con Engram (`src/index.ts:33`).
   - Sección 9: Cliente de Engines (`src/index.ts:42`).
   - Sección 10: Núcleo del CLI (`src/index.ts:49`).
   - Sección 11: Cliente de Workers (`src/index.ts:57`).

## Casos borde y decisiones

- Punto de entrada unificado: Un solo archivo `index.ts` (un «barril»: un archivo que solo reúne y reexporta lo que otros definen, `src/index.ts:2-3`) permite que quien importe Atlas como librería no necesite conocer la estructura interna de `src/modules/` ni de `src/interfaces/`.

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| (Sin pruebas directas) | La configuración y el barril no contienen lógica ejecutable que requiera pruebas unitarias propias. |

## Dónde se usa

- `tsconfig.json`: Lo usa `bun run typecheck` (`tsc --noEmit`); el binario lo genera `bun build` (`package.json`, `scripts.build`).
- `.gitignore`: Usado por Git para evitar seguimiento de ciertas rutas.
- `src/index.ts`: Ningún otro archivo de este repositorio lo importa (el programa, `src/interfaces/cli/commands.ts:9-14`, importa los módulos directamente); existe para quien use Atlas como librería, porque `package.json` lo declara en `exports` (`package.json:7`).
