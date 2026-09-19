# Forge614 Atlas — Orquestador de Contextualización Profunda

**Fecha:** 2026-09-18
**Estado:** Diseño aprobado, pendiente de plan de implementación

## 1. Propósito

Forge614 Atlas es el orquestador del ecosistema Forge614 encargado de contextualizar un
repositorio "al 100%" — línea por línea, módulo por módulo — usando IA de terceros ya
instalada en la máquina del usuario (Claude Code, Codex), y de depositar ese entendimiento
en `forge614-engram` (memoria personal local) para que cualquier asistente futuro, en
cualquier ventana de contexto nueva, pueda recuperarlo sin tener que releer el repositorio
completo.

Atlas es independiente de `forge614-shell`: no importa ni depende de su código. Donde
comparte enfoque (detección de motores de IA en PATH, selector interactivo de motor), lo
reimplementa con sus propias piezas — reutilizando únicamente dependencias externas de npm
que ambos puedan consumir por separado (p. ej. `@earendil-works/pi-tui` para el menú de
flechas), nunca el paquete `forge614-shell` en sí.

## 2. Relación con el ecosistema

- **forge614-engram**: memoria personal local (SQLite FTS5, sesiones de memoria progresiva,
  servidor MCP con 10 herramientas). Atlas es su principal productor de conocimiento
  estructurado; los asistentes conversacionales (Claude Code, Pi, etc.) son sus
  consumidores vía MCP, ya resuelto por Engram y fuera del alcance de este diseño.
- **forge614-shell**: terminal multi-motor. No es una dependencia de Atlas. Su patrón de
  detección de motores y selector de IA sirve de referencia de diseño, pero el código de
  Atlas es propio.
- **forge614-atlas** (este proyecto): CLI standalone en Bun/TypeScript, sin relación de
  dependencia en tiempo de ejecución con Shell.

## 3. Instalación

Patrón técnico: el mismo que usa `forge614-engram` (binario único compilado, autocontenido,
sin Bun/Node en ejecución habitual) — **no** el patrón de `forge614-shell` (que requiere
Node.js instalado y extrae un tarball).

Experiencia de usuario:

```bash
curl -fsSL https://github.com/jotredev/forge614-atlas/releases/latest/download/install.sh | bash
```

El instalador:

1. Detecta sistema operativo/arquitectura y descarga el binario de Atlas correcto del
   último release en GitHub.
2. Verifica el binario descargado antes de instalarlo.
3. Lo coloca en `~/.local/bin/forge614-atlas` y ajusta el PATH si hace falta.
4. Verifica si `forge614-engram` ya está instalado; si no, lo instala usando su propio
   instalador (encadenado, no reimplementado).
5. Registra el servidor MCP de Engram en los asistentes de IA detectados en el equipo
   (reutilizando la detección de asistentes que Engram ya expone para ese propósito).

Al terminar, el usuario cierra y abre una nueva terminal y corre `forge614-atlas init`.

## 4. Comandos

- `forge614-atlas init` — primera pasada de contextualización completa de un repositorio.
- `forge614-atlas resume` — retoma una pasada interrumpida (por ejemplo, por cuota
  agotada), continuando solo con lo que falte.

Ninguno de los dos corre automáticamente durante la instalación; ambos son invocados
explícitamente por el usuario dentro de la carpeta del proyecto a contextualizar.

## 5. Selección de motor de IA

Al iniciar `init` o `resume`, Atlas:

1. Detecta qué ejecutables de IA soportados existen en el PATH del usuario (`claude`,
   `codex`). El legacy "Pi" queda explícitamente excluido, igual que ya lo excluye
   `forge614-shell` de su propia detección de conectores nativos.
2. Muestra siempre un menú interactivo de selección con flechas (estilo del selector de
   motor de `forge614-shell` / Orca), preguntando con cuál IA trabajar en esta corrida.
3. **No hay persistencia de esta elección.** Cada corrida vuelve a preguntar desde cero,
   sin archivo de configuración que la recuerde.
4. v1 soporta elegir **una sola IA por corrida** (no reparto simultáneo entre varias). Se
   deja la puerta abierta a soporte multi-motor simultáneo en una versión futura, fuera de
   alcance de este diseño.

Los subagentes se ejecutan como llamadas a la CLI del motor elegido en modo no interactivo
(headless/print mode), usando la sesión de suscripción ya autenticada del usuario — nunca
por API de pago.

## 6. División del trabajo

Unidad de trabajo = carpeta/módulo de primer o segundo nivel del proyecto, según su propia
estructura real. No se usa un tamaño fijo de líneas ni un número fijo de mandaderos: el
total de subagentes de una corrida es una consecuencia directa de cuántos módulos tiene el
proyecto.

## 7. Puntuación de complejidad (determinista, sin costo de IA)

Antes de despachar cualquier subagente, Atlas calcula un puntaje compuesto por módulo,
usando únicamente señales medibles y gratuitas (sin llamadas a modelos):

| Señal | Peso | Justificación |
|---|---|---|
| Centralidad de dependencias (fan-in: cuántos módulos importan este) | Alto | Mayor "radio de daño" si se entiende mal |
| Complejidad ciclomática (ramificaciones: if/else/switch/loops/&&/\|\|) | Alto | Métrica clásica (McCabe, 1976) de qué tan difícil es de entender bien |
| Volatilidad histórica (frecuencia de cambios en git) | Medio | Proxy validado de qué tan activa/importante es esa parte del código |
| Cobertura de pruebas | Penalización/modificador, no señal aditiva pareja | Solo empuja el puntaje hacia arriba cuando el módulo ya es complejo y además está poco probado |

## 8. Niveles por percentil dentro del propio proyecto

Los módulos se ordenan por puntaje compuesto, de mayor a menor, y se reparten por
percentil (no en partes iguales, porque en cualquier proyecto real la complejidad se
concentra en un núcleo chico):

| Nivel | Proporción aproximada | Perfil típico |
|---|---|---|
| Ligero | ~50% inferior | tipos, configuración, componentes de solo presentación, assets |
| Estándar | ~35% medio | lógica de negocio típica, componentes con estado |
| Profundo | ~15% superior | autenticación, pagos, motor central, hooks/helpers muy usados y con lógica compleja |

Esta repartición es relativa al propio proyecto, por lo que escala igual de bien en un
repositorio pequeño que en uno enorme.

## 9. Política de modelo y razonamiento por nivel y motor

**Regla dura, sin excepción:** el razonamiento nunca pasa de `medio` en ningún motor. Nunca
se usa `alto`, `xhigh`, `extra high`, `max` ni `ultra` — el costo de generar el contexto no
debe superar nunca el valor de lo que se va a desarrollar.

| Nivel | Claude Code | Codex |
|---|---|---|
| Ligero | Haiku 4.5 — razonamiento bajo | `gpt-5.6-luna` — razonamiento bajo |
| Estándar | Sonnet 5 — razonamiento medio | `gpt-5.6-terra` — razonamiento medio |
| Profundo | Opus 5 — razonamiento medio | `gpt-5.6-sol` — razonamiento medio |

Esta tabla vive como configuración pequeña y separada por motor (no enterrada en la lógica
de puntuación/reparto), porque los proveedores renombran modelos con frecuencia — ya
cambiaron de familia entre marzo y septiembre de 2026. Actualizar un nombre de modelo debe
ser editar esta tabla, no tocar el resto del sistema. Los nombres exactos de Codex deben
reverificarse contra la documentación oficial vigente al momento de implementar, por si
cambiaron de nuevo.

## 10. Concurrencia

Máximo **3 mandaderos corriendo al mismo tiempo**, fijo, no configurable por el usuario.
Este límite no cambia el gasto total de tokens de una corrida (eso depende del tamaño de
cada módulo y su nivel asignado), pero sí controla qué tan rápido se consume la ventana de
cuota de la suscripción, evitando reventarla de golpe en proyectos grandes.

## 11. Manejo de cuota agotada

Si el motor elegido reporta que se agotó la cuota de uso de la suscripción a medio proceso:

1. Atlas pausa el despacho de nuevos mandaderos.
2. Todo lo que ya se investigó **ya está guardado** en Engram (ver sección 12) — no se
   pierde ni se repite trabajo.
3. Atlas avisa al usuario del corte y de que puede continuar más adelante.
4. `forge614-atlas resume` retoma únicamente los módulos que aún no tengan reporte
   guardado, consultando a Engram qué falta antes de despachar más mandaderos.

## 12. Fuente de verdad del progreso: sesiones progresivas de Engram

Atlas no mantiene una base de datos propia de progreso. Cada corrida de `init`/`resume` es
una sesión de memoria progresiva de Engram. Cada vez que un mandadero termina su módulo, el
orquestador guarda ese reporte **de inmediato** (no al final de toda la corrida), asociado
a esa sesión. Esto evita tener dos memorias separadas que puedan desincronizarse: Engram es
la única fuente de verdad tanto del conocimiento generado como del progreso de la corrida.

## 13. Propiedad de la escritura en Engram

Solo el **orquestador** (Atlas) guarda en Engram — nunca los mandaderos directamente.
Regresar el texto del reporte del mandadero al orquestador (captura de salida de un
proceso) no tiene costo de tokens adicional; el gasto de tokens ya ocurrió al generar el
reporte, sin importar quién lo guarde después. Centralizar la escritura en el orquestador
da consistencia de etiquetado (misma sesión, misma ruta, mismo nivel, mismo modelo usado en
cada entrada) y es el mismo componente que ya necesita consultar a Engram para saber qué
falta al reanudar.

## 14. Integración técnica con Engram

Atlas importa el SDK público de TypeScript de Engram directamente en su código (ambos
proyectos son Bun/TypeScript) — no invoca el comando `forge614-engram` como proceso aparte
para guardar. Es más rápido (sin abrir un proceso nuevo por cada guardado) y con
verificación de tipos entre ambos proyectos.

## 15. Forma del reporte guardado

Narrativa libre y bien estructurada (qué hace el módulo, cómo funciona, decisiones y
patrones clave, dependencias importantes — como lo explicaría un desarrollador senior a
otro), acompañada de metadatos mínimos indispensables para poder ubicarlo después: ruta del
módulo, nivel asignado, modelo usado, identificador de sesión.

## 16. Proceso de implementación y documentación

La implementación de este diseño debe hacerse **por tareas discretas, no de una sola vez**.
Al terminar cada tarea (con sus cambios y validaciones ya corridas), se debe producir un
prompt de traspaso con: qué se hizo, qué se logró, y qué archivos se tocaron — dirigido a un
agente de documentación distinto que actualiza tanto el repositorio como Notion. Ese prompt
no debe explicar cómo documentar (el agente de documentación ya lo sabe); solo debe dar la
información fáctica de la tarea completada.

## 17. Fuera de alcance de este diseño (explícitamente diferido)

- Soporte multi-motor simultáneo (repartir un mismo proyecto entre Claude y Codex a la vez).
- Configurabilidad del límite de concurrencia.
- Persistencia de la elección de motor entre corridas.
- Detalles de implementación del selector/detección de motores más allá de las decisiones
  de este documento (se resuelven en el plan de implementación).
