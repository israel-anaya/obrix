export function PlaceholderTab({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Boceto de interfaz — sin datos conectados todavía.
      </div>
    </div>
  );
}
