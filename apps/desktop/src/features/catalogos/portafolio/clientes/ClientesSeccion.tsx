import { useMemo } from "react";
import { ClienteFormPanel } from "@/features/catalogos/portafolio/clientes/ClienteFormPanel";
import type { CatalogoGeneralDescriptor } from "@/features/catalogos/compartido/catalogosGenerales";
import { CatalogoGeneralSeccion } from "@/features/catalogos/compartido/CatalogoGeneralSeccion";
import * as api from "@/lib/tauri";
import type { Cliente, ClienteData, TipoCliente } from "@/lib/types";
import { TIPOS_CLIENTE } from "@/lib/types";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

const CLIENTES: CatalogoGeneralDescriptor<Cliente, ClienteData> = {
  id: "clientes",
  titulo: "Clientes",
  grid: {
    title: "Clientes",
    columns: [
      { field: "razon_social", header: "Razón social", width: 260 },
      { field: "rfc", header: "RFC", width: 140 },
      { field: "tipo", header: "Tipo", width: 150, options: TIPOS_CLIENTE },
      { field: "contacto_nombre", header: "Contacto", width: 180 },
      { field: "contacto_correo", header: "Correo de contacto", width: 200 },
      { field: "contacto_telefono", header: "Teléfono", width: 140 },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listClientes,
    create: api.createCliente,
    update: api.updateCliente,
    remove: api.deleteCliente,
  },
  aFila: (m) => ({
    _id: m.id,
    razon_social: m.razon_social,
    rfc: m.rfc,
    tipo: m.tipo,
    contacto_nombre: m.contacto_nombre ?? "",
    contacto_correo: m.contacto_correo ?? "",
    contacto_telefono: m.contacto_telefono ?? "",
    domicilio_fiscal: m.domicilio_fiscal ?? "",
    created_at: m.created_at,
    created_by: m.created_by,
    updated_at: m.updated_at ?? "",
    updated_by: m.updated_by ?? "",
  }),
  vacio: {
    razon_social: "Nuevo cliente",
    rfc: "",
    tipo: "privado",
    contacto_nombre: null,
    contacto_correo: null,
    contacto_telefono: null,
    domicilio_fiscal: null,
  },
  filaANuevo: (f) => ({
    razon_social: String(f.razon_social),
    rfc: String(f.rfc),
    // La celda usa un selector (opciones: TIPOS_CLIENTE), así que el valor
    // siempre es uno de los válidos — el cast solo recupera el tipo literal.
    tipo: String(f.tipo) as TipoCliente,
    contacto_nombre: String(f.contacto_nombre) || null,
    contacto_correo: String(f.contacto_correo) || null,
    contacto_telefono: String(f.contacto_telefono) || null,
    domicilio_fiscal: String(f.domicilio_fiscal) || null,
  }),
  csv: {
    archivoDefault: "clientes.csv",
    claveNaturalModelo: (m) => m.razon_social,
    claveNaturalFila: (v) => v.razon_social ?? "",
    campos: [
      { field: "razon_social", encabezado: "Razón social", obligatorio: true },
      { field: "rfc", encabezado: "RFC" },
      { field: "tipo", encabezado: "Tipo" },
      { field: "contacto_nombre", encabezado: "Contacto" },
      { field: "contacto_correo", encabezado: "Correo de contacto" },
      { field: "contacto_telefono", encabezado: "Teléfono" },
      { field: "domicilio_fiscal", encabezado: "Domicilio fiscal" },
    ],
  },
};

export function ClientesSeccion() {
  // `CatalogoGeneralDescriptor` no cambia entre renders — se calcula una sola
  // vez para que `CatalogoGeneralSeccion` no recargue el catálogo de más.
  const descriptor = useMemo(() => CLIENTES, []);
  return (
    <CatalogoGeneralSeccion
      descriptor={descriptor}
      ficha={({ item, nombresPorUsuarioId, onCerrar, onGuardado }) => (
        <ClienteFormPanel
          cliente={item}
          nombresPorUsuarioId={nombresPorUsuarioId}
          onCerrar={onCerrar}
          onGuardado={onGuardado}
        />
      )}
    />
  );
}
