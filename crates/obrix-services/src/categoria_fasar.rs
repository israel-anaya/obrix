//! `categoria_fasar` es una extensión 1:1 de `insumo` (ver diccionario de
//! datos) — este servicio administra ambas tablas juntas como si fueran una
//! sola entidad "Categoría FASAR", igual que `material` hace con `insumo`.

use obrix_db::entities::insumo::{self, TipoInsumo};
use obrix_db::entities::{categoria_fasar, salario_categoria_fasar};
use obrix_db::PortafolioRepository;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder,
    TransactionTrait,
};

use crate::salario_categoria_fasar::SalarioCategoriaFasarService;
use crate::{nuevo_id, ServiceError};

#[derive(serde::Deserialize)]
pub struct CategoriaFasarData {
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    /// Debe ser hija (`parent_id`) de `familia_id` — no se valida aquí, el
    /// frontend ya restringe las opciones mostradas a los hijos de la familia elegida.
    pub sub_familia_id: Option<String>,
    pub activo: bool,
}

/// `insumo` + `categoria_fasar` combinados en una sola fila — así es como lo
/// ve el frontend, que no necesita saber que internamente son dos tablas.
#[derive(Debug, Clone, serde::Serialize)]
pub struct CategoriaFasarCompleto {
    pub id: String,
    pub clave: String,
    pub descripcion: String,
    pub unidad_id: String,
    pub familia_id: Option<String>,
    pub sub_familia_id: Option<String>,
    pub activo: bool,
    /// Vigencia nacional vigente de `salario_categoria_fasar`
    /// (`region_id` nulo) — `None` si nunca se le ha registrado un salario.
    pub salario_vigente: Option<salario_categoria_fasar::Model>,
    pub created_at: String,
    pub updated_at: Option<String>,
    pub created_by: String,
    pub updated_by: Option<String>,
}

fn combinar(
    insumo: insumo::Model,
    salario_vigente: Option<salario_categoria_fasar::Model>,
) -> CategoriaFasarCompleto {
    CategoriaFasarCompleto {
        id: insumo.id,
        clave: insumo.clave,
        descripcion: insumo.descripcion,
        unidad_id: insumo.unidad_id,
        familia_id: insumo.familia_id,
        sub_familia_id: insumo.sub_familia_id,
        activo: insumo.activo,
        salario_vigente,
        created_at: insumo.created_at,
        updated_at: insumo.updated_at,
        created_by: insumo.created_by,
        updated_by: insumo.updated_by,
    }
}

pub struct CategoriaFasarService;

impl CategoriaFasarService {
    pub async fn listar(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
    ) -> Result<Vec<CategoriaFasarCompleto>, ServiceError> {
        let insumos = insumo::Entity::find()
            .filter(insumo::Column::OrganizacionId.eq(organizacion_id))
            .filter(insumo::Column::Tipo.eq(TipoInsumo::ManoObra))
            .order_by_asc(insumo::Column::Clave)
            .all(repo.conexion())
            .await?;

        let mut resultado = Vec::with_capacity(insumos.len());
        for ins in insumos {
            let existe = categoria_fasar::Entity::find_by_id(&ins.id)
                .one(repo.conexion())
                .await?
                .is_some();
            if !existe {
                // No debería pasar (la extensión se crea siempre junto con el
                // insumo) — se omite en vez de reventar el listado completo.
                continue;
            }
            let salario_vigente = SalarioCategoriaFasarService::vigente_nacional(repo, &ins.id).await?;
            resultado.push(combinar(ins, salario_vigente));
        }
        Ok(resultado)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        organizacion_id: &str,
        datos: CategoriaFasarData,
        creado_por: String,
    ) -> Result<CategoriaFasarCompleto, ServiceError> {
        let txn = repo.conexion().begin().await?;
        let id = nuevo_id();
        let ahora = crate::ahora();

        let ins = insumo::ActiveModel {
            id: Set(id.clone()),
            organizacion_id: Set(organizacion_id.to_string()),
            clave: Set(datos.clave),
            tipo: Set(TipoInsumo::ManoObra),
            descripcion: Set(datos.descripcion),
            unidad_id: Set(datos.unidad_id),
            familia_id: Set(datos.familia_id),
            sub_familia_id: Set(datos.sub_familia_id),
            activo: Set(datos.activo),
            created_at: Set(ahora),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        }
        .insert(&txn)
        .await?;

        categoria_fasar::ActiveModel { insumo_id: Set(id) }
            .insert(&txn)
            .await?;

        txn.commit().await?;
        Ok(combinar(ins, None))
    }

    pub async fn actualizar(
        repo: &dyn PortafolioRepository,
        id: String,
        datos: CategoriaFasarData,
        actualizado_por: Option<String>,
    ) -> Result<CategoriaFasarCompleto, ServiceError> {
        let ahora = crate::ahora();

        let mut ins: insumo::ActiveModel = insumo::Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("categoría FASAR {id}")))?
            .into();
        ins.clave = Set(datos.clave);
        ins.descripcion = Set(datos.descripcion);
        ins.unidad_id = Set(datos.unidad_id);
        ins.familia_id = Set(datos.familia_id);
        ins.sub_familia_id = Set(datos.sub_familia_id);
        ins.activo = Set(datos.activo);
        ins.updated_at = Set(Some(ahora));
        ins.updated_by = Set(actualizado_por);
        let ins = ins.update(repo.conexion()).await?;

        let salario_vigente = SalarioCategoriaFasarService::vigente_nacional(repo, &ins.id).await?;
        Ok(combinar(ins, salario_vigente))
    }

    /// Borra el `insumo` — `categoria_fasar` y su historial de
    /// `salario_categoria_fasar` se eliminan en cascada (FK `ON DELETE CASCADE`).
    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        insumo::Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use obrix_db::entities::{moneda, organizacion, unidad_medida, usuario};
    use obrix_db::PortafolioSqliteRepository;
    use sea_orm::ActiveModelTrait;
    use std::path::Path;

    #[tokio::test]
    async fn crear_listar_actualizar_eliminar_categoria_fasar() {
        let portafolio = PortafolioSqliteRepository::crear(Path::new(":memory:"))
            .await
            .expect("crear portafolio");
        let now = "2026-08-12T00:00:00Z".to_string();

        usuario::ActiveModel {
            id: Set("usr-1".into()),
            nombre: Set("Admin".into()),
            correo: Set("a@a.com".into()),
            rol: Set(usuario::RolUsuario::Admin),
            activo: Set(true),
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set(None),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        moneda::ActiveModel {
            id: Set("mon-1".into()),
            codigo: Set("MXN".into()),
            nombre: Set("Peso mexicano".into()),
            simbolo: Set("$".into()),
            decimales: Set(2),
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        organizacion::ActiveModel {
            id: Set("org-1".into()),
            razon_social: Set("Org".into()),
            rfc: Set("XAXX010101000".into()),
            tipo: Set(organizacion::TipoOrganizacion::Despacho),
            moneda_default_id: Set("mon-1".into()),
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        unidad_medida::ActiveModel {
            id: Set("um-1".into()),
            simbolo: Set("jor".into()),
            simbolo_impresion: Set("jor".into()),
            clave_sat: Set(None),
            descripcion: Set("Jornal".into()),
            tipo_magnitud: Set(unidad_medida::TipoMagnitud::Otro),
            created_at: Set(now.clone()),
            updated_at: Set(None),
            created_by: Set("usr-1".into()),
            updated_by: Set(None),
        }
        .insert(portafolio.conexion())
        .await
        .unwrap();

        let creado = CategoriaFasarService::crear(
            &portafolio,
            "org-1",
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
                activo: true,
            },
            "usr-1".into(),
        )
        .await
        .expect("crear categoria_fasar");
        assert_eq!(creado.clave, "CAT-1");
        assert!(creado.salario_vigente.is_none());

        let listado = CategoriaFasarService::listar(&portafolio, "org-1")
            .await
            .expect("listar categorias_fasar");
        assert_eq!(listado.len(), 1);
        assert_eq!(listado[0].descripcion, "Oficial albañil");

        let actualizado = CategoriaFasarService::actualizar(
            &portafolio,
            creado.id.clone(),
            CategoriaFasarData {
                clave: "CAT-1".into(),
                descripcion: "Oficial albañil, primera".into(),
                unidad_id: "um-1".into(),
                familia_id: None,
                sub_familia_id: None,
                activo: true,
            },
            Some("usr-1".into()),
        )
        .await
        .expect("actualizar categoria_fasar");
        assert_eq!(actualizado.descripcion, "Oficial albañil, primera");

        CategoriaFasarService::eliminar(&portafolio, creado.id.clone())
            .await
            .expect("eliminar categoria_fasar");

        let insumo_restante = obrix_db::entities::insumo::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(insumo_restante.is_none(), "el insumo debe quedar borrado");

        let categoria_restante = obrix_db::entities::categoria_fasar::Entity::find_by_id(&creado.id)
            .one(portafolio.conexion())
            .await
            .unwrap();
        assert!(
            categoria_restante.is_none(),
            "categoria_fasar debe borrarse en cascada junto con el insumo"
        );
    }
}
