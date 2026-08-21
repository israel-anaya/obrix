export function fmt(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Cantidad sin ceros de relleno: "1.000000" se lee mejor como "1". */
export function fmtCantidad(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return numero.toLocaleString("es-MX", { maximumFractionDigits: 6 });
}

export function fmtPorcentaje(valor: string): string {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor;
  return `${numero.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function fmtDelta(valor: number): string {
  const abs = fmt(String(Math.abs(valor)));
  if (valor > 0) return `+$${abs}`;
  if (valor < 0) return `−$${abs}`;
  return "$0.00";
}
