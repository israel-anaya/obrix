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
                &[
                    "Cemento gris",
                    "Cemento blanco",
                    "Cementos especiales",
                    "Cal hidratada",
                    "Cal viva",
                    "Yeso de construcción",
                    "Yeso fino y estuco",
                    "Paneles de yeso",
                    "Tablacemento",
                    "Compuestos y cintas",
                ],
            ),
            (
                "Agregados",
                &[
                    "Arena",
                    "Grava",
                    "Tepetate",
                    "Tezontle",
                    "Tepezil",
                    "Piedra braza",
                    "Piedra bola",
                    "Piedra para filtro",
                    "Bases y sub-bases",
                    "Agregados ligeros",
                ],
            ),
            (
                "Concretos y morteros",
                &[
                    "Concreto premezclado",
                    "Concreto elaborado en obra",
                    "Mortero de albañilería",
                    "Adhesivos para loseta",
                    "Boquillas y juntas",
                    "Grouts y autonivelantes",
                    "Aditivos",
                    "Endurecedores y colorantes",
                    "Fibras de refuerzo",
                    "Desmoldantes",
                ],
            ),
            (
                "Aceros",
                &[
                    "Varilla",
                    "Alambrón y alambre",
                    "Malla electrosoldada",
                    "Perfiles estructurales",
                    "Lámina",
                    "Placa de acero",
                    "Canales",
                    "Ángulos",
                    "Soleras",
                    "Tubería de acero",
                ],
            ),
            (
                "Mampostería",
                &[
                    "Block",
                    "Tabique",
                    "Adoquín",
                    "Teja",
                    "Vigueta",
                    "Bovedilla",
                    "Casetones",
                    "Tubos de concreto",
                    "Registros y brocales",
                    "Paneles y celosías",
                ],
            ),
            (
                "Maderas",
                &[
                    "Polines y barrotes",
                    "Tablón y duela de obra",
                    "Chaflanes",
                    "Triplay para cimbra",
                    "Triplay de acabado",
                    "Tableros",
                    "Duela de madera",
                    "Zoclos y molduras",
                    "Puertas de madera",
                    "Plafones",
                ],
            ),
            (
                "Impermeabilizantes",
                &[
                    "Impermeabilizante acrílico",
                    "Impermeabilizante asfáltico",
                    "Mantos prefabricados",
                    "Primarios e imprimantes",
                    "Membranas de refuerzo",
                    "Cristalizantes",
                    "Selladores",
                    "Bandas y waterstops",
                    "Barreras de vapor",
                    "Recubrimientos epóxicos",
                ],
            ),
            (
                "Pinturas y recubrimientos",
                &[
                    "Pintura vinílica",
                    "Esmalte",
                    "Primarios",
                    "Selladores de muro",
                    "Pastas y texturizados",
                    "Estuco",
                    "Pintura para tráfico",
                    "Pintura para alberca",
                    "Barnices",
                    "Thinner y solventes",
                ],
            ),
            (
                "Pisos y azulejos",
                &[
                    "Loseta",
                    "Azulejo",
                    "Piso vinílico",
                    "Piso laminado",
                    "Alfombra",
                    "Mosaico",
                    "Mármol",
                    "Granito",
                    "Cantera y caliza",
                    "Accesorios de piso",
                ],
            ),
            (
                "Cancelería y vidrio",
                &[
                    "Perfiles de aluminio",
                    "Vidrio recocido",
                    "Vidrio templado y laminado",
                    "Acrílicos y policarbonato",
                    "Domos y tragaluces",
                    "Herrería y rejas",
                    "Puertas y canceles",
                    "Ventanas",
                    "Mosquiteros",
                    "Accesorios de cancelería",
                ],
            ),
            (
                "Instalaciones hidráulicas",
                &[
                    "Tubería PVC hidráulica",
                    "Tubería CPVC",
                    "Tubería de cobre",
                    "Tubería galvanizada",
                    "Tubería PPR",
                    "Conexiones",
                    "Válvulas de agua",
                    "Llaves y grifería",
                    "Tinacos y cisternas",
                    "Calentadores de gas",
                    "Calentadores solares",
                    "Bombas de agua",
                    "Filtros y equipos de tratamiento",
                    "Medidores de agua",
                    "Agua",
                ],
            ),
            (
                "Instalaciones sanitarias",
                &[
                    "Muebles de baño",
                    "Accesorios sanitarios",
                    "Tubería PVC sanitaria",
                    "Tubería de fierro fundido",
                    "Tubería de alcantarillado",
                    "Conexiones sanitarias",
                    "Fosas sépticas",
                    "Coladeras y rejillas",
                    "Válvulas y trampas",
                    "Tuberías para drenaje pluvial",
                ],
            ),
            (
                "Instalaciones eléctricas",
                &[
                    "Conductores",
                    "Canalizaciones",
                    "Conexiones eléctricas",
                    "Interruptores y contactos",
                    "Protección y tableros",
                    "Luminarias",
                    "Lámparas y focos",
                    "Postes y brazos",
                    "Acometidas y mufas",
                    "Charolas y escalerillas",
                ],
            ),
            (
                "Ferretería",
                &[
                    "Clavos",
                    "Tornillería",
                    "Anclas y taquetes",
                    "Abrazaderas y soportes",
                    "Cerrajería",
                    "Herrajes",
                    "Adhesivos",
                    "Soldadura",
                    "Lijas y abrasivos",
                    "Consumibles",
                ],
            ),
            (
                "Combustibles y lubricantes",
                &[
                    "Diésel",
                    "Gasolina",
                    "Gas LP",
                    "Aceites de motor",
                    "Aceites hidráulicos",
                    "Grasas",
                    "Anticongelantes y refrigerantes",
                    "Energía eléctrica",
                    "Combustóleo y keroseno",
                    "Fluidos y aditivos",
                ],
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
                    "Herramienta manual",
                    "Herramienta eléctrica",
                    "Andamios",
                    "Cimbra metálica",
                    "Accesorios de cimbra",
                    "Transporte y fletes",
                    "Bombeo de concreto",
                    "Equipo de izaje",
                ],
            ),
            (
                "Instalaciones de gas",
                &[
                    "Tubería de cobre para gas",
                    "Tubería flexible",
                    "Tubería de polietileno para gas",
                    "Conexiones abocinadas",
                    "Reguladores de gas",
                    "Válvulas de gas",
                    "Tanques estacionarios",
                    "Cilindros",
                    "Medidores de gas",
                    "Accesorios de gas",
                ],
            ),
            (
                "Jardinería",
                &["Tierra", "Plantas", "Pasto"],
            ),
            (
                "Muebles, cocinas y accesorios",
                &[
                    "Cocinas integrales",
                    "Parrillas y estufas",
                    "Gabinetes",
                    "Bases y cubiertas",
                    "Tarjas",
                    "Extractores y campanas",
                    "Trituradores",
                    "Interceptores de grasa",
                    "Hornos y electrodomésticos",
                    "Accesorios de cocina",
                ],
            ),
            (
                "Básicos auxiliares",
                &[
                    "Concretos elaborados en obra",
                    "Morteros",
                    "Aplanados y enlucidos",
                    "Lechadas y grouts",
                    "Firmes y plantillas",
                    "Rellenos y bases",
                    "Mezclas asfálticas",
                    "Sistemas de cimbra",
                    "Sistemas de impermeabilización",
                    "Sistemas de recubrimiento",
                    "Sistemas de tablaroca",
                    "Sistemas de piso",
                    "Plantas de tratamiento y drenaje",
                    "Obra falsa y andamiaje",
                    "Pruebas y control de calidad",
                ],
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
