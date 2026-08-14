import { cn } from "@/lib/utils";
import { useIsFieldActive } from "../gridContext";

export function HeaderCell({
  columnId,
  className,
  children,
  ...rest
}: {
  columnId: string;
  children: React.ReactNode;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  const active = useIsFieldActive(columnId);
  return (
    <th {...rest} className={cn(className, active && "text-foreground")}>
      {children}
    </th>
  );
}
