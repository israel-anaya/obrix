import type { DataGridConfig, Row } from "@/components/grid/DataGrid";
import type { VerticalGridGroup } from "@/components/grid/VerticalGrid";
import type { PerfilInactividadEquipo, PerfilInactividadEquipoData } from "@/lib/types";

export const COLUMNAS_CONTROL = [
  { field: "created_at", header: "Creado", width: 126, readOnly: true, date: true },
  { field: "created_by", header: "Creado por", width: 220, readOnly: true },
  { field: "updated_at", header: "Actualizado", width: 126, readOnly: true, date: true },
  { field: "updated_by", header: "Actualizado por", width: 220, readOnly: true },
];

export const CONFIG: DataGridConfig = {
  title: "Perfiles de inactividad de equipo",
  columns: [
    { field: "nombre", header: "Nombre", width: 220 },
    { field: "espera_depreciacion_porcentaje", header: "Espera · Depreciación %", width: 140, numeric: true, suffix: "%" },
    { field: "espera_inversion_porcentaje", header: "Espera · Inversión %", width: 140, numeric: true, suffix: "%" },
    { field: "espera_seguro_porcentaje", header: "Espera · Seguro %", width: 130, numeric: true, suffix: "%" },
    { field: "espera_mantenimiento_porcentaje", header: "Espera · Mantenimiento %", width: 150, numeric: true, suffix: "%" },
    { field: "espera_combustible_porcentaje", header: "Espera · Combustible %", width: 155, numeric: true, suffix: "%" },
    { field: "espera_lubricante_porcentaje", header: "Espera · Lubricante %", width: 150, numeric: true, suffix: "%" },
    { field: "espera_llantas_porcentaje", header: "Espera · Llantas %", width: 135, numeric: true, suffix: "%" },
    { field: "espera_piezas_especiales_porcentaje", header: "Espera · Piezas especiales %", width: 185, numeric: true, suffix: "%" },
    { field: "espera_otras_fuentes_porcentaje", header: "Espera · Otras fuentes %", width: 165, numeric: true, suffix: "%" },
    { field: "espera_operacion_porcentaje", header: "Espera · Operación %", width: 140, numeric: true, suffix: "%" },
    { field: "reserva_depreciacion_porcentaje", header: "Reserva · Depreciación %", width: 150, numeric: true, suffix: "%" },
    { field: "reserva_inversion_porcentaje", header: "Reserva · Inversión %", width: 150, numeric: true, suffix: "%" },
    { field: "reserva_seguro_porcentaje", header: "Reserva · Seguro %", width: 140, numeric: true, suffix: "%" },
    { field: "reserva_mantenimiento_porcentaje", header: "Reserva · Mantenimiento %", width: 160, numeric: true, suffix: "%" },
    { field: "reserva_combustible_porcentaje", header: "Reserva · Combustible %", width: 165, numeric: true, suffix: "%" },
    { field: "reserva_lubricante_porcentaje", header: "Reserva · Lubricante %", width: 160, numeric: true, suffix: "%" },
    { field: "reserva_llantas_porcentaje", header: "Reserva · Llantas %", width: 145, numeric: true, suffix: "%" },
    { field: "reserva_piezas_especiales_porcentaje", header: "Reserva · Piezas especiales %", width: 195, numeric: true, suffix: "%" },
    { field: "reserva_otras_fuentes_porcentaje", header: "Reserva · Otras fuentes %", width: 175, numeric: true, suffix: "%" },
    { field: "reserva_operacion_porcentaje", header: "Reserva · Operación %", width: 150, numeric: true, suffix: "%" },
    ...COLUMNAS_CONTROL,
  ],
};

/**
 * El mismo catálogo acostado: cada perfil es una columna y cada porcentaje un
 * renglón. Bajo el título de su grupo ("En espera", "En reserva") el prefijo
 * de la etiqueta sobra, así que se recorta — los campos son exactamente los
 * mismos de `CONFIG`, para que las dos vistas nunca se separen.
 */
export const CONFIG_VERTICAL: DataGridConfig = {
  title: "Perfil",
  columns: CONFIG.columns.map((c) => ({ ...c, header: c.header.replace(/^(Espera|Reserva) · /, "") })),
};

export const GRUPOS_VERTICAL: VerticalGridGroup[] = [
  { id: "identificacion", title: null, fields: ["nombre"] },
  {
    id: "equipo_espera",
    title: "Maquinaria y equipo en espera ",
    groups: [
      {
        id: "costos_fijos_equipo_espera",
        title: "Costos fijos",
        fields: [
          "espera_depreciacion_porcentaje",
          "espera_inversion_porcentaje",
          "espera_seguro_porcentaje",
          "espera_mantenimiento_porcentaje",
        ],
      },
      {
        id: "costos_x_consumo",
        title: "Costos por consumo",
        fields: [
          "espera_combustible_porcentaje",
          "espera_lubricante_porcentaje",
          "espera_llantas_porcentaje",
          "espera_piezas_especiales_porcentaje",
          "espera_otras_fuentes_porcentaje",
        ],
      },
      {
        id: "costos_x_operacion_equipo_espera",
        title: "Costos por operación",
        fields: ["espera_operacion_porcentaje"],
      },
    ],
  },
  {
    id: "equipo_reserva",
    title: "Maquinaria y equipo en reserva",
    groups: [
      {
        id: "costos_fijos_equipo_reserva",
        title: "Costos fijos",
        fields: [
          "reserva_depreciacion_porcentaje",
          "reserva_inversion_porcentaje",
          "reserva_seguro_porcentaje",
          "reserva_mantenimiento_porcentaje",
        ],
      },
      {
        id: "costos_x_consumo_equipo_reserva",
        title: "Costos por consumo",
        fields: [
          "reserva_combustible_porcentaje",
          "reserva_lubricante_porcentaje",
          "reserva_llantas_porcentaje",
          "reserva_piezas_especiales_porcentaje",
          "reserva_otras_fuentes_porcentaje",
        ],
      },
      {
        id: "costos_x_operacion_equipo_reserva",
        title: "Costos por operación",
        fields: ["reserva_operacion_porcentaje"],
      },
    ],
  },
  { id: "control", title: "Control", fields: COLUMNAS_CONTROL.map((c) => c.field) },
];

export function perfilAFila(p: PerfilInactividadEquipo, nombresPorUsuarioId: Record<string, string>): Row {
  return {
    _id: p.id,
    nombre: p.nombre,
    espera_depreciacion_porcentaje: p.espera_depreciacion_porcentaje,
    espera_inversion_porcentaje: p.espera_inversion_porcentaje,
    espera_seguro_porcentaje: p.espera_seguro_porcentaje,
    espera_mantenimiento_porcentaje: p.espera_mantenimiento_porcentaje,
    espera_combustible_porcentaje: p.espera_combustible_porcentaje,
    espera_lubricante_porcentaje: p.espera_lubricante_porcentaje,
    espera_llantas_porcentaje: p.espera_llantas_porcentaje,
    espera_piezas_especiales_porcentaje: p.espera_piezas_especiales_porcentaje,
    espera_otras_fuentes_porcentaje: p.espera_otras_fuentes_porcentaje,
    espera_operacion_porcentaje: p.espera_operacion_porcentaje,
    reserva_depreciacion_porcentaje: p.reserva_depreciacion_porcentaje,
    reserva_inversion_porcentaje: p.reserva_inversion_porcentaje,
    reserva_seguro_porcentaje: p.reserva_seguro_porcentaje,
    reserva_mantenimiento_porcentaje: p.reserva_mantenimiento_porcentaje,
    reserva_combustible_porcentaje: p.reserva_combustible_porcentaje,
    reserva_lubricante_porcentaje: p.reserva_lubricante_porcentaje,
    reserva_llantas_porcentaje: p.reserva_llantas_porcentaje,
    reserva_piezas_especiales_porcentaje: p.reserva_piezas_especiales_porcentaje,
    reserva_otras_fuentes_porcentaje: p.reserva_otras_fuentes_porcentaje,
    reserva_operacion_porcentaje: p.reserva_operacion_porcentaje,
    created_at: p.created_at,
    created_by: nombresPorUsuarioId[p.created_by] ?? p.created_by,
    updated_at: p.updated_at ?? "",
    updated_by: (p.updated_by && nombresPorUsuarioId[p.updated_by]) ?? p.updated_by ?? "",
  };
}

export function filaADatos(fila: Row): PerfilInactividadEquipoData {
  return {
    nombre: String(fila.nombre),
    espera_depreciacion_porcentaje: String(fila.espera_depreciacion_porcentaje ?? "0"),
    espera_inversion_porcentaje: String(fila.espera_inversion_porcentaje ?? "0"),
    espera_seguro_porcentaje: String(fila.espera_seguro_porcentaje ?? "0"),
    espera_mantenimiento_porcentaje: String(fila.espera_mantenimiento_porcentaje ?? "0"),
    espera_combustible_porcentaje: String(fila.espera_combustible_porcentaje ?? "0"),
    espera_lubricante_porcentaje: String(fila.espera_lubricante_porcentaje ?? "0"),
    espera_llantas_porcentaje: String(fila.espera_llantas_porcentaje ?? "0"),
    espera_piezas_especiales_porcentaje: String(fila.espera_piezas_especiales_porcentaje ?? "0"),
    espera_otras_fuentes_porcentaje: String(fila.espera_otras_fuentes_porcentaje ?? "0"),
    espera_operacion_porcentaje: String(fila.espera_operacion_porcentaje ?? "0"),
    reserva_depreciacion_porcentaje: String(fila.reserva_depreciacion_porcentaje ?? "0"),
    reserva_inversion_porcentaje: String(fila.reserva_inversion_porcentaje ?? "0"),
    reserva_seguro_porcentaje: String(fila.reserva_seguro_porcentaje ?? "0"),
    reserva_mantenimiento_porcentaje: String(fila.reserva_mantenimiento_porcentaje ?? "0"),
    reserva_combustible_porcentaje: String(fila.reserva_combustible_porcentaje ?? "0"),
    reserva_lubricante_porcentaje: String(fila.reserva_lubricante_porcentaje ?? "0"),
    reserva_llantas_porcentaje: String(fila.reserva_llantas_porcentaje ?? "0"),
    reserva_piezas_especiales_porcentaje: String(fila.reserva_piezas_especiales_porcentaje ?? "0"),
    reserva_otras_fuentes_porcentaje: String(fila.reserva_otras_fuentes_porcentaje ?? "0"),
    reserva_operacion_porcentaje: String(fila.reserva_operacion_porcentaje ?? "0"),
  };
}

export function contarCampos(groups: VerticalGridGroup[]): number {
  let n = 0;
  for (const g of groups) {
    if (g.fields) n += g.fields.length;
    if (g.groups) n += contarCampos(g.groups);
  }
  return n;
}
