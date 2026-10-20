# 0002 — Omisión de soporte para Windows en Atlas 1.2.0

**Fecha:** 2026-10-19
**Estado:** aceptada
**Sesión:** tablero-16b154f6

## Contexto

El estándar de instalador único (`install.mjs`) adoptado conforme al acta 0031 del ecosistema Forge614 contempla arquitecturas para macOS, Linux y Windows (`windows-x64`). Durante la sesión del tablero `16b154f6` (Decisión 2, 2026-10-19) se revisaron las prioridades de entrega para Atlas 1.2.0: adoptar el instalador único, migrar la compatibilidad a Engram 1.10.0 y sincronizar los contratos de actualización y desinstalación para macOS y Linux.

El soporte de compilación, empaquetado nativo y ciclo de vida en Windows requiere una adaptación específica de los pipelines y validaciones que se decidió programar en una versión posterior.

## Decisión

Excluir formalmente `windows-x64` de las plataformas soportadas en Atlas 1.2.0. En `forge614.node.json`, el bloque `install.systems` declara únicamente:
- `darwin-arm64`
- `darwin-x64`
- `linux-arm64`
- `linux-x64`

Si se invoca la instalación en un sistema Windows, el instalador universal `install.mjs` (función `requireSupportedSystem`) detecta la plataforma no soportada y detiene la ejecución limpiamente con código de salida 65 (`EXIT.REQUIREMENT`) y el mensaje `"unsupported system: windows-x64"`.

## Alternativas descartadas

- **Postergar la versión 1.2.0 hasta completar soporte para Windows:** Descartada porque retrasaría la adopción del estándar del instalador único y las correcciones de integración con Engram 1.10.0 en macOS y Linux.
- **Declarar `windows-x64` sin binarios funcionales probados:** Descartada porque infringiría las reglas de verificación de integridad y provocaría fallos en tiempo de ejecución.

## Consecuencias

- El control `installer` de Sentinel 0.2.1 falla de manera esperada y autorizada con la evidencia `install block is missing required system windows-x64` hasta que se publique la versión que incorpore soporte completo para Windows.
- Los flujos de integración continua en `.github/workflows/verify-platforms.yml` se enfocan exclusivamente en los 4 binarios y corredores soportados: macOS (arm64, x64) y Ubuntu (arm64, x64).
