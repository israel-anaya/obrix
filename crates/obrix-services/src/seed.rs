//! Orquestador del sembrado inicial de los catálogos generales — solo
//! decide el orden, sin lógica propia. `usuario` va primero porque es una
//! identidad global (no depende de `organizacion`); el resto cuelga de la
//! organización sembrada vía `organizacion_id`. El usuario "sistema"
//! (`admin@obrix.local`) nunca recibe membresía en ninguna organización —
//! solo existe para atribuir `created_by`/`updated_by`, nunca inicia sesión.
//! Se llama una sola vez, al crear un portafolio nuevo — nunca al abrir uno
//! existente, para no rellenar de datos demo un portafolio vacío a propósito.

use obrix_db::PortafolioRepository;

use crate::cliente::ClienteService;
use crate::factor_salario_real::FactorSalarioRealService;
use crate::familia_insumo::FamiliaInsumoService;
use crate::moneda::MonedaService;
use crate::organizacion::OrganizacionService;
use crate::proveedor::ProveedorService;
use crate::region::RegionService;
use crate::unidad_medida::UnidadMedidaService;
use crate::usuario::UsuarioService;
use crate::{DatosIniciales, ServiceError};

pub async fn sembrar_catalogos_generales(
    repo: &dyn PortafolioRepository,
) -> Result<(), ServiceError> {
    UsuarioService::sembrar(repo).await?;
    RegionService::sembrar(repo).await?;
    MonedaService::sembrar(repo).await?;
    UnidadMedidaService::sembrar(repo).await?;
    OrganizacionService::sembrar(repo).await?;
    FamiliaInsumoService::sembrar(repo).await?;
    ClienteService::sembrar(repo).await?;
    ProveedorService::sembrar(repo).await?;
    // Depende de `region` y `organizacion`, ya sembradas arriba.
    FactorSalarioRealService::sembrar(repo).await?;
    Ok(())
}
