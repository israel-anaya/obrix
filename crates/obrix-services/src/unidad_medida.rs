use obrix_db::entities::unidad_medida::{ActiveModel, Column, Entity, Model, TipoMagnitud};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

#[derive(serde::Deserialize)]
pub struct UnidadMedidaData {
    pub simbolo: String,
    pub simbolo_impresion: String,
    pub clave_sat: Option<String>,
    pub descripcion: String,
    pub tipo_magnitud: TipoMagnitud,
}

pub struct UnidadMedidaService;

impl UnidadMedidaService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find().order_by_asc(Column::Simbolo).all(repo.conexion()).await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: UnidadMedidaData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            simbolo: Set(datos.simbolo),
            simbolo_impresion: Set(datos.simbolo_impresion),
            clave_sat: Set(datos.clave_sat),
            descripcion: Set(datos.descripcion),
            tipo_magnitud: Set(datos.tipo_magnitud),
            created_at: Set(crate::ahora()),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        };
        Ok(modelo.insert(repo.conexion()).await?)
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: UnidadMedidaData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("unidad de medida {id}")))?
            .into();
        modelo.simbolo = Set(datos.simbolo);
        modelo.simbolo_impresion = Set(datos.simbolo_impresion);
        modelo.clave_sat = Set(datos.clave_sat);
        modelo.descripcion = Set(datos.descripcion);
        modelo.tipo_magnitud = Set(datos.tipo_magnitud);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

impl DatosIniciales for UnidadMedidaService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        // `simbolo_impresion` arranca igual a `simbolo` en cada fila, pero es
        // un valor propio y editable — no se deriva de `simbolo` en el código.
        let unidades = [
            ("m", "m", "MTR", "Metro", TipoMagnitud::Longitud),
            ("ml", "ml", "MTR", "Metro lineal", TipoMagnitud::Longitud),
            ("cm", "cm", "CMT", "Centímetro", TipoMagnitud::Longitud),
            ("mm", "mm", "MMT", "Milímetro", TipoMagnitud::Longitud),
            ("km", "km", "KTM", "Kilómetro", TipoMagnitud::Longitud),
            ("m2", "m²", "MTK", "Metro cuadrado", TipoMagnitud::Area),
            ("ha", "ha", "HAR", "Hectárea", TipoMagnitud::Area),
            ("m3", "m³", "MTQ", "Metro cúbico", TipoMagnitud::Volumen),
            ("dm3", "dm³", "DMQ", "Decímetro cúbico", TipoMagnitud::Volumen),
            ("m3/Est", "m³/Est", "", "Metro cúbico por estación de 20 metros", TipoMagnitud::Volumen),
            ("m3/hm", "m³/hm", "", "Metro cúbico por hectómetro", TipoMagnitud::Volumen),
            ("m3/km", "m³/km", "", "Metro cúbico por kilómetro", TipoMagnitud::Volumen),
            ("l", "l", "LTR", "Litro", TipoMagnitud::Volumen),
            ("kg", "kg", "KGM", "Kilogramo", TipoMagnitud::Masa),
            ("ton", "t", "TNE", "Tonelada", TipoMagnitud::Masa),
            ("pieza", "pza", "H87", "Pieza", TipoMagnitud::Pieza),
            ("millar", "millar", "MIL", "Millar", TipoMagnitud::Pieza),
            ("juego", "juego", "SET", "Juego", TipoMagnitud::Pieza),
            ("lote", "lote", "XLT", "Lote", TipoMagnitud::Pieza),
            ("saco", "saco", "XSA", "Saco", TipoMagnitud::Pieza),
            ("cubeta", "cubeta", "XBJ", "Cubeta", TipoMagnitud::Pieza),
            ("bulto", "bulto", "XUN", "Bulto", TipoMagnitud::Pieza),
            ("caja", "caja", "XBX", "Caja", TipoMagnitud::Pieza),
            ("rollo", "rollo", "XRO", "Rollo", TipoMagnitud::Pieza),
            ("hoja", "hoja", "XSH", "Hoja", TipoMagnitud::Pieza),
            ("tambor", "tambor", "XDR", "Tambor", TipoMagnitud::Pieza),
            ("viaje", "viaje", "XUN", "Viaje", TipoMagnitud::Pieza),
            ("flete", "flete", "E48", "Flete", TipoMagnitud::Otro),
            ("jor", "jor", "DAY", "Jornal", TipoMagnitud::Tiempo),
            ("hr", "h", "HUR", "Hora", TipoMagnitud::Tiempo),
            ("dia", "dia", "DAY", "Día", TipoMagnitud::Tiempo),
            ("sem", "sem", "WEE", "Semana", TipoMagnitud::Tiempo),
            ("mes", "mes", "MON", "Mes", TipoMagnitud::Tiempo),
            ("global", "global", "ACT", "Global", TipoMagnitud::Otro),
            ("%", "%", "", "Porcentaje", TipoMagnitud::Otro),
            ("%mo", "%mo", "", "Porcentaje de mano de obra", TipoMagnitud::Otro),
            ("%ma", "%ma", "", "Porcentaje de materiales", TipoMagnitud::Otro),
        ];
        for (simbolo, simbolo_impresion, clave_sat, descripcion, tipo_magnitud) in unidades {
            Self::crear(
                repo,
                UnidadMedidaData {
                    simbolo: simbolo.to_string(),
                    simbolo_impresion: simbolo_impresion.to_string(),
                    clave_sat: Some(clave_sat.to_string()),
                    descripcion: descripcion.to_string(),
                    tipo_magnitud,
                },
                admin.id.clone(),
            )
            .await?;
        }
        Ok(())
    }
}
