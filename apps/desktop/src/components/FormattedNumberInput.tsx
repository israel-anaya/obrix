import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FORMATTED_NUMBER_INPUT_CLASE =
  "campo-decimal rounded border border-border bg-background px-1.5 py-1 text-right text-xs tabular-nums";

/** Número válido en construcción mientras se teclea: opcional "-" inicial, dígitos, a lo más un "." */
const PATRON_NUMERO_VALIDO = /^-?\d*\.?\d*$/;

function formatear(valor: string, decimales: number): string {
  const numero = Number(valor);
  return Number.isFinite(numero)
    ? numero.toLocaleString("es-MX", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
    : valor;
}

/**
 * Motor compartido de `CurrencyInput`/`QuantityInput`/`PercentageInput` —
 * mientras se edita muestra el número crudo (fácil de teclear, solo acepta
 * tecleo que forme un número válido — letras u otros símbolos simplemente
 * no se escriben), al salir del campo lo formatea con separador de miles,
 * un prefijo/sufijo opcional (`$` de prefijo para dinero, `%` de sufijo
 * para porcentajes, ninguno para cantidades) y el número de decimales
 * pedido, sin pelear con el cursor mientras el usuario todavía está
 * escribiendo. No redondea ni acota rangos por sí mismo — `onCommit` recibe
 * el texto tal cual lo dejó el usuario (ya garantizado numérico o vacío), y
 * quien lo use decide cómo redondearlo/acotarlo.
 */
export function FormattedNumberInput({
  value,
  onCommit,
  className,
  prefix = "",
  suffix = "",
  decimals = 2,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(value);

  useEffect(() => {
    if (!editando) setBorrador(value);
  }, [value, editando]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editando ? borrador : `${prefix}${formatear(value, decimals)}${suffix}`}
      onFocus={() => {
        setBorrador(value);
        setEditando(true);
      }}
      onChange={(e) => {
        const texto = e.target.value;
        if (PATRON_NUMERO_VALIDO.test(texto)) setBorrador(texto);
      }}
      onBlur={() => {
        setEditando(false);
        onCommit(borrador);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(FORMATTED_NUMBER_INPUT_CLASE, className)}
    />
  );
}
