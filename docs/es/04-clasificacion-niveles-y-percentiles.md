# 04. Clasificación de Niveles y Percentiles

> **Documento Oficial de Referencia Técnica — Ecosistema Forge614**  
> **Proyecto:** Forge614 Atlas (Orquestador de Contextualización Profunda)  
> **Componente:** `src/modules/scoring/tiers.ts` y `src/modules/scoring/tiers.test.ts`  
> **Distribución:** Percentiles Dinámicos Relativos al Repositorio (~15% Profundo / ~35% Estándar / ~50% Ligero)  
> **Traducción hermana:** [04 (EN). Tier Classification and Percentiles](../en/04-tier-classification-and-percentiles.md)

---

## 1. ¿Por qué Clasificar por Percentiles y no por Umbrales Fijos?

En la ingeniería de software, la distribución de la complejidad **sigue una ley de potencias (*Power Law* o Principio de Pareto)**:
- En cualquier repositorio, independientemente de su tamaño, la complejidad crítica se concentra en un núcleo pequeño (autenticación, transacciones, árboles de decisión, orquestación).
- La gran mayoría de los archivos corresponden a interfaces de usuario, esquemas de tipos, configuraciones, adaptadores y utilidades auxiliares.

### El problema de los umbrales fijos
Si el sistema utilizara umbrales estáticos (por ejemplo, *"complejidad > 50 es Profundo"*):
1. **En proyectos pequeños o microservicios:** Ningún módulo alcanzaría el umbral de 50; todo se clasificaría erróneamente como "Ligero", asignando modelos de razonamiento mínimo a módulos que constituyen el núcleo de esa aplicación.
2. **En monorrepositorios gigantes:** Decenas de módulos superarían 50 simplemente por volumen de líneas, saturando de mandaderos "Profundos" costosos módulos que en realidad son rutinarios dentro de ese proyecto.

### La solución de Atlas: Percentiles Dinámicos
Atlas clasifica los módulos **de forma relativa a la escala de su propio repositorio**:
- El ~15% más intrincado del proyecto siempre recibe atención de máxima profundidad.
- El ~35% intermedio recibe atención estándar.
- El ~50% restante se analiza de forma rápida y económica.

Esta propiedad matemática garantiza que Atlas escale de forma óptima tanto en un microservicio de 3 módulos como en un sistema empresarial con 50 módulos.

---

## 2. Los Tres Niveles de Contextualización

| Nivel | Proporción | Perfil Típico de Código | Modelo Claude Code | Modelo OpenAI Codex | Nivel de Razonamiento |
|---|:---:|---|---|---|:---:|
| **Profundo** | **~15%** superior | Motores de pago, autenticación, algoritmos criptográficos, orquestadores centrales, grafos de estado. | Opus 5 | `gpt-5.6-sol` | `medio` |
| **Estándar** | **~35%** medio | Servicios de dominio, endpoints CRUD con reglas de negocio, controladores y componentes con estado. | Sonnet 5 | `gpt-5.6-terra` | `medio` |
| **Ligero** | **~50%** inferior | Declaraciones de tipos (`.d.ts`), configuraciones, constantes, componentes visuales pasivos, estilos. | Haiku 4.5 | `gpt-5.6-luna` | `bajo` |

---

## 3. Algoritmo de Asignación (`tiers.ts`)

La función `assignTiers` toma la lista de módulos con sus puntajes compuestos y ejecuta el siguiente procedimiento determinista:

```typescript
import type { ModuleScore } from "./composite-score";

export type Tier = "ligero" | "estandar" | "profundo";

export interface TieredModule extends ModuleScore {
  tier: Tier;
}

export function assignTiers(scores: ModuleScore[]): TieredModule[] {
  // 1. Ordenación descendente por puntaje; en caso de empate, orden alfabético por nombre
  const sorted = [...scores].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  
  const total = sorted.length;
  // 2. El nivel profundo abarca el ~15% superior (mínimo 1 módulo para proyectos unitarios)
  const deepCount = Math.max(1, Math.round(total * 0.15));
  // 3. El nivel estándar abarca el ~35% siguiente
  const standardCount = Math.round(total * 0.35);

  // 4. Mapeo secuencial a cada nivel
  return sorted.map((module, index) => {
    let tier: Tier;
    if (index < deepCount) {
      tier = "profundo";
    } else if (index < deepCount + standardCount) {
      tier = "estandar";
    } else {
      tier = "ligero";
    }
    return { ...module, tier };
  });
}
```

---

## 4. Garantías de Determinismo y Casos Borde

### 4.1 Criterio de Desempate Alfabético
En situaciones donde dos o más módulos obtienen idéntico puntaje compuesto (por ejemplo, múltiples módulos nuevos con $Score = 0.0$ o módulos simétricos), un ordenamiento tradicional `b.score - a.score` devolvería posiciones arbitrarias según el orden de lectura en disco.

Atlas incorpora **`|| a.name.localeCompare(b.name)`**:
- Si $Score_A = Score_B$, el módulo con nombre alfabéticamente menor se posiciona primero de forma invariable.
- Garantiza que dos ejecuciones sucesivas sobre el mismo código arrojen **exactamente el mismo resultado** (<span color="green">100% determinista</span>).

### 4.2 Repositorios con un Único Módulo ($total = 1$)
Si un proyecto tiene una única carpeta principal:
- $\text{deepCount} = \max(1, \text{round}(1 \cdot 0.15)) = \max(1, 0) = 1$.
- El único módulo existente se asigna automáticamente al nivel `profundo`.
- El sistema jamás falla ni produce índices fuera de rango.

### 4.3 Ejemplo de Distribución en un Proyecto de 20 Módulos
En un proyecto con $20$ módulos:
- $\text{deepCount} = \max(1, \text{round}(20 \cdot 0.15)) = \max(1, 3) = 3$ módulos (`profundo` — $15\%$).
- $\text{standardCount} = \text{round}(20 \cdot 0.35) = 7$ módulos (`estandar` — $35\%$).
- Restante = $20 - 3 - 7 = 10$ módulos (`ligero` — $50\%$).
- Coincidencia matemática exacta con la especificación original.
