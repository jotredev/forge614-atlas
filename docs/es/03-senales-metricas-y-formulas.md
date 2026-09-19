# 03. Señales, Métricas y Fórmulas Matemáticas

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Fundamento Teórico:** Teoría de Grafos de Flujo de Control (McCabe, 1976), Centralidad de Grado en Redes de Software y Modificadores Multiplicativos de Fragilidad  
> **Estado:** Implementado, validado y con 26 pruebas pasando  
> **Traducción hermana:** [03 (EN). Signals, Metrics, and Formulas](../en/03-signals-metrics-and-formulas.md)

---

## 1. El Sistema de Señales Objetivas

Para evitar el uso de heurísticas arbitrarias o modelos de lenguaje probabilísticos que cambian sus respuestas en cada ejecución, Forge614 Atlas extrae cuatro señales fundamentales del código fuente de cada módulo:

| Señal | Origen | Rango Típico | Peso Base | Función de Ponderación |
|---|---|:---:|:---:|---|
| **Complejidad Ciclomática** | Árbol sintáctico AST (TypeScript) | $[1, \infty)$ | **35%** ($0.35$) | Señal aditiva primaria |
| **Centralidad Fan-In** | Grafo de dependencias relativas | $[0, N-1]$ | **35%** ($0.35$) | Señal aditiva primaria |
| **Volatilidad Churn** | Historial de commits en Git | $[0, \infty)$ | **30%** ($0.30$) | Señal aditiva secundaria |
| **Brecha de Pruebas** | Existencia de archivos `*.test.*` | $[0.0, 1.0]$ | **Modificador (+0% a +20%)** | Factor multiplicativo de penalización |

---

## 2. Detalle de Cada Señal

### 2.1 Descubrimiento y Filtrado de Módulos (`discovery.ts`)
Antes de puntuar, el sistema escanea el directorio raíz del proyecto:
1. **Regla de inclusión:** Selecciona carpetas de primer nivel que contengan archivos de código fuente con extensiones admitidas: `.ts`, `.tsx`, `.js`, `.jsx`.
2. **Exclusiones estrictas:** Descarta de forma inmediata directorios de dependencias, artefactos de compilación y control de versiones:
   ```typescript
   const EXCLUDED_DIRS = new Set([
     "node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".forge614",
   ]);
   ```
3. **Ordenamiento alfabético determinista:** Tanto la lista de módulos como la lista de archivos dentro de cada módulo se ordenan con `localeCompare(b)`:
   ```typescript
   topLevelDirs.sort((a, b) => a.localeCompare(b));
   matches.sort((a, b) => a.localeCompare(b));
   ```
4. **Detección de archivos de prueba:**
   ```typescript
   export function isTestFile(filePath: string): boolean {
     return /\.(test|spec)\.[tj]sx?$/.test(filePath);
   }
   ```

---

### 2.2 Complejidad Ciclomática (`cyclomatic.ts`)
Desarrollada originalmente por Thomas J. McCabe en 1976, la **complejidad ciclomática** mide el número de rutas independientes a través del código fuente de un programa. Formalmente, en un grafo de flujo de control $G = (V, E)$, donde $V$ es el número de vértices (bloques básicos) y $E$ el número de aristas (transferencias de control), se define como:

$$M = E - V + 2P$$

En Atlas, en lugar de construir el grafo de control completo, se utiliza el teorema de McCabe sobre puntos de decisión: la complejidad equivale a la **base 1 más la suma de todos los predicados de bifurcación**.

Atlas analiza el código utilizando la API del compilador de TypeScript (`ts.createSourceFile`):

```typescript
export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  let complexity = 1; // Base 1: toda función tiene al menos una ruta lineal

  function visit(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:           // Sentencias if
      case ts.SyntaxKind.ConditionalExpression: // Operadores ternarios (a ? b : c)
      case ts.SyntaxKind.WhileStatement:        // Bucles while
      case ts.SyntaxKind.DoStatement:           // Bucles do...while
      case ts.SyntaxKind.ForStatement:          // Bucles for clásicos
      case ts.SyntaxKind.ForInStatement:        // Bucles for...in
      case ts.SyntaxKind.ForOfStatement:        // Bucles for...of
      case ts.SyntaxKind.CatchClause:           // Manejadores de excepciones catch
      case ts.SyntaxKind.CaseClause:            // Cláusulas case en switch (default no bifurca)
        complexity++;
        break;
      default:
        break;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken || // Operador lógico AND (&&)
        op === ts.SyntaxKind.BarBarToken ||             // Operador lógico OR (||)
        op === ts.SyntaxKind.QuestionQuestionToken      // Operador de fusión nula (??)
      ) {
        complexity++;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return complexity;
}
```

**Propiedades clave:**
- Cada archivo fuente arranca con una complejidad base de $1$.
- Se excluyen automáticamente archivos de prueba (`isTestFile`), evitando que suites con muchos casos de prueba inflen el puntaje del módulo.
- La complejidad total del módulo es la suma acumulada de la complejidad de todos sus archivos fuente productivos:

$$Cyclo(M) = \sum_{f \in M_{\text{fuente}}} fileCyclomaticComplexity(f)$$

---

### 2.3 Centralidad Fan-In (`fan-in.ts`)
En la teoría de grafos y arquitectura de software, el **Fan-In** mide el número de componentes entrantes que dependen de un módulo dado. Representa el **radio de daño estructural** (*blast radius*): si un módulo con alto *fan-in* cambia o se interpreta incorrectamente, fallarán múltiples partes del sistema.

#### Algoritmo de resolución de rutas relativas:
1. Extrae literales de cadena en declaraciones `import`, `export ... from` y llamadas `require(...)`.
2. Resuelve la ruta relativa (`./` o `../`) considerando las siguientes alternativas de archivo:
   - `base` (directo)
   - `base.ts`, `base.tsx`, `base.js`, `base.jsx`
   - `base/index.ts`, `base/index.tsx`, `base/index.js`
3. **Verificación de frontera de ruta (*Path Boundary*):**
   Comprueba que el archivo destino pertenezca al módulo comparando exactamente la ruta o verificando que comience con `modulo + sep`, evitando colisiones con carpetas que comparten prefijos (ej. `auth` vs `author`):
   ```typescript
   resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep)
   ```
4. **Conteo de módulos cliente distintos:**
   Para un módulo $M$, $FanIn(M)$ cuenta la cantidad de **otros módulos diferentes** que importan al menos un archivo de $M$. No se cuentan las auto-importaciones dentro del mismo módulo, ni los archivos de prueba, ni las importaciones duplicadas desde un mismo módulo consumidor:

$$FanIn(M) = |\{ M_{origen} \mid M_{origen} \neq M \land \exists f_{orig} \in M_{origen}, f_{dest} \in M : f_{orig} \rightarrow f_{dest} \}|$$

---

### 2.4 Volatilidad Histórica Churn (`churn.ts`)
El **Churn** cuantifica la frecuencia de cambio en el historial de control de versiones. Un módulo con cientos de modificaciones recientes suele albergar lógica de negocio en evolución activa, puntos calientes de regresión (*hotspots*) o características críticas para el negocio.

Atlas extrae esta señal invocando la herramienta de Git local:

```bash
git -c core.quotepath=false log --format= --name-only
```

#### Aspectos técnicos cruciales:
1. **Desactivación de escape octal (`-c core.quotepath=false`):**
   Por defecto, Git escapa rutas de archivos que contienen caracteres no ASCII (como la letra `ñ`, tildes o caracteres UTF-8) en secuencias octales (ej. `"dise\303\261o"`). Esto provocaba que en rutas en español el comparador de cadenas no coincidiera con la carpeta en disco, resultando en un *churn* erróneo de 0. La opción `-c core.quotepath=false` garantiza nombres de archivo en UTF-8 plano.
2. **Atribución estricta con frontera de directorio:**
   Cada línea devuelta por `git log` se coteja contra la ruta absoluta de los módulos verificando `absolutePath === modulePath || absolutePath.startsWith(modulePath + sep)`.

---

### 2.5 Brecha de Cobertura de Pruebas (`test-coverage-gap.ts`)
La brecha de pruebas (*Test Coverage Gap*) cuantifica el déficit de pruebas unitarias del módulo. En lugar de requerir una costosa ejecución de pruebas que mida la cobertura de líneas (*lcov* o *c8*), Atlas evalúa de manera estática la existencia de **pruebas hermanas**:

Para cada archivo productivo `modulo/servicio.ts`, se busca la presencia física de:
- `modulo/servicio.test.ts` (o `.spec.ts`)

La fórmula de la brecha se define como:

$$TestGap(M) = \begin{cases} 
0 & \text{si } |M_{\text{fuente}}| = 0 \\
1 - \frac{|M_{\text{con\_prueba\_hermana}}|}{|M_{\text{fuente}}|} & \text{si } |M_{\text{fuente}}| > 0 
\end{cases}$$

- Si todos los archivos tienen prueba: $TestGap = 1 - 1 = 0.0$ (sin brecha).
- Si la mitad de los archivos tienen prueba: $TestGap = 1 - 0.5 = 0.5$.
- Si ningún archivo tiene prueba: $TestGap = 1 - 0 = 1.0$ (brecha total).

---

## 3. Normalización Min-Max

Las señales $Cyclo$, $FanIn$ y $Churn$ operan en escalas radicalmente distintas:
- $Cyclo$ puede alcanzar valores de $500$ o más.
- $FanIn$ típicamente oscila entre $0$ y $15$.
- $Churn$ puede sumar miles de apariciones en repositorios antiguos.

Para permitir una ponderación justa, cada vector de señal se normaliza mediante una transformación Min-Max al intervalo cerrado $[0.0, 1.0]$:

$$Norm(v_i) = \begin{cases}
0 & \text{si } \max(V) = \min(V) \\
\frac{v_i - \min(V)}{\max(V) - \min(V)} & \text{si } \max(V) > \min(V)
\end{cases}$$

Si todos los módulos tienen el mismo valor en una métrica (por ejemplo, todos tienen $FanIn = 0$), la normalización devuelve $0$ de manera segura sin divisiones por cero.

---

## 4. Fórmula del Puntaje Compuesto Ponderado

El puntaje compuesto se calcula en dos etapas sucesivas:

### Etapa 1: Puntaje Base Ponderado
Se asignan pesos empíricos que reflejan la importancia de cada dimensión arquitectónica:

$$Base = 0.35 \cdot Cyclo_{norm} + 0.35 \cdot FanIn_{norm} + 0.30 \cdot Churn_{norm}$$

La suma de los coeficientes ponderadores satisface la restricción unitaria:

$$0.35 + 0.35 + 0.30 = 1.00$$

### Etapa 2: Modificador Multiplicativo de Brecha de Pruebas

$$Score = Base \cdot (1 + 0.20 \cdot TestGap)$$

### ¿Por qué la brecha de pruebas es multiplicativa y no aditiva?

Si la brecha de pruebas se tratara como una señal aditiva ordinaria (por ejemplo, sumando $0.20 \cdot TestGap$ directamente al puntaje base):
1. **Falsa alarma en módulos triviales:** Un módulo que contiene un único archivo de configuración o constantes estáticas (`export const DEFAULT_TIMEOUT = 5000;`) tiene $Base \approx 0.0$. Si no tiene prueba hermana ($TestGap = 1.0$), recibiría $+0.20$ de puntaje aditivo artificial, lo que podría elevarlo por encima de módulos con lógica de negocio real.
2. **Amplificación de riesgo real:** Con la fórmula multiplicativa:
   - Para el archivo de configuración trivial:
     $$Score = 0.0 \cdot (1 + 0.20 \cdot 1.0) = 0.0$$
     *(Sigue siendo justamente clasificado como Ligero).*
   - Para un módulo financiero con alta complejidad ciclomática y alto fan-in ($Base = 0.90$) que carece de pruebas ($TestGap = 1.0$):
     $$Score = 0.90 \cdot (1 + 0.20 \cdot 1.0) = 0.90 \cdot 1.20 = 1.08$$
     *(Recibe una penalización del <span color="green">+20%</span> que consolida su necesidad de un modelo Profundo).*
   - Para el mismo módulo financiero bien probado ($TestGap = 0.0$):
     $$Score = 0.90 \cdot (1 + 0.0) = 0.90$$
     *(Conserva su puntaje base sin penalización).*
