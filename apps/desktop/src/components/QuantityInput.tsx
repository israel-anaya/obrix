import { FormattedNumberInput } from "@/components/FormattedNumberInput";

/**
 * Campo de captura para una cantidad (sin prefijo de moneda) — ver
 * `FormattedNumberInput` para el comportamiento de edición/formato. El
 * número de decimales varía mucho según qué se captura (integrantes de una
 * cuadrilla, litros de diesel por hora, porcentaje de uso...), así que no
 * tiene default: cada uso debe decidirlo explícitamente.
 */
export function QuantityInput({
  value,
  onCommit,
  decimals,
  className,
}: {
  value: string;
  onCommit: (value: string) => void;
  decimals: number;
  className?: string;
}) {
  return <FormattedNumberInput value={value} onCommit={onCommit} className={className} decimals={decimals} />;
}
