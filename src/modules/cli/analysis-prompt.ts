/**
 * Arma el texto (prompt, la instrucción que se le da a un ayudante de IA) con que se pide analizar un módulo.
 * Existe para que todos los módulos se analicen con la misma consigna: explicación narrativa, sin copiar código.
 * Lo usa `dispatch-modules.ts` al crear la tarea de cada módulo; además `src/index.ts` lo reexporta (lo vuelve
 * a publicar) como parte de la API del paquete. Contiene una sola función: `buildAnalysisPrompt`.
 */

/**
 * Construye la consigna de análisis de un módulo: pide una explicación narrativa y lista los archivos que
 * el ayudante debe leer primero. No lee ningún archivo ni valida las rutas: solo arma el texto.
 * @param moduleName Nombre del módulo que se cita entre comillas en la primera línea de la consigna.
 * @param filePaths Rutas de los archivos del módulo, tal como se quieren mostrar; cada una sale como un
 * elemento de lista («- ruta»). Con una lista vacía la sección de archivos queda sin elementos y no falla.
 * @returns El prompt completo en español, con las líneas unidas por saltos de línea.
 */
export function buildAnalysisPrompt(moduleName: string, filePaths: string[]): string {
  // Una línea por archivo con guion delante, para que la consigna los muestre como lista.
  const fileList = filePaths.map(path => `- ${path}`).join("\n");

  return [
    `Analiza el módulo "${moduleName}" de este proyecto como lo explicarías a otro desarrollador senior:`,
    "qué hace, qué decisiones y patrones de diseño usa, y de qué otras partes del proyecto",
    "depende.",
    "",
    "Lee estos archivos exactos primero:",
    fileList,
    "",
    "Si necesitas entender una dependencia externa a este módulo, puedes explorar el resto del",
    "proyecto.",
    "",
    "Responde siempre con un análisis narrativo completo del módulo — resumiendo el código sin",
    "reproducir líneas directas de los archivos.",
  ].join("\n");
}
