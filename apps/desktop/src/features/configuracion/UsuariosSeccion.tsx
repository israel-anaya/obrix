import { useEffect, useMemo, useState } from "react";
import { VistaMaestroDetalle } from "@/features/catalogos/VistaMaestroDetalle";
import type { CatalogoGridConfig, Fila } from "@/features/catalogos/CatalogoGrid";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createOrganizacionUsuario,
  createUsuario,
  deleteOrganizacionUsuario,
  deleteUsuario,
  listOrganizaciones,
  listOrganizacionesDeUsuario,
  listUsuarios,
  updateOrganizacionUsuario,
  updateUsuario,
} from "@/lib/tauri";
import { ROLES_USUARIO, type Organizacion, type OrganizacionMembresia, type RolUsuario } from "@/lib/types";

const USUARIO_API = {
  list: listUsuarios,
  crear: createUsuario,
  actualizar: updateUsuario,
  eliminar: deleteUsuario,
};

const COLUMNAS_CONTROL = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

const MAESTRO_GRID: CatalogoGridConfig = {
  titulo: "Usuarios",
  columnas: [
    { campo: "nombre", encabezado: "Nombre", ancho: 240 },
    { campo: "correo", encabezado: "Correo", ancho: 200 },
    { campo: "rol", encabezado: "Rol", ancho: 130, opciones: ROLES_USUARIO },
    { campo: "activo", encabezado: "Activo", ancho: 90, booleano: true },
    ...COLUMNAS_CONTROL,
  ],
};

/**
 * Maestro/detalle de usuarios en Ajustes — el maestro es el catálogo de
 * usuarios (igual al descriptor genérico que reemplaza) y el detalle es la
 * tabla `organizacion_usuario` (membresía) del usuario seleccionado: alta,
 * baja y activo/inactivo de sus organizaciones.
 */
export function UsuariosSeccion() {
  const { items, error, crear, actualizar, eliminar, reload } = useCatalogoGeneral(USUARIO_API);
  // Igual que en `OrganizacionSeccion` — el sidebar (switcher, default de
  // moneda, etc.) lee la lista de organizaciones de `OrganizacionContext`,
  // que no se entera por su cuenta cuando cambia una membresía desde acá.
  const { reload: recargarOrganizacionContext } = useOrganizacionActiva();

  const [organizaciones, setOrganizaciones] = useState<Organizacion[]>([]);
  useEffect(() => {
    listOrganizaciones().then(setOrganizaciones).catch(() => {});
  }, []);

  const idPorRazonSocial = useMemo(
    () => Object.fromEntries(organizaciones.map((o) => [o.razon_social, o.id])),
    [organizaciones],
  );

  const detalleGrid: CatalogoGridConfig = useMemo(
    () => ({
      titulo: "Organizaciones",
      columnas: [
        {
          campo: "organizacion",
          encabezado: "Organización",
          ancho: 260,
          opciones: organizaciones.map((o) => o.razon_social),
        },
        { campo: "activo", encabezado: "Activo", ancho: 90, booleano: true },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [organizaciones],
  );

  const nombrePorUsuarioId = useMemo(() => Object.fromEntries(items.map((u) => [u.id, u.nombre])), [items]);

  const maestroFilas: Fila[] = useMemo(
    () =>
      items.map((u) => ({
        _id: u.id,
        nombre: u.nombre,
        correo: u.correo,
        rol: u.rol,
        activo: u.activo,
        created_at: u.created_at,
        created_by: (u.created_by && nombrePorUsuarioId[u.created_by]) ?? u.created_by ?? "",
        updated_at: u.updated_at ?? "",
        updated_by: (u.updated_by && nombrePorUsuarioId[u.updated_by]) ?? u.updated_by ?? "",
      })),
    [items, nombrePorUsuarioId],
  );

  const filaAUsuarioData = (fila: Fila) => ({
    nombre: String(fila.nombre),
    correo: String(fila.correo),
    // La celda usa un selector (opciones: ROLES_USUARIO), así que el valor
    // siempre es uno de los válidos — el cast solo recupera el tipo literal.
    rol: String(fila.rol) as RolUsuario,
    activo: Boolean(fila.activo),
  });

  const aFilaDetalle = (m: OrganizacionMembresia): Fila => ({
    _id: m.membresia_id,
    organizacion: m.razon_social,
    activo: m.activo,
    created_at: m.created_at,
    created_by: nombrePorUsuarioId[m.created_by] ?? m.created_by,
    updated_at: m.updated_at ?? "",
    updated_by: (m.updated_by && nombrePorUsuarioId[m.updated_by]) ?? m.updated_by ?? "",
  });

  return (
    <div className="flex h-full flex-col">
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <VistaMaestroDetalle
          maestroGrid={MAESTRO_GRID}
          maestroFilas={maestroFilas}
          onRecargarMaestro={reload}
          onAgregarMaestro={(fila) => crear(filaAUsuarioData(fila))}
          onEditarMaestro={(fila) => actualizar(fila._id, filaAUsuarioData(fila))}
          onEliminarMaestro={eliminar}
          detalle={{
            grid: detalleGrid,
            cargar: listOrganizacionesDeUsuario,
            aFila: aFilaDetalle,
            crear: (usuarioId, fila) =>
              createOrganizacionUsuario(usuarioId, idPorRazonSocial[String(fila.organizacion)] ?? "").then(() =>
                recargarOrganizacionContext(),
              ),
            editar: (usuarioId, fila) =>
              updateOrganizacionUsuario(
                fila._id,
                usuarioId,
                idPorRazonSocial[String(fila.organizacion)] ?? "",
                Boolean(fila.activo),
              ).then(() => recargarOrganizacionContext()),
            eliminar: (_usuarioId, ids) =>
              Promise.all(ids.map(deleteOrganizacionUsuario)).then(() => recargarOrganizacionContext()),
          }}
          placeholderDetalle="Selecciona un usuario para ver sus organizaciones."
        />
      </div>
    </div>
  );
}
