export function ProgressBar({
  current,
  total,
  message,
}: {
  current: number;
  total: number | null;
  message: string;
}) {
  const determined = total !== null && total > 0;
  const pct = determined ? Math.min(100, Math.round((current / total) * 100)) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        {determined ? (
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        ) : (
          <div className="indeterminate-progress-bar h-full w-1/2 rounded-full bg-primary" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {determined ? `${message} ${current} / ${total}` : message}
      </p>
    </div>
  );
}
