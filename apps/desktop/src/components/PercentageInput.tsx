import { FormattedNumberInput } from "@/components/FormattedNumberInput";

/**
 * Campo de captura para un porcentaje — ver `FormattedNumberInput` para el
 * comportamiento de edición/formato. Sufijo `%` y 2 decimales por default;
 * el valor capturado es el número tal cual (p. ej. `16` para 16%, no
 * `0.16`), mismo convenio que el resto de los campos `*_porcentaje` del backend.
 */
export function PercentageInput({
  value,
  onCommit,
  className,
  decimals = 2,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  decimals?: number;
}) {
  return <FormattedNumberInput value={value} onCommit={onCommit} className={className} suffix="%" decimals={decimals} />;
}
