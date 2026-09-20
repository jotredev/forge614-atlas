# Atlas ↔ Engram: Sesiones Progresivas y Reportes de Módulo — Design

> **Alcance:** Solo la parte del Plan 2 que NO depende de `forge614-engines`
> (ver `STATE.md`). La detección/selección de motor de subagentes está
> bloqueada y fuera de este documento.
>
> **No autoridad sobre:** `FORGE614_ECOSYSTEM_CONTRACT.md` (autoridad
> máxima del ecosistema) y `docs/superpowers/specs/2026-09-18-atlas-orchestrator-design.md`
> (diseño general de Atlas). Este documento no puede contradecirlos.

## 1. Objetivo

Definir cómo Atlas usa el SDK de `forge614-engram` para:

1. Saber, al arrancar (`init` o `resume`, misma lógica), si un repo ya tiene
   una corrida de análisis a medias, completa, o nunca empezada.
2. Guardar el reporte de cada módulo apenas termina su mandadero (nunca al
   final de la corrida).
3. Cerrar la corrida con un resumen final cuando todos los módulos quedan
   analizados.

Nada de esto usa la CLI de Engram ni subprocesos — todo es SDK importado
directo (`forge614-engram`), consistente con la regla ya decidida en
`STATE.md` para operación en tiempo de ejecución.

## 2. Hallazgo crítico que determina el diseño

`Session.sessionId` es un identificador **global** en la base de Engram, no
uno con espacio de nombres por proyecto (`sessionRow(db, sessionId)` busca
solo por `sessionId`, sin `projectId`, en
`src/infrastructure/sqlite/sessions.ts` de Engram). Si Atlas usara un
`sessionId` fijo tipo `"atlas-analysis"` para todos los proyectos, el
segundo repo que se analizara chocaría con el primero
(`SESSION_CONFLICT`).

**Consecuencia de diseño:** el `sessionId` de Atlas debe derivarse de forma
determinista de la ruta canónica del repo, nunca ser un literal fijo
compartido entre proyectos.

`startRuntimeSession` (la función interna detrás de `startProjectSession`)
además es **idempotente por diseño**:

- Si el `sessionId` no existe → la crea.
- Si existe, es del mismo proyecto, tipo `"runtime"` y sigue abierta
  (`endedAt === null`) → la devuelve tal cual, sin error.
- Si existe pero ya está cerrada (`endedAt !== null`), o pertenece a otro
  proyecto → lanza `MemoryError` con `code: "SESSION_CONFLICT"`.

Esto significa que Atlas **no necesita ningún export nuevo de Engram para
la parte de sesión** (ni `resolveProjectContext`, ni un "getSession por
directorio"). Basta con llamar siempre `startProjectSession` y decidir qué
hacer según el resultado: éxito, o el error específico `SESSION_CONFLICT`.

**Corrección (encontrada al planificar en detalle):** sí hace falta un
cambio pequeño en Engram, pero distinto al que se pensó originalmente
(exportar `detectAssistants` — eso ya quedó descartado, ver `STATE.md`).
El SDK no tiene ninguna forma pública de preguntar "¿ya existe un recuerdo
con este `topicKey`?" — la única consulta por `topic_key` que existe hoy es
privada, dentro de `src/infrastructure/sqlite/writes.ts` (usada solo para
el resumen de sesión). Sin esto, Atlas no puede saber qué módulos ya
quedaron guardados al reanudar. La sección 4.1 detalla el cambio exacto
pedido.

## 3. Esquema de identificadores

- **`sessionId`**: `` `atlas:${shortHash(canonicalDirectory)}` `` — hash
  corto (ej. primeros 16 caracteres hex de SHA-256 de la ruta absoluta
  normalizada), calculado con `node:crypto`, sin dependencias nuevas.
  Determinista: mismo repo → mismo id siempre.
- **`topicKey` por módulo**: `` `atlas:module:${moduleName}` `` — permite
  que el reporte de un módulo sea una entidad versionable y consultable
  (usa `expectedVersion` de Engram si el módulo se re-analiza dentro de la
  misma corrida).
- **`type`**: `"fact"` — el más genérico de los 5 tipos que ya expone
  Engram (`fact`, `decision`, `procedure`, `warning`, `preference`); no
  hace falta un tipo nuevo.

## 4. Flujo de `init` / `resume` (idéntica lógica en ambos comandos)

```text
sessionId = deriveSessionId(canonicalDirectory)

try:
  session = startProjectSession(store, directory, sessionId)
catch MemoryError as e:
  if e.code == "SESSION_CONFLICT":
    → este repo ya tiene una corrida CERRADA (completa) con este id.
      Avisar "ya se analizó este repositorio; usa --force para repetir"
      y terminar sin gastar tokens. (Confirmado con el usuario: este es
      el comportamiento correcto, no re-analizar automático.)
  else: re-lanzar (error real, no de conflicto de sesión)

# Si llegamos aquí, `session` es una sesión abierta (nueva o retomada).
# session.projectId ya viene incluido en el objeto Session devuelto —
# no hace falta resolverlo aparte.
modules = discoverModules(root)  # Atlas ya sabe los nombres de módulo posibles

completedModules = new Set()
for module in modules:
  existing = store.getByTopic(session.projectId, `atlas:module:${module.name}`)
  if existing !== null:
    completedModules.add(module.name)

pending = modules filtrados: excluir los que ya están en `completedModules`

# seguir el pipeline normal de scoring/tiering solo sobre `pending`
```

**Por qué no se usa `timeline`:** `TimelineInput` requiere `memoryId` y
`version` ya conocidos (sirve para "qué pasó alrededor de ESTE recuerdo",
no para enumerar todo lo guardado en una sesión). Como Atlas ya conoce de
antemano los nombres de módulo posibles (los calcula del sistema de
archivos con `discoverModules`), no necesita "listar la sesión" — solo
necesita preguntar, módulo por módulo, "¿ya existe un recuerdo con este
`topicKey`?". Ver sección 4.1 para el cambio que esto requiere en Engram.

### 4.1 Cambio requerido en `forge614-engram`

El SDK no expone ninguna forma de buscar un recuerdo por `topicKey` (solo
por `id`, que Atlas no conoce de antemano). Se necesita agregar, siguiendo
exactamente el patrón que ya existe para `get()`:

- `src/infrastructure/sqlite/memory.ts`: nueva función `getByTopic(db,
  projectId, topicKey)`, misma forma que `get()` pero con
  `WHERE projectId IS ? AND topic_key=?` en vez de `AND id=?`.
- `src/app/memory-store.ts`: nuevo método `getByTopic(projectId, topicKey):
  Memory | null` en la clase `MemoryStore`, mismo patrón que el método
  `get()` existente.

**No hace falta tocar `src/index.ts`** — `MemoryStore` ya se exporta
completa como clase, así que agregar el método la hace disponible
automáticamente vía SDK.

**Estado: ✅ Resuelto.** `forge614-engram` v1.1.0 ya expone `getByTopic`
tal cual se pidió (verificado en el código real, `bun test` de ese repo:
408 pass, 0 fail). Ya no bloquea la implementación de `run-state.ts`.

`--force` (repo con sesión ya cerrada, se pide repetir): usar un
`sessionId` distinto para la nueva corrida, por ejemplo agregando un sufijo
de timestamp al hash (`atlas:${hash}:${Date.now()}`), ya que una sesión
cerrada no puede reabrirse con el mismo id. La sesión anterior no se borra
— queda como historial.

## 5. Guardar el reporte de un módulo (apenas termina, no al final)

```typescript
saveProjectMemoryWithSession(store, directory, {
  type: "fact",
  topicKey: `atlas:module:${moduleName}`,
  title: `Atlas: ${moduleName}`,
  content: reportText, // lo que devuelva el mandadero (formato: Plan 4)
}, { sessionId });
```

Solo Atlas llama esto — nunca los mandaderos directamente (regla ya
decidida en `STATE.md`).

## 6. Pausa (cuota agotada / interrupción)

Atlas simplemente se detiene. **No** llama `endSession`. La sesión sigue
abierta — eso ES la señal de "quedó a medias", sin necesidad de ningún
estado adicional que mantener. El próximo `init` o `resume` sobre el mismo
repo la encuentra abierta automáticamente por el flujo de la sección 4.

## 7. Cierre al completar el 100% de los módulos

Mapeo del reporte final de Atlas (ya definido en `STATE.md`: motor/modelo
por nivel, total de mandaderos por nivel, tokens consumidos, tiempo total,
pausas/reanudaciones) a los 6 campos fijos que exige `SummaryFields` en
Engram:

| Campo de Engram | Contenido de Atlas |
|---|---|
| `goal` | `"Contextualización profunda de <nombre-repo>"` |
| `instructions` | Generado automáticamente; en blanco o nota fija |
| `discoveries` | Resumen de la distribución de tiers (cuántos módulos Ligero/Estándar/Profundo) |
| `accomplishments` | El reporte final formateado: motor/modelo por nivel, total de mandaderos, tokens, tiempo total, pausas/reanudaciones |
| `nextSteps` | `"Ninguno; análisis completo."` o lista de módulos que fallaron/se saltaron, si los hay |
| `files` | Lista de nombres de módulo analizados |

```typescript
store.saveSessionSummary(projectId, sessionId, fields, { requestKey });
store.endSession(projectId, sessionId);
```

Nota: `saveSessionSummary` y `endSession` requieren `projectId` (no
`directory`). En este punto del flujo ya lo tenemos disponible porque
`session` (de la sección 4) es un `Session` que incluye `projectId`.

## 8. Manejo de errores

- `SESSION_CONFLICT` en `startProjectSession` → caso normal de "ya
  analizado", no es un error real (sección 4).
- Cualquier otro `MemoryError` (ej. `PROJECT_NOT_FOUND` si el binding se
  corrompió) → Atlas lo deja propagar; no intenta adivinar una
  recuperación silenciosa.
- `computeChurn` puede lanzar si el directorio no es un repo git o no
  tiene commits — ya documentado como pendiente del Plan 3 en `STATE.md`,
  no se resuelve aquí.

## 9. Testing

- Unit tests con una base de datos Engram real en un directorio temporal
  (mismo patrón que usan los tests de Engram: `mkdtempSync` + `MemoryStore`
  real, no mocks — consistente con la memoria de feedback del usuario de
  no mockear contra bases de datos).
- Casos a cubrir:
  1. Repo nuevo → sesión se crea, `timeline` vacío, todos los módulos se
     analizan.
  2. Repo con sesión abierta y 2 de 5 módulos ya guardados → se saltan
     esos 2, se analizan los 3 restantes.
  3. Repo con sesión cerrada → `init` sin `--force` avisa y no hace nada;
     con `--force` crea una sesión nueva con id distinto.
  4. Dos repos distintos analizados en la misma base de Engram → no hay
     colisión de `sessionId` entre ellos.
  5. Guardar 2+ reportes para el mismo módulo en corridas separadas
     (re-análisis) → usa `expectedVersion`/versionado de `topicKey`
     correctamente, no lanza `SESSION_CONFLICT` ni duplica.

## 10. Fuera de alcance de este documento

- Selección de motor de subagente (bloqueado por `forge614-engines`, ver
  `STATE.md`).
- Formato exacto del `reportText` que produce un mandadero (Plan 4).
- CLI (`init`/`resume`, parseo de `--force`) — eso es Plan 3; este
  documento define solo las funciones de integración con Engram que Plan 3
  y Plan 4 van a llamar.
