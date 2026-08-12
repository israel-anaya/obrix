use obrix_db::entities::familia_insumo::{ActiveModel, Column, Entity, Model};
use obrix_db::PortafolioRepository;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait, QueryOrder};

use crate::usuario::UsuarioService;
use crate::{nuevo_id, DatosIniciales, ServiceError};

#[derive(serde::Deserialize)]
pub struct FamiliaInsumoData {
    pub nombre: String,
    #[serde(default)]
    pub parent_id: Option<String>,
}

pub struct FamiliaInsumoService;

impl FamiliaInsumoService {
    pub async fn listar(repo: &dyn PortafolioRepository) -> Result<Vec<Model>, ServiceError> {
        Ok(Entity::find()
            .order_by_asc(Column::Nombre)
            .all(repo.conexion())
            .await?)
    }

    pub async fn crear(
        repo: &dyn PortafolioRepository,
        datos: FamiliaInsumoData,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            parent_id: Set(datos.parent_id),
            nombre: Set(datos.nombre),
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
        datos: FamiliaInsumoData,
        actualizado_por: Option<String>,
    ) -> Result<Model, ServiceError> {
        let mut modelo: ActiveModel = Entity::find_by_id(&id)
            .one(repo.conexion())
            .await?
            .ok_or_else(|| ServiceError::NoEncontrado(format!("familia de insumo {id}")))?
            .into();
        modelo.nombre = Set(datos.nombre);
        modelo.updated_at = Set(Some(crate::ahora()));
        modelo.updated_by = Set(actualizado_por);
        Ok(modelo.update(repo.conexion()).await?)
    }

    pub async fn eliminar(repo: &dyn PortafolioRepository, id: String) -> Result<(), ServiceError> {
        Entity::delete_by_id(id).exec(repo.conexion()).await?;
        Ok(())
    }

    async fn crear_hija(
        repo: &dyn PortafolioRepository,
        parent_id: &str,
        nombre: &str,
        creado_por: String,
    ) -> Result<Model, ServiceError> {
        let modelo = ActiveModel {
            id: Set(nuevo_id()),
            parent_id: Set(Some(parent_id.to_string())),
            nombre: Set(nombre.to_string()),
            created_at: Set(crate::ahora()),
            updated_at: Set(None),
            created_by: Set(creado_por),
            updated_by: Set(None),
        };
        Ok(modelo.insert(repo.conexion()).await?)
    }
}

impl DatosIniciales for FamiliaInsumoService {
    async fn sembrar(repo: &dyn PortafolioRepository) -> Result<(), ServiceError> {
        if Entity::find().one(repo.conexion()).await?.is_some() {
            return Ok(());
        }
        let admin = UsuarioService::buscar_admin_obrix(repo).await?;
        let arbol: &[(&str, &[&str])] = &[
            (
                "Cementos, cales y yesos",
                &["Cemento", "Cal", "Yeso"],
            ),
            (
                "Agregados",
                &["Arena", "Grava", "Tepezil", "Tezontle"],
            ),
            (
                "Concretos y morteros",
                &["Concreto premezclado", "Concreto elaborado en obra", "Mortero"],
            ),
            (
                "Aceros",
                &[
                    "Varilla",
                    "Alambrón y alambre",
                    "Malla electrosoldada",
                    "Perfiles estructurales",
                    "Lámina",
                ],
            ),
            (
                "Mampostería",
                &["Block", "Tabique", "Adoquín", "Prefabricados de concreto"],
            ),
            (
                "Maderas",
                &["Madera de cimbra", "Madera de acabado", "Triplay y tableros"],
            ),
            (
                "Impermeabilizantes",
                &[
                    "Impermeabilizante asfáltico",
                    "Impermeabilizante acrílico",
                    "Selladores",
                ],
            ),
            (
                "Pinturas y recubrimientos",
                &["Pintura vinílica", "Esmalte", "Estuco y texturizados"],
            ),
            (
                "Pisos y azulejos",
                &["Loseta", "Azulejo", "Piso vinílico", "Alfombra"],
            ),
            (
                "Cancelería y vidrio",
                &["Aluminio", "Vidrio", "Herrería"],
            ),
            (
                "Instalaciones hidráulicas",
                &["Tubería PVC", "Tubería cobre", "Conexiones", "Válvulas"],
            ),
            (
                "Instalaciones sanitarias",
                &["Muebles de baño", "Accesorios sanitarios"],
            ),
            (
                "Instalaciones eléctricas",
                &[
                    "Conductores",
                    "Canalizaciones",
                    "Interruptores y contactos",
                    "Luminarias",
                ],
            ),
            (
                "Ferretería",
                &["Clavos y tornillería", "Herrajes", "Consumibles"],
            ),
            (
                "Combustibles y lubricantes",
                &["Diésel", "Gasolina", "Aceites"],
            ),
            (
                "Mano de obra",
                &[
                    "Albañilería",
                    "Herrería",
                    "Carpintería",
                    "Electricidad",
                    "Plomería",
                    "Pintura",
                    "Operadores",
                    "Ayudantes",
                ],
            ),
            (
                "Equipo y herramienta",
                &[
                    "Equipo pesado",
                    "Equipo ligero",
                    "Herramienta",
                    "Andamios y cimbra",
                    "Transporte",
                ],
            ),
            (
                "Básicos auxiliares",
                &["Mezclas", "Sistemas compuestos"],
            ),
        ];
        for (padre_nombre, hijas) in arbol {
            let padre = Self::crear(
                repo,
                FamiliaInsumoData {
                    nombre: padre_nombre.to_string(),
                    parent_id: None,
                },
                admin.id.clone(),
            )
            .await?;
            for hija in *hijas {
                Self::crear_hija(repo, &padre.id, hija, admin.id.clone()).await?;
            }
        }
        Ok(())
    }
}
