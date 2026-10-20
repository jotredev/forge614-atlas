# 0001 — Dependencia de Engram fijada por tag de Git a v1.10.0

**Fecha:** 2026-10-19
**Estado:** aceptada
**Sesión:** tablero-34d95456

## Contexto

Atlas utiliza Engram como biblioteca TypeScript compilada (SDK público) para la persistencia de sesiones, temas y reportes de análisis. En versiones anteriores, la dependencia se especificaba mediante rutas locales relativas en el sistema de archivos (`file:../forge614-engram`), lo que impedía que copias limpias (por ejemplo en corredores de integración continua de GitHub Actions o en instalaciones sin repositorios hermanos clonados) pudieran ejecutar `bun install` de forma reproducible.

En el tablero `34d95456`, se requirió resolver cómo llega Engram a la CI de la plantilla estándar y garantizar instalaciones limpias y reproducibles sin directorios hermanos.

## Decisión

Fijar la dependencia de Engram en `package.json` mediante un tag de Git pinned con commit rastreado en el archivo de bloqueo `bun.lock`:
`"forge614-engram": "github:jotredev/forge614-engram#v1.10.0"`.

Asimismo, en la ficha técnica `forge614.node.json` se declara:
```json
"dependencies": {
  "forge614-engram": {
    "minimumVersion": "1.10.0"
  }
}
```

Se establece una prueba de sanidad en `test/versions.test.ts` que valida en cada ejecución que el tag de `forge614-engram` en `package.json` coincida exactamente con la propiedad `minimumVersion` declarada en `forge614.node.json`.

## Alternativas descartadas

- **Mantener dependencia local `file:../forge614-engram`:** Descartada porque rompe la portabilidad en entornos de CI y en cualquier entorno donde no existan carpetas clonadas contiguas.
- **Vendoring (copiar código fuente de Engram en Atlas):** Descartada porque viola la separación modular de responsabilidades y la arquitectura de nodos independientes del ecosistema Forge614.
- **Publicación en npm público:** Descartada para mantener el control de versionado y distribución interna del ecosistema.

## Consecuencias

- `bun install --frozen-lockfile` se completa con éxito y de manera reproducible en copias limpias sin depender de rutas locales.
- La versión de Engram compilada en Atlas permanece sincronizada con el contrato mínimo de versión exigido por la ficha técnica del ecosistema.
