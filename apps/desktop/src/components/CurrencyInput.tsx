import { FormattedNumberInput } from "@/components/FormattedNumberInput";

/**
 * Campo de captura para un valor de dinero — ver `FormattedNumberInput` para
 * el comportamiento de edición/formato. Prefijo `$` y 2 decimales por
 * default; ambos configurables si algún formulario los necesita distintos.
 */
export function CurrencyInput({
  value,
  onCommit,
  className,
  prefix = "$",
  decimals = 2,
  autoFocus = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  prefix?: string;
  decimals?: number;
  autoFocus?: boolean;
}) {
  return (
    <FormattedNumberInput
      value={value}
      onCommit={onCommit}
      className={className}
      prefix={prefix}
      decimals={decimals}
      autoFocus={autoFocus}
    />
  );
}
