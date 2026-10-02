/** Prefijos permitidos: la limpieza nunca borra nada fuera de estas carpetas. */
const MANAGED_PREFIXES = ["stores/", "users/"];

type Data = Record<string, unknown> | undefined | null;

/** Rutas de archivos referenciadas por un documento (campo string o arreglo de strings). */
export function filePaths(data: Data, fields: readonly string[]): string[] {
  if (!data) return [];
  const paths: string[] = [];
  for (const field of fields) {
    const value = data[field];
    if (typeof value === "string") paths.push(value);
    else if (Array.isArray(value)) paths.push(...value.filter((v): v is string => typeof v === "string"));
  }
  return paths.filter((p) => p.length > 0 && MANAGED_PREFIXES.some((prefix) => p.startsWith(prefix)));
}

/** Archivos que estaban antes y ya no están: se reemplazaron o se borró el documento. */
export function removedFiles(before: Data, after: Data, fields: readonly string[]): string[] {
  const kept = new Set(filePaths(after, fields));
  return [...new Set(filePaths(before, fields))].filter((p) => !kept.has(p));
}
