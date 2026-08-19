import { useEffect, useState } from "react";
import { api, type GoTrueUsuario } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function estaBaneado(usuario: GoTrueUsuario): boolean {
  if (!usuario.banned_until) return false;
  return new Date(usuario.banned_until).getTime() > Date.now();
}

export function UsuariosTab() {
  const [usuarios, setUsuarios] = useState<GoTrueUsuario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    setCargando(true);
    try {
      const { users } = await api.listarUsuarios();
      setUsuarios(users);
      setError(null);
    } catch {
      setError("No se pudo cargar usuarios (¿GoTrue está corriendo?)");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  async function alternarBaneo(usuario: GoTrueUsuario) {
    if (estaBaneado(usuario)) {
      await api.desbanearUsuario(usuario.id);
    } else {
      await api.banearUsuario(usuario.id);
    }
    recargar();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Correo</TableHead>
            <TableHead>Alta</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {usuarios.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.email ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
              </TableCell>
              <TableCell>
                {estaBaneado(u) ? (
                  <Badge variant="destructive">baneado</Badge>
                ) : (
                  <Badge variant="success">activo</Badge>
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant={estaBaneado(u) ? "outline" : "destructive"}
                  size="sm"
                  onClick={() => alternarBaneo(u)}
                >
                  {estaBaneado(u) ? "Desbanear" : "Banear"}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!cargando && usuarios.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Sin usuarios todavía
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
