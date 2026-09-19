# 05. Proceso SDD, Catálogo de Defectos y Decisiones Diferidas

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Metodología:** Desarrollo Dirigido por Subagentes (*Subagent-Driven Development - SDD*)  
> **Auditoría de Rama:** 17 commits | 20 archivos (953 líneas de código y pruebas) | 5 defectos corregidos | 2 decisiones diferidas  
> **Traducción hermana:** [05 (EN). SDD Process, Defect Catalog, and Deferred Decisions](../en/05-sdd-process-and-defect-catalog.md)

---

## 1. El Proceso de Desarrollo Dirigido por Subagentes (SDD)

La implementación del Plan 1 se ejecutó siguiendo la disciplina de **Desarrollo Dirigido por Subagentes (SDD)**:
- Cada tarea del plan fue ejecutada por una pareja de agentes de IA: un **implementador** (que escribe la prueba fallida, el código mínimo y corre la verificación) y un **revisor** (que audita el código contra las restricciones globales antes de emitir el commit).
- Se ejecutaron 8 tareas secuenciales:
  1. Andamiaje del proyecto Bun/TypeScript y arnés de pruebas (`package.json`, `tsconfig.json`, `scaffold.test.ts`).
  2. Descubrimiento y filtrado de módulos (`discovery.ts`).
  3. Cálculo de complejidad ciclomática vía AST de TypeScript (`cyclomatic.ts`).
  4. Centralidad de dependencias relativas *Fan-In* (`fan-in.ts`).
  5. Volatilidad histórica en Git *Churn* (`churn.ts`).
  6. Cálculo de brecha de pruebas unitarias hermanas (`test-coverage-gap.ts`).
  7. Puntaje compuesto ponderado y normalización min-max (`composite-score.ts`).
  8. Clasificación en niveles por percentiles y exportación barril (`tiers.ts`, `src/index.ts`).

---

## 2. Historial Completo de Commits (17 commits sobre `main`)

| Hash | Mensaje del Commit | Tipo | Propósito |
|:---:|---|:---:|---|
| `d5a7d79` | `Expand .gitignore to match ecosystem conventions` | chore | Alineación de exclusiones con `forge614-shell` y `forge614-engram`. |
| `ff2ad90` | `feat: add src/index.ts barrel export for public scoring library surface` | feat | Exportación pública formal de tipos y funciones de scoring. |
| `b679879` | `fix: disable git path-quoting so churn works for non-ASCII module names` | fix | Soporte UTF-8 en `git log` mediante `-c core.quotepath=false`. |
| `1f3d862` | `fix: deterministic ordering for module discovery and tier assignment` | fix | Orden alfabético en módulos/archivos y desempate por nombre en niveles. |
| `951dd07` | `fix: fan-in counts distinct modules and excludes test files from complexity/fan-in` | fix | Corrección de conteo de clientes únicos y exclusión de tests en AST/fan-in. |
| `4981714` | `feat: assign percentile-based complexity tiers` | feat | Asignación de tiers Profundo (15%), Estándar (35%) y Ligero (50%). |
| `63c27a9` | `feat: compute weighted composite complexity score per module` | feat | Normalización Min-Max, pesos $0.35/0.35/0.30$ y modificador de pruebas. |
| `f11ebe8` | `feat: compute test coverage gap per module` | feat | Detección estática de pruebas hermanas (`.test.*` / `.spec.*`). |
| `d5ab888` | `fix: use path-boundary check for module attribution in computeChurn` | fix | Validación de frontera de ruta de directorios en Git churn. |
| `cf92cff` | `feat: compute git churn per module` | feat | Conteo de modificaciones de archivos en historial de commits. |
| `4a5fc77` | `fix: use path-boundary check for module attribution in fan-in` | fix | Prevención de colisiones entre prefijos de carpetas en fan-in. |
| `108447f` | `feat: compute fan-in centrality per module` | feat | Resolución estática de imports y exports relativos. |
| `efb32fc` | `feat: compute cyclomatic complexity per module` | feat | AST de TypeScript para conteo McCabe de bifurcaciones lógicas. |
| `ebf7ca3` | `fix: exclude nested dot-directories from file scanning in discoverModules` | fix | Exclusión de carpetas ocultas anidadas en escaneo de archivos. |
| `e36b14f` | `feat: discover project modules for complexity scoring` | feat | Escaneo de carpetas de primer nivel con código fuente. |
| `192c423` | `chore: scaffold Bun/TypeScript project` | chore | Configuración de Bun, TypeScript 5.9 y arnés de pruebas. |
| `942b063` | `Add .gitignore for build artifacts and SDD scratch workspace` | chore | Configuración inicial de Git en el repositorio. |

---

## 3. Auditoría de Rama: Los 5 Defectos Detectados y Corregidos

Al concluir las 8 tareas, se realizó una auditoría cruzada integral de toda la rama (`atlas/plan1-complexity-scoring`). Aunque todas las pruebas aisladas de cada tarea pasaban, la visión holística del sistema reveló 5 defectos arquitectónicos sutiles:

### Defecto 1: Fan-In contaba importaciones individuales en lugar de módulos distintos
- **El problema:** Si un archivo `usuario.ts` dentro del módulo `admin` importaba tres utilidades distintas del módulo `auth`, el contador de *fan-in* de `auth` se incrementaba en $+3$. Esto inflaba artificialmente la centralidad arquitectónica si un solo consumidor hacía muchas importaciones.
- **La corrección:** En `src/modules/scoring/fan-in.ts`, se incorporó una colección `targetModuleNames = new Set<string>()` por cada módulo origen. Ahora $FanIn$ cuenta estrictamente **módulos clientes únicos**, reflejando la verdadera centralidad de grado en el grafo de software (commit `951dd07`).

### Defecto 2: Los archivos de prueba inflaban la complejidad ciclomática y el Fan-In
- **El problema:** Si un módulo desarrollaba una suite de pruebas exhaustiva con 50 casos de prueba y múltiples fixtures de prueba, esos archivos sumaban complejidad ciclomática McCabe y generaban dependencias de importación ficticias hacia otros módulos.
- **La corrección:** Se aplicó la función `isTestFile(filePath)` en `cyclomatic.ts` y `fan-in.ts`, ignorando sistemáticamente cualquier archivo `*.test.*` o `*.spec.*` en el cálculo de producción (commit `951dd07`).

### Defecto 3: Orden no determinista en descubrimiento y asignación de niveles
- **El problema:** La función `readdirSync` del sistema operativo devuelve entradas en orden arbitrario según el sistema de archivos. Asimismo, si dos módulos tenían el mismo puntaje compuesto, el método `sort((a, b) => b.score - a.score)` producía un orden oscilante entre ejecuciones.
- **La corrección:** Se agregó ordenamiento alfabético explícito en `discovery.ts` (`.sort((a, b) => a.localeCompare(b))`) y en `tiers.ts` se introdujo el desempate determinista `b.score - a.score || a.name.localeCompare(b.name)` (commit `1f3d862`).

### Defecto 4: Rutas no-ASCII (español) arrojaban Churn = 0 por escape octal de Git
- **El problema:** Git, por configuración predeterminada (`core.quotepath = true`), escapa cualquier byte no ASCII (como la letra `ñ`, tildes en español o acentos) mediante secuencias octales (ej. `"dise\303\261o"`). Cuando `churn.ts` comparaba la ruta devuelta por Git contra la ruta física en disco (`diseño`), la comparación de cadenas fallaba, asignando $Churn = 0$.
- **La corrección:** Se modificó la invocación de Git en `churn.ts` para ejecutar:
  ```bash
  git -c core.quotepath=false log --format= --name-only
  ```
  Esto desactiva el entrecomillado y emite UTF-8 limpio, verificándose con una prueba unitaria con nombres de carpetas en español (`churn.test.ts`, commit `b679879`).

### Defecto 5: `package.json` apuntaba a un punto de entrada inexistente
- **El problema:** `package.json` definía `"exports": "./src/index.ts"`, pero el archivo `src/index.ts` aún no había sido creado, impidiendo que el paquete pudiera importarse externamente como librería.
- **La corrección:** Se creó `src/index.ts` como exportador barril exhaustivo que publica todas las funciones e interfaces de tipos (commit `ff2ad90`).

---

## 4. Decisiones Arquitectónicas Explícitamente Diferidas al Plan 3

Durante el desarrollo del Plan 1, se identificaron dos comportamientos que no debían resolverse de forma precipitada en la librería de cálculo puro, sino integrarse con el contexto del orquestador en el **Plan 3**:

### Decisión Diferida 1: Manejo de repositorios Git sin commits o carpetas no-git
- **Estado en Plan 1:** `computeChurn(repoRoot, modules)` lanza una excepción explícita si `repoRoot` no es un repositorio de Git o si `git log` retorna código de error (por ejemplo, en un repositorio recién inicializado con `git init` pero que tiene cero commits).
- **Mandato para el Plan 3:** El orquestador del Plan 3 debe decidir formalmente si en repositorios sin historial de Git el *churn* debe **degradarse suavemente** (asignando $Churn = 0$ a todos los módulos y redistribuyendo los pesos entre ciclomática y *fan-in*) en lugar de abortar la ejecución completa.
- **Documentación en código:** Comentario explícito en `src/modules/scoring/churn.ts#L8-L10`.

### Decisión Diferida 2: Descubrimiento de módulos en arquitecturas anidadas
- **Estado en Plan 1:** `discoverModules(root)` inspecciona únicamente las carpetas de **primer nivel** a partir de la raíz dada. En un repositorio típico con estructura `src/{auth, billing, catalog, ui}`, hoy colapsa todo el código en un único módulo llamado `"src"`.
- **Mandato para el Plan 3:** El Plan 3 debe implementar la adaptación de raíz de análisis (*root analysis adaptation*): si la raíz solo contiene una carpeta principal de código (como `src/`, `packages/` o `lib/`), el orquestador debe descender automáticamente un nivel para puntuar los submódulos reales de negocio.
- **Documentación en código:** Comentario de diseño en `src/modules/scoring/discovery.ts`.
