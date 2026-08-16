/**
 * Orden para los `options` de los combos y los `<SelectItem>` de los
 * formularios — el backend ya no ordena sus `listar()` (para no imponerle un
 * orden fijo al grid, que se ordena por clic en encabezado), así que el
 * orden alfabético que un combo necesita se aplica aquí, en el punto donde
 * se arma la lista de opciones, no en la lista base que también alimenta
 * las filas del grid.
 */
export function ordenarPor<T>(items: readonly T[], llave: (item: T) => string, desc = false): T[] {
  const ordenados = [...items].sort((a, b) => llave(a).localeCompare(llave(b), "es"));
  return desc ? ordenados.reverse() : ordenados;
}
