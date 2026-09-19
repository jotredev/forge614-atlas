import { spawnSync } from "node:child_process";
import { join, sep } from "node:path";
import type { ModuleDescriptor } from "./discovery";

/**
 * Calcula la Volatilidad de Código (Code Churn) por módulo a partir del historial de Git.
 * 
 * Fundamento de Ingeniería de Software:
 * - El "Churn" mide la frecuencia histórica con la que los archivos de un módulo han sido
 *   modificados a lo largo de los commits del repositorio.
 * - Los módulos con alto churn son zonas de cambio constante: acumulan deuda técnica,
 *   nuevos requisitos, refactorizaciones y regresiones potenciales. Un módulo altamente
 *   volátil requiere mayor contextualización y escrutinio en el ecosistema Forge614.
 * 
 * Detalles técnicos cruciales de la invocación a Git:
 * 1. Bandera `-c core.quotepath=false`:
 *    Por defecto, Git escapa en notación octal con comillas (ej. `"\303\261"`) cualquier ruta
 *    que contenga caracteres no ASCII (tildes en español, eñes, espacios o símbolos UTF-8).
 *    Configurar `core.quotepath=false` en la invocación obliga a Git a emitir nombres de ruta
 *    en UTF-8 puro, evitando que carpetas como `señales` o `administración` sean ignoradas.
 * 2. Formato `--format= --name-only`:
 *    Suprime el autor, hash y mensaje de commit (`--format=`), emitiendo únicamente los nombres
 *    de los archivos modificados línea por línea en la salida estándar (`stdout`).
 * 3. Manejo de Errores:
 *    Si `repoRoot` no es un repositorio de Git, o si es un repositorio recién inicializado sin commits
 *    (`HEAD` huérfano), Git retorna código de salida distinto de cero (`status !== 0`). En tal caso,
 *    la función lanza una excepción descriptiva para que el consumidor decida la estrategia de rescate.
 * 4. Atribución estricta con frontera de ruta (`modulePath + sep`):
 *    Garantiza que una ruta como `auth-service/index.ts` no incremente por error el churn de `auth`.
 * 
 * @param repoRoot - Ruta absoluta del directorio raíz del repositorio Git
 * @param modules - Lista de descriptores de módulos descubiertos
 * @returns Diccionario `Map<string, number>` asociando el nombre de cada módulo con su churn total
 * @throws Error si la ejecución de `git log` falla
 */
export function computeChurn(repoRoot: string, modules: ModuleDescriptor[]): Map<string, number> {
  // 1. Ejecución síncrona del comando de bajo nivel git log
  const result = spawnSync("git", ["-c", "core.quotepath=false", "log", "--format=", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  // 2. Validación del código de salida de Git
  if (result.status !== 0) {
    throw new Error(`git log failed in ${repoRoot}: ${result.stderr}`);
  }

  // 3. Inicializar el mapa de conteo con 0 para todos los módulos conocidos
  const churn = new Map(modules.map(module => [module.name, 0]));

  // 4. Dividir la salida estándar por saltos de línea, eliminar espacios y descartar líneas vacías
  const touchedFiles = result.stdout
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  // 5. Mapear cada archivo modificado en el historial hacia su módulo correspondiente
  for (const relativeFile of touchedFiles) {
    // Reconstruir la ruta absoluta en el sistema de archivos local
    const absolutePath = join(repoRoot, relativeFile);

    // Encontrar el módulo al que pertenece el archivo modificado
    const matchedModule = modules.find(module => {
      const modulePath = module.path;
      // Comprobar coincidencia exacta de carpeta o prefijo con separador de ruta para evitar colisiones
      return absolutePath === modulePath || absolutePath.startsWith(modulePath + sep);
    });

    // 6. Si el archivo pertenece a un módulo reconocido, incrementar su contador de churn
    if (matchedModule) {
      churn.set(matchedModule.name, (churn.get(matchedModule.name) ?? 0) + 1);
    }
  }

  return churn;
}
