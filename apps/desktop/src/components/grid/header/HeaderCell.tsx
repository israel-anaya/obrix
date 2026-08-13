import { cn } from "@/lib/utils";
import { useIsFieldActive } from "../gridContext";

export function HeaderCell({
  columnId,
  className,
  style,
  children,
}: {
  columnId: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const active = useIsFieldActive(columnId);
  return (
    <th style={style} className={cn(className, active && "text-foreground")}>
      {children}
    </th>
  );
}
