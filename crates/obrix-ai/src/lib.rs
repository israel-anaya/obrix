//! Contratos de dominio para las funciones de IA de fase 2/3. Sin
//! implementación en el MVP: solo definen la superficie que el resto de la
//! app puede invocar una vez que exista un `ApuGenerator`/`PlanQuantifier`.

use obrix_core::models::{ApuMatrizItem, Concepto, Insumo, NumeroGeneradorRenglon};

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("proveedor de IA no configurado")]
    NoProvider,
}

/// Fase 2: propone una matriz de insumos para un concepto a partir de su
/// descripción y del catálogo de insumos/bancos de precios disponibles.
pub trait ApuGenerator {
    fn generar_matriz(
        &self,
        concepto: &Concepto,
        catalogo_referencia: &[Insumo],
    ) -> Result<Vec<ApuMatrizItem>, AiError>;
}

/// Fase 3: extrae renglones de números generadores a partir de un plano.
pub trait PlanQuantifier {
    fn cuantificar(
        &self,
        concepto: &Concepto,
        plano_bytes: &[u8],
    ) -> Result<Vec<NumeroGeneradorRenglon>, AiError>;
}
