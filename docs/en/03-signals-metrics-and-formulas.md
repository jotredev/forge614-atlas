# 03 (EN). Signals, Metrics, and Mathematical Formulas

> **Official Technical Reference Document — Forge614 Ecosystem**  
> **Project:** Forge614 Atlas (Deep Contextualization Orchestrator)  
> **Theoretical Foundations:** Control Flow Graph Theory (McCabe, 1976), Degree Centrality in Software Graphs, and Multiplicative Fragility Modifiers  
> **Status:** Fully implemented, verified, 26 passing tests  
> **Sister translation:** [03. Señales, Métricas y Fórmulas Matemáticas](../es/03-senales-metricas-y-formulas.md)

---

## 1. Objective Signal Framework

To eliminate arbitrary heuristics and stochastic LLM interpretations that vary between runs, Forge614 Atlas extracts four objective signals directly from each module's source tree:

| Signal | Source | Typical Range | Base Weight | Weighting Role |
|---|---|:---:|:---:|---|
| **Cyclomatic Complexity** | TypeScript AST compiler API | $[1, \infty)$ | **35%** ($0.35$) | Primary additive signal |
| **Fan-In Centrality** | Relative dependency graph | $[0, N-1]$ | **35%** ($0.35$) | Primary additive signal |
| **Commit Churn** | Git revision history | $[0, \infty)$ | **30%** ($0.30$) | Secondary additive signal |
| **Test Coverage Gap** | Sibling `*.test.*` presence | $[0.0, 1.0]$ | **Modifier (+0% to +20%)** | Multiplicative fragility penalty |

---

## 2. Signal Deep-Dive

### 2.1 Module Discovery & Filtering (`discovery.ts`)
Prior to scoring, the system inspects the target repository root:
1. **Inclusion Rule:** Selects top-level folders containing files matching `.ts`, `.tsx`, `.js`, or `.jsx`.
2. **Strict Exclusions:** Immediately discards dependency folders, build outputs, and VCS internal directories:
   ```typescript
   const EXCLUDED_DIRS = new Set([
     "node_modules", ".git", "dist", "build", "coverage", ".next", "out", ".forge614",
   ]);
   ```
3. **Deterministic Alphabetical Ordering:** Both discovered modules and internal source file arrays are sorted via `localeCompare(b)`:
   ```typescript
   topLevelDirs.sort((a, b) => a.localeCompare(b));
   matches.sort((a, b) => a.localeCompare(b));
   ```
4. **Test File Detection:**
   ```typescript
   export function isTestFile(filePath: string): boolean {
     return /\.(test|spec)\.[tj]sx?$/.test(filePath);
   }
   ```

---

### 2.2 Cyclomatic Complexity (`cyclomatic.ts`)
Originally formulated by Thomas J. McCabe in 1976, **cyclomatic complexity** measures the number of linearly independent paths through a program's source code. Formally, on a control flow graph $G = (V, E)$ with $V$ vertices (basic blocks) and $E$ edges (control transfers):

$$M = E - V + 2P$$

In Atlas, rather than constructing the full control flow graph, we apply McCabe's decision point theorem: cyclomatic complexity equals a **baseline of 1 plus the sum of all conditional predicate branch points**.

Atlas inspects the code using the TypeScript compiler parser API (`ts.createSourceFile`):

```typescript
export function fileCyclomaticComplexity(sourceText: string, fileName = "module.ts"): number {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  let complexity = 1; // Baseline 1: every function has at least one linear path

  function visit(node: ts.Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:           // if statements
      case ts.SyntaxKind.ConditionalExpression: // ternary expressions (a ? b : c)
      case ts.SyntaxKind.WhileStatement:        // while loops
      case ts.SyntaxKind.DoStatement:           // do...while loops
      case ts.SyntaxKind.ForStatement:          // classic for loops
      case ts.SyntaxKind.ForInStatement:        // for...in loops
      case ts.SyntaxKind.ForOfStatement:        // for...of loops
      case ts.SyntaxKind.CatchClause:           // catch exception handlers
      case ts.SyntaxKind.CaseClause:            // switch case statements (default does not branch)
        complexity++;
        break;
      default:
        break;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op === ts.SyntaxKind.AmpersandAmpersandToken || // Logical AND (&&)
        op === ts.SyntaxKind.BarBarToken ||             // Logical OR (||)
        op === ts.SyntaxKind.QuestionQuestionToken      // Nullish coalescing (??)
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

**Key Safety Invariants:**
- Every source file begins with a baseline complexity of $1$.
- Test files (`isTestFile`) are explicitly filtered out, preventing comprehensive test suites from inflating the module's apparent production complexity.
- Total module cyclomatic complexity is the sum over all non-test source files:

$$Cyclo(M) = \sum_{f \in M_{\text{source}}} fileCyclomaticComplexity(f)$$

---

### 2.3 Fan-In Centrality (`fan-in.ts`)
In software network analysis, **Fan-In** measures the number of external components dependent on a target module. It represents the **architectural blast radius**: if a module with high fan-in is misunderstood or altered incorrectly, multiple parts of the codebase will fail.

#### Relative Import Resolution Algorithm:
1. Extracts string literals from `import`, `export ... from`, and `require(...)` statements.
2. Resolves relative specifiers (`./` or `../`) against candidate file extensions:
   - `base` (verbatim)
   - `base.ts`, `base.tsx`, `base.js`, `base.jsx`
   - `base/index.ts`, `base/index.tsx`, `base/index.js`
3. **Path Boundary Safety Check:**
   Ensures target files strictly belong to the module folder via `resolvedPath === modulePath || resolvedPath.startsWith(modulePath + sep)`, preventing false positives between sibling folders sharing prefixes (e.g. `auth` vs `author`).
4. **Distinct Importing Module Count:**
   For any module $M$, $FanIn(M)$ counts the number of **distinct other modules** importing at least one symbol from $M$. Internal self-imports, test file imports, and multiple duplicate imports from the same consumer module do not inflate this count:

$$FanIn(M) = |\{ M_{src} \mid M_{src} \neq M \land \exists f_{src} \in M_{src}, f_{dst} \in M : f_{src} \rightarrow f_{dst} \}|$$

---

### 2.4 Historical Commit Churn (`churn.ts`)
**Churn** quantifies historical modification frequency across the version control record. A module experiencing frequent changes typically houses actively evolving business rules, regression hotspots, or high-velocity features.

Atlas computes churn via the local Git binary:

```bash
git -c core.quotepath=false log --format= --name-only
```

#### Critical Technical Details:
1. **Octal Escaping Disabled (`-c core.quotepath=false`):**
   By default, Git escapes non-ASCII characters (e.g., Spanish accents, `ñ`, or UTF-8 letters) into octal strings (e.g. `"dise\303\261o"`). This caused path comparisons to fail silently against disk paths, yielding zero churn. The `-c core.quotepath=false` override enforces clean UTF-8 emission.
2. **Directory Boundary Matching:**
   Each modified file from `git log` is attributed using `absolutePath === modulePath || absolutePath.startsWith(modulePath + sep)`.

---

### 2.5 Test Coverage Gap (`test-coverage-gap.ts`)
The **Test Coverage Gap** measures test deficit across production code. Rather than running an expensive dynamic test coverage run (like c8 or lcov), Atlas evaluates the structural presence of **sibling test files**:

For each production file `module/service.ts`, it verifies the physical existence of:
- `module/service.test.ts` (or `.spec.ts`)

The gap ratio is defined as:

$$TestGap(M) = \begin{cases} 
0 & \text{if } |M_{\text{source}}| = 0 \\
1 - \frac{|M_{\text{tested\_source}}|}{|M_{\text{source}}|} & \text{if } |M_{\text{source}}| > 0 
\end{cases}$$

- Complete test coverage: $TestGap = 1 - 1 = 0.0$ (zero gap).
- 50% tested source files: $TestGap = 1 - 0.5 = 0.5$.
- Zero sibling tests: $TestGap = 1 - 0 = 1.0$ (complete gap).

---

## 3. Min-Max Normalization

The raw signals $Cyclo$, $FanIn$, and $Churn$ operate across vastly differing scales:
- $Cyclo$ can scale into hundreds of decision points.
- $FanIn$ typically ranges between $0$ and $15$.
- $Churn$ can encompass thousands of commits in long-lived repositories.

To enable fair weighting, each raw vector is normalized to the closed interval $[0.0, 1.0]$:

$$Norm(v_i) = \begin{cases}
0 & \text{if } \max(V) = \min(V) \\
\frac{v_i - \min(V)}{\max(V) - \min(V)} & \text{if } \max(V) > \min(V)
\end{cases}$$

If all modules register identical metrics (e.g., all have $FanIn = 0$), the normalization safely yields $0.0$ without division-by-zero errors.

---

## 4. Weighted Composite Score Formula

The final composite score is calculated in two sequential stages:

### Stage 1: Weighted Base Score
Empirical weights reflect the architectural importance of each structural dimension:

$$Base = 0.35 \cdot Cyclo_{norm} + 0.35 \cdot FanIn_{norm} + 0.30 \cdot Churn_{norm}$$

The sum of linear coefficients equals $1.00$:

$$0.35 + 0.35 + 0.30 = 1.00$$

### Stage 2: Multiplicative Test Gap Modifier

$$Score = Base \cdot (1 + 0.20 \cdot TestGap)$$

### Why the Test Gap is Multiplicative, Not Additive

If test coverage gap were treated as a flat additive component (e.g., adding $+0.20 \cdot TestGap$ directly to the base score):
1. **False Positives on Trivial Files:** A module containing a single configuration file or constant definition (`export const DEFAULT_TIMEOUT = 5000;`) registers $Base \approx 0.0$. If it lacks a unit test ($TestGap = 1.0$), an additive term would inject $+0.20$, artificially pushing it ahead of legitimate business logic modules.
2. **True Risk Amplification:** With the multiplicative formula:
   - For the trivial configuration file:
     $$Score = 0.0 \cdot (1 + 0.20 \cdot 1.0) = 0.0$$
     *(It rightly remains categorized as Light).*
   - For an intricate billing engine with high branching and extensive fan-in ($Base = 0.90$) lacking tests ($TestGap = 1.0$):
     $$Score = 0.90 \cdot (1 + 0.20 \cdot 1.0) = 0.90 \cdot 1.20 = 1.08$$
     *(It receives a <span color="green">+20%</span> penalty, firmly anchoring it in the Deep tier).*
   - For the same billing engine thoroughly covered with sibling tests ($TestGap = 0.0$):
     $$Score = 0.90 \cdot (1 + 0.0) = 0.90$$
     *(Retains its base score without penalty).*
