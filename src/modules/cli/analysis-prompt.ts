export function buildAnalysisPrompt(moduleName: string, filePaths: string[]): string {
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
