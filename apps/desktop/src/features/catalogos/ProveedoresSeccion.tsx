import { useMemo } from "react";
import type { CatalogoGeneralDescriptor } from "@/features/configuracion/catalogosGenerales";
import { CatalogoGeneralSeccion } from "@/features/configuracion/CatalogoGeneralSeccion";
import * as api from "@/lib/tauri";
import type { Proveedor, ProveedorData } from "@/lib/types";

const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

const PROVEEDORES: CatalogoGeneralDescriptor<Proveedor, ProveedorData> = {
  id: "proveedores",
  titulo: "Proveedores",
  grid: {
    title: "Proveedores",
    columns: [
      { field: "razon_social", header: "Razón social", width: 260 },
      { field: "rfc", header: "RFC", width: 140 },
      { field: "contacto", header: "Contacto", width: 180 },
      { field: "calificacion", header: "Calificación", numeric: true, stars: true, width: 130 },
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
