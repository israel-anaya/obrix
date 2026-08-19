import { useEffect, useState } from "react";
import { api, type Plan, type Suscripcion } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PLANES: Plan[] = ["free", "profesional", "enterprise"];

function badgeEstado(estado: Suscripcion["estado"]) {
  if (estado === "activa") return <Badge variant="success">activa</Badge>;
  if (estado === "cancelada") return <Badge variant="destructive">cancelada</Badge>;
  return <Badge variant="outline">vencida</Badge>;
}

export function SuscripcionesTab() {
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoPlan, setNuevoPlan] = useState<Plan>("free");

  async function recargar() {
    setCargando(true);
    try {
      setSuscripciones(await api.listarSuscripciones());
      setError(null);
    } catch {
      setError("No se pudo cargar suscripciones");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  async function activarNueva(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoCorreo.trim()) return;
    await api.activarSuscripcion(nuevoCorreo.trim(), nuevoPlan);
    setNuevoCorreo("");
    recargar();
  }

  async function cambiarPlan(correo: string, plan: Plan) {
    await api.activarSuscripcion(correo, plan);
    recargar();
  }

  async function cancelar(correo: string) {
    await api.cancelarSuscripcion(correo);
    recargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={activarNueva} className="flex items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Correo</label>
          <Input
            placeholder="correo@ejemplo.com"
            value={nuevoCorreo}
            onChange={(e) => setNuevoCorreo(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Plan</label>
          <Select value={nuevoPlan} onChange={(e) => setNuevoPlan(e.target.value as Plan)}>
            {PLANES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Activar</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Correo</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Renovación</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {suscripciones.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-mono text-xs">{s.correo}</TableCell>
              <TableCell>
                <Select
                  value={s.plan}
                  onChange={(e) => cambiarPlan(s.correo, e.target.value as Plan)}
                >
                  {PLANES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </TableCell>
              <TableCell>{badgeEstado(s.estado)}</TableCell>
              <TableCell className="text-muted-foreground">
                {s.fecha_renovacion ? new Date(s.fecha_renovacion).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell>
                {s.estado === "activa" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelar(s.correo)}
                  >
                    Cancelar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!cargando && suscripciones.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Sin suscripciones todavía
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
