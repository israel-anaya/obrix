import { useMemo } from "react";
import type { CatalogoGeneralDescriptor } from "@/features/configuracion/catalogosGenerales";
import { CatalogoGeneralSeccion } from "@/features/configuracion/CatalogoGeneralSeccion";
import * as api from "@/lib/tauri";
import type { Proveedor, ProveedorData } from "@/lib/types";

const COLUMNAS_CONTROL = [
  { campo: "created_at", encabezado: "Creado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "created_by", encabezado: "Creado por", ancho: 220, soloLectura: true },
  { campo: "updated_at", encabezado: "Actualizado", ancho: 180, soloLectura: true, fecha: true },
  { campo: "updated_by", encabezado: "Actualizado por", ancho: 220, soloLectura: true },
];

const PROVEEDORES: CatalogoGeneralDescriptor<Proveedor, ProveedorData> = {
  id: "proveedores",
  titulo: "Proveedores",
  grid: {
    titulo: "Proveedores",
    columnas: [
      { campo: "razon_social", encabezado: "Razón social", ancho: 260 },
      { campo: "rfc", encabezado: "RFC", ancho: 140 },
      { campo: "contacto", encabezado: "Contacto", ancho: 180 },
      { campo: "calificacion", encabezado: "Calificación", numero: true, estrellas: true, ancho: 130 },
      ...COLUMNAS_CONTROL,
    ],
  },
  api: {
    list: api.listProveedores,
    crear: api.createProveedor,
    actualizar: api.updateProveedor,
    eliminar: api.deleteProveedor,
  },
  aFila: (m) => ({
    _id: m.id,
    razon_social: m.razon_social,
    rfc: m.rfc,
    contacto: m.contacto ?? "",
    calificacion: m.calificacion ?? "",
    created_at: m.created_at,
    created_by: m.created_by,
    updated_at: m.updated_at ?? "",
    updated_by: m.updated_by ?? "",
  }),
  vacio: { razon_social: "Nuevo proveedor", rfc: "", contacto: null, calificacion: null },
  filaANuevo: (f) => ({
    razon_social: String(f.razon_social),
    rfc: String(f.rfc),
    contacto: String(f.contacto) || null,
    calificacion: String(f.calificacion) || null,
  }),
};

export function ProveedoresSeccion() {
  // `CatalogoGeneralDescriptor` no cambia entre renders — se calcula una sola
  // vez para que `CatalogoGeneralSeccion` no recargue el catálogo de más.
  const descriptor = useMemo(() => PROVEEDORES, []);
  return <CatalogoGeneralSeccion descriptor={descriptor} />;
}
