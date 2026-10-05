# 07.01 Configuración del Entorno y Punto de Entrada

[Traducción hermana: 07.01 (EN) Environment Configuration and Entry Point](../../en/07-structure/01-configuration-and-entry-point.md)

## Para qué sirve

Configura las reglas de compilación, las ignorancias del control de versiones y el punto de acceso principal para quien importe la librería Atlas. Como ejemplo de la vida real, es como la recepción de un edificio, donde están las normas (`tsconfig.json` y `.gitignore`) y un directorio o recepcionista (`src/index.ts`) que redirige a las distintas oficinas (módulos).

## Archivos

- `tsconfig.json`: Reglas de compilación y tipado estricto para TypeScript (sin enlace a ficha).
- `.gitignore`: Lista de carpetas y archivos que Git ignora (sin enlace a ficha).
- `src/index.ts`: Punto de entrada de la librería; reexporta las funciones públicas agrupadas en 11 secciones ([Ficha en el Capítulo 06](../06-referencia-api-typescript.md)).
- Para `package.json`, ver el [Capítulo 13](../13-metadatos-del-paquete.md).

## Cómo funciona

1. `tsconfig.json` define reglas para compilar a `ESNext` y usar el motor `Bun`.
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
   - Sección 9: Cliente de Engines (`src/index.ts:41`).
   - Sección 10: Núcleo del CLI (`src/index.ts:47`).
   - Sección 11: Cliente de Workers (`src/index.ts:55`).

## Casos borde y decisiones

- Punto de entrada unificado: Al usar un solo archivo `index.ts` como barril, los importadores externos no necesitan conocer la estructura interna de `src/modules/` o `src/interfaces/` (`src/index.ts:1-7`).

## Pruebas

| Prueba | Qué comprueba |
|--------|---------------|
| (Sin pruebas directas) | La configuración y el barril no contienen lógica ejecutable que requiera pruebas unitarias propias. |

## Dónde se usa

- `tsconfig.json`: Usado por `bun test`, `bun run typecheck` y la compilación.
- `.gitignore`: Usado por Git para evitar seguimiento de ciertas rutas.
- `src/index.ts`: Importado externamente por el orquestador general o el CLI cuando usan la librería.
