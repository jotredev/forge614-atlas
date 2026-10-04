/**
 * Construye la clave de tema (identificador estable de un informe dentro de un proyecto) de cada módulo.
 * `module-report.ts` la guarda y `run-state.ts` la consulta para reconocer informes ya presentes.
 */
/**
 * Devuelve la clave de tema del informe de un módulo; el prefijo `atlas:module:` lo separa de otros temas del proyecto.
 * @param moduleName Nombre del módulo descubierto, incluida su ruta relativa cuando está anidado.
 * @returns Clave `atlas:module:<nombre>` sin modificar el nombre recibido.
 */
export function moduleTopicKey(moduleName: string): string {
  return `atlas:module:${moduleName}`;
}
