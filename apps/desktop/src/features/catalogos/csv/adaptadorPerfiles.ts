import { CsvCancelado, type CsvAdaptador, type CsvProblema } from "@/components/csv/tipos";
import { elegirDestinoCsv } from "@/components/csv/archivos";
import { celda, generarCsv, indiceColumna, parsearCsv, plantillaCsv } from "@/lib/csv";
import {
  createPerfilInactividadEquipo,
  updatePerfilInactividadEquipo,
  escribirArchivoTexto,
} from "@/lib/tauri";
import type { PerfilInactividadEquipo, PerfilInactividadEquipoData } from "@/lib/types";

const CAMPOS: { field: keyof PerfilInactividadEquipoData; encabezado: string; obligatorio?: boolean }[] = [
  { field: "nombre", encabezado: "Nombre", obligatorio: true },
  { field: "espera_depreciacion_porcentaje", encabezado: "EsperaDepreciacion" },
  { field: "espera_inversion_porcentaje", encabezado: "EsperaInversion" },
  { field: "espera_seguro_porcentaje", encabezado: "EsperaSeguro" },
  { field: "espera_mantenimiento_porcentaje", encabezado: "EsperaMantenimiento" },
  { field: "espera_combustible_porcentaje", encabezado: "EsperaCombustible" },
  { field: "espera_lubricante_porcentaje", encabezado: "EsperaLubricante" },
  { field: "espera_llantas_porcentaje", encabezado: "EsperaLlantas" },
  { field: "espera_piezas_especiales_porcentaje", encabezado: "EsperaPiezasEspeciales" },
  { field: "espera_otras_fuentes_porcentaje", encabezado: "EsperaOtrasFuentes" },
  { field: "espera_operacion_porcentaje", encabezado: "EsperaOperacion" },
  { field: "reserva_depreciacion_porcentaje", encabezado: "ReservaDepreciacion" },
  { field: "reserva_inversion_porcentaje", encabezado: "ReservaInversion" },
  { field: "reserva_seguro_porcentaje", encabezado: "ReservaSeguro" },
  { field: "reserva_mantenimiento_porcentaje", encabezado: "ReservaMantenimiento" },
  { field: "reserva_combustible_porcentaje", encabezado: "ReservaCombustible" },
  { field: "reserva_lubricante_porcentaje", encabezado: "ReservaLubricante" },
  { field: "reserva_llantas_porcentaje", encabezado: "ReservaLlantas" },
  { field: "reserva_piezas_especiales_porcentaje", encabezado: "ReservaPiezasEspeciales" },
  { field: "reserva_otras_fuentes_porcentaje", encabezado: "ReservaOtrasFuentes" },
  { field: "reserva_operacion_porcentaje", encabezado: "ReservaOperacion" },
];

function vacioPerfil(nombre: string): PerfilInactividadEquipoData {
  const z = "0";
  return {
    nombre,
    espera_depreciacion_porcentaje: z,
    espera_inversion_porcentaje: z,
    espera_seguro_porcentaje: z,
    espera_mantenimiento_porcentaje: z,
    espera_combustible_porcentaje: z,
    espera_lubricante_porcentaje: z,
    espera_llantas_porcentaje: z,
    espera_piezas_especiales_porcentaje: z,
    espera_otras_fuentes_porcentaje: z,
    espera_operacion_porcentaje: z,
    reserva_depreciacion_porcentaje: z,
    reserva_inversion_porcentaje: z,
    reserva_seguro_porcentaje: z,
    reserva_mantenimiento_porcentaje: z,
    reserva_combustible_porcentaje: z,
    reserva_lubricante_porcentaje: z,
    reserva_llantas_porcentaje: z,
    reserva_piezas_especiales_porcentaje: z,
    reserva_otras_fuentes_porcentaje: z,
    reserva_operacion_porcentaje: z,
  };
}

export function adaptadorImportPerfiles(items: PerfilInactividadEquipo[]): CsvAdaptador {
  return {
    titulo: "Importar perfiles de inactividad",
    modo: "importar",
    columnas: CAMPOS.map((c) => ({ nombre: c.encabezado, obligatorio: !!c.obligatorio })),
    politica: "parcial",
    plantilla: () => plantillaCsv(CAMPOS.map((c) => c.encabezado)),
    archivoDefault: "perfiles-inactividad.csv",
    mensajeEjecutando: "Importando perfiles…",
    previsualizar: (contenido) => {
      const tabla = parsearCsv(contenido);
      if (tabla.filas.length === 0) {
        return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: "El archivo no tiene filas de datos." };
      }
      if (indiceColumna(tabla, "Nombre") < 0) {
        return { listos: 0, omitidos: 0, problemas: [], avisos: [], fatal: 'El CSV debe tener la columna "Nombre".' };
      }
      return { listos: tabla.filas.length, omitidos: 0, problemas: [], avisos: [], payload: tabla };
    },
    ejecutar: async (ctx, onProgreso) => {
      const tabla = ctx.preview.payload as ReturnType<typeof parsearCsv>;
      const porNombre = new Map(items.map((p) => [p.nombre.toLowerCase(), p]));
      let creados = 0;
      let actualizados = 0;
      const problemas: CsvProblema[] = [];
      for (let i = 0; i < tabla.filas.length; i++) {
        onProgreso({ actual: i + 1, total: tabla.filas.length, mensaje: "Importando perfiles…" });
        const nombre = celda(tabla.filas[i], indiceColumna(tabla, "Nombre"));
        if (!nombre) {
          problemas.push({ mensaje: `Fila ${i + 2}: nombre vacío.` });
          continue;
        }
        const data = vacioPerfil(nombre);
        for (const c of CAMPOS) {
          if (c.field === "nombre") continue;
          const idx = indiceColumna(tabla, c.encabezado);
          const v = celda(tabla.filas[i], idx);
          if (v) data[c.field] = v.replace(/[^\d.-]/g, "") || "0";
        }
        try {
          const existente = porNombre.get(nombre.toLowerCase());
          if (existente) {
            await updatePerfilInactividadEquipo(existente.id, data);
            actualizados++;
          } else {
            await createPerfilInactividadEquipo(data);
            creados++;
          }
        } catch (e) {
          problemas.push({ mensaje: `Fila ${i + 2}: ${String(e)}` });
        }
      }
      return { creados, actualizados, omitidos: 0, problemas, avisos: [] };
    },
  };
}

export function adaptadorExportPerfiles(items: PerfilInactividadEquipo[]): CsvAdaptador {
  return {
    titulo: "Exportar perfiles de inactividad",
    modo: "exportar",
    columnas: CAMPOS.map((c) => ({ nombre: c.encabezado, obligatorio: false })),
    politica: "parcial",
    archivoDefault: "perfiles-inactividad.csv",
    mensajeEjecutando: "Exportando…",
    previsualizarExport: () => ({ listos: items.length, omitidos: 0, problemas: [], avisos: [] }),
    ejecutar: async (_ctx, onProgreso) => {
      const path = await elegirDestinoCsv("perfiles-inactividad.csv");
      if (!path) throw new CsvCancelado();
      onProgreso({ actual: 0, total: items.length, mensaje: "Exportando…" });
      const filas = items.map((p) => CAMPOS.map((c) => String(p[c.field] ?? "")));
      await escribirArchivoTexto(path, generarCsv(CAMPOS.map((c) => c.encabezado), filas));
      return { creados: items.length, actualizados: 0, omitidos: 0, problemas: [], avisos: [], ruta: path };
    },
  };
}
