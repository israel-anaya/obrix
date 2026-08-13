import { useMemo } from "react";
import type { CatalogoGeneralDescriptor } from "@/features/configuracion/catalogosGenerales";
import { CatalogoGeneralSeccion } from "@/features/configuracion/CatalogoGeneralSeccion";
import * as api from "@/lib/tauri";
import type { Cliente, ClienteData, TipoCliente } from "@/lib/types";
import { TIPOS_CLIENTE } from "@/lib/types";

const COLUMNAS_CONTROL = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

const CLIENTES: CatalogoGeneralDescriptor<Cliente, ClienteData> = {
  id: "clientes",
  titulo: "Clientes",
  grid: {
    titulo: "Clientes",
    columnas: [
      { campo: "razon_social", encabezado: "Razón social" },
      { campo: "rfc", encabezado: "RFC", ancho: 140 },
      { campo: "tipo", encabezado: "Tipo", ancho: 150, opciones: TIPOS_CLIENTE },
      { campo: "contacto_nombre", encabezado: "Contacto" },
      { campo: "contacto_correo", encabezado: "Correo de contacto", ancho: 200 },
      { campo: "contacto_telefono", encabezado: "Teléfono", ancho: 140 },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listClientes,
    crear: api.createCliente,
    actualizar: api.updateCliente,
    eliminar: api.deleteCliente,
  },
  aFila: (m) => ({
    _id: m.id,
    razon_social: m.razon_social,
    rfc: m.rfc,
    tipo: m.tipo,
    contacto_nombre: m.contacto_nombre ?? "",
    contacto_correo: m.contacto_correo ?? "",
    contacto_telefono: m.contacto_telefono ?? "",
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
    domicilio_fiscal: null,
  }),
};

export function ClientesSeccion() {
  // `CatalogoGeneralDescriptor` no cambia entre renders — se calcula una sola
  // vez para que `CatalogoGeneralSeccion` no recargue el catálogo de más.
  const descriptor = useMemo(() => CLIENTES, []);
  return <CatalogoGeneralSeccion descriptor={descriptor} />;
}
