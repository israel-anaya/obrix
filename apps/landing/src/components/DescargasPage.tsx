import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountInfo } from "@/lib/types";

// Sin builds publicados todavía — cuando existan releases reales (GitHub
// Releases, S3, etc.), reemplaza `href` por la URL del instalador.
const DESCARGAS: { plataforma: string; detalle: string; href?: string }[] = [
  { plataforma: "Windows", detalle: ".msi / .exe" },
  { plataforma: "macOS", detalle: ".dmg (Apple Silicon / Intel)" },
  { plataforma: "Linux", detalle: ".AppImage / .deb" },
];

export function DescargasPage({
  cuenta,
  onCerrarSesion,
}: {
  cuenta: AccountInfo;
  onCerrarSesion: () => void;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <span className="text-lg font-semibold">Obrix</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{cuenta.nombre}</span>
            <Button variant="outline" size="sm" onClick={onCerrarSesion}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Descarga Obrix</h1>
        <p className="mt-2 text-muted-foreground">
          Hola {cuenta.nombre}, elige tu plataforma para instalar el escritorio.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {DESCARGAS.map((d) => (
            <Card key={d.plataforma}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{d.plataforma}</CardTitle>
                  {!d.href && <Badge variant="muted">Próximamente</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{d.detalle}</p>
              </CardHeader>
              <CardContent>
                <Button className="w-full" disabled={!d.href} asChild={!!d.href}>
                  {d.href ? (
                    <a href={d.href}>
                      <Download size={16} />
                      Descargar
                    </a>
                  ) : (
                    <>
                      <Download size={16} />
                      Descargar
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
