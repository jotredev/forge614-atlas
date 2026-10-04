/**
 * Relaciona los nombres que ya eligió el plan de corrida con las rutas de archivos que descubrió el análisis del proyecto.
 * Conserva también los nombres desconocidos con una lista vacía, para que el despacho pueda crear una tarea por cada nombre pedido.
 */
import { discoverModules } from "../scoring/discovery";

/**
 * Resuelve los archivos de cada módulo solicitado a partir del descubrimiento actual del directorio.
 * @param directory Raíz absoluta del proyecto donde se vuelven a descubrir los módulos.
 * @param moduleNames Nombres de módulos que necesita el despacho, en el orden que debe conservar el resultado.
 * @returns Un mapa nombre → rutas absolutas; cada nombre pedido aparece, incluso si no se descubrió y entonces tiene `[]`.
 */
export function resolveModuleFiles(directory: string, moduleNames: string[]): Map<string, string[]> {
  const modules = discoverModules(directory);
  const filesByName = new Map(modules.map(module => [module.name, module.files]));

  const result = new Map<string, string[]>();
  for (const name of moduleNames) {
    result.set(name, filesByName.get(name) ?? []);
  }
  return result;
}
