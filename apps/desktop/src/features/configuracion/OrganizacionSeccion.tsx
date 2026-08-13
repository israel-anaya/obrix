import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { BarraAcciones } from "@/components/BarraAcciones";
import { Buscador } from "@/components/Buscador";
import { CatalogoGrid, type CatalogoGridConfig, type CatalogoGridHandle, type Fila } from "@/features/catalogos/CatalogoGrid";
import { useCatalogoGeneral } from "@/features/configuracion/useCatalogoGeneral";
import { useOrganizacionActiva } from "@/features/organizacion/OrganizacionContext";
import {
  createOrganizacion,
  deleteOrganizacion,
  listMonedas,
  listOrganizaciones,
  listUsuarios,
  updateOrganizacion,
} from "@/lib/tauri";
import type { Moneda } from "@/lib/types";
import { TIPOS_ORGANIZACION, type TipoOrganizacion } from "@/lib/types";

const ORGANIZACION_API = {
  list: listOrganizaciones,
  crear: createOrganizacion,
  actualizar: updateOrganizacion,
  eliminar: deleteOrganizacion,
};

const COLUMNAS_CONTROL = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

/**
 * Bespoke, igual que `FamiliasInsumoSeccion` — el descriptor genérico de
 * `catalogosGenerales.ts` no puede resolver `moneda_default` porque sus
 * opciones dependen del catálogo `Moneda`, cargado en tiempo de ejecución.
 */
export function OrganizacionSeccion() {
  const gridRef = useRef<CatalogoGridHandle>(null);
  const [puedeEliminar, setPuedeEliminar] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const { items, error, crear, actualizar, eliminar, reload } = useCatalogoGeneral(ORGANIZACION_API);
  // `useCatalogoGeneral` solo refresca su propia lista local (`items`) — el
  // resto de la app lee organizaciones de `OrganizacionContext`, que no se
  // entera de estos cambios por su cuenta (ver `App.recargarOrganizaciones`).
  const { reload: recargarOrganizacionContext } = useOrganizacionActiva();

  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const recargarMonedas = () => listMonedas().then(setMonedas).catch(() => {});
  useEffect(() => {
    recargarMonedas();
  }, []);

  const [nombresPorUsuarioId, setNombresPorUsuarioId] = useState<Record<string, string>>({});
  const recargarUsuarios = () =>
    listUsuarios().then((usuarios) => {
      setNombresPorUsuarioId(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])));
    });
  useEffect(() => {
    recargarUsuarios();
  }, []);

  // Recarga todo lo que se muestra en esta vista — el catálogo en sí, y las
  // dos listas auxiliares (monedas, nombres de usuario) que alimentan sus
  // columnas.
  const recargarTodo = () => {
    void reload();
    void recargarMonedas();
    void recargarUsuarios();
  };

  const codigoPorMonedaId = useMemo(() => Object.fromEntries(monedas.map((m) => [m.id, m.codigo])), [monedas]);
  const monedaIdPorCodigo = useMemo(() => Object.fromEntries(monedas.map((m) => [m.codigo, m.id])), [monedas]);

  const config: CatalogoGridConfig = useMemo(
    () => ({
      titulo: "Organización",
      columnas: [
        { campo: "razon_social", encabezado: "Razón social" },
        { campo: "rfc", encabezado: "RFC", ancho: 140 },
        { campo: "tipo", encabezado: "Tipo", ancho: 160, opciones: TIPOS_ORGANIZACION },
        {
          campo: "moneda_default",
          encabezado: "Moneda default",
          ancho: 160,
          opciones: monedas.map((m) => m.codigo),
        },
        ...COLUMNAS_CONTROL,
      ],
    }),
    [monedas],
  );

  const filas: Fila[] = useMemo(
    () =>
      items.map((o) => ({
        _id: o.id,
        razon_social: o.razon_social,
        rfc: o.rfc,
        tipo: o.tipo,
        moneda_default: codigoPorMonedaId[o.moneda_default_id] ?? "",
        created_at: o.created_at,
        created_by: nombresPorUsuarioId[o.created_by] ?? o.created_by,
        updated_at: o.updated_at ?? "",
        updated_by: (o.updated_by && nombresPorUsuarioId[o.updated_by]) ?? o.updated_by ?? "",
      })),
    [items, codigoPorMonedaId, nombresPorUsuarioId],
  );

  const filaAOrganizacionData = (fila: Fila) => ({
    razon_social: String(fila.razon_social),
    rfc: String(fila.rfc),
    // La celda usa un selector (opciones: TIPOS_ORGANIZACION), así que el
    // valor siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo: String(fila.tipo) as TipoOrganizacion,
    // La celda usa un selector (opciones: monedas.map(m => m.codigo)), así
    // que el valor siempre es un código válido salvo en una fila nueva sin
    // tocar todavía — mismo caso límite que ya existe hoy para `tipo`.
    moneda_default_id: monedaIdPorCodigo[String(fila.moneda_default)] ?? "",
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-sm font-semibold">Organización</h2>
        <div className="flex items-center gap-2">
          <Buscador value={busqueda} onChange={setBusqueda} />
          <BarraAcciones
            acciones={[
              { icono: RefreshCcw, titulo: "Recargar", onClick: recargarTodo },
              { icono: Plus, titulo: "Agregar", onClick: () => gridRef.current?.agregarFila() },
              {
                icono: Trash2,
                titulo: "Eliminar seleccionado",
                onClick: () => gridRef.current?.eliminarFilaSeleccionada(),
                disabled: !puedeEliminar,
              },
            ]}
          />
        </div>
      </div>
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1">
        <CatalogoGrid
          ref={gridRef}
          config={config}
          filasIniciales={filas}
          modoSeleccion="unica"
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          onSelectionChange={setPuedeEliminar}
          onAgregarFila={(fila) => crear(filaAOrganizacionData(fila)).then(() => recargarOrganizacionContext())}
          onEliminarFilas={(ids) => eliminar(ids).then(() => recargarOrganizacionContext())}
          onCeldaEditada={(fila) =>
            actualizar(fila._id, filaAOrganizacionData(fila)).then(() => recargarOrganizacionContext())
          }
        />
      </div>
    </div>
  );
}
