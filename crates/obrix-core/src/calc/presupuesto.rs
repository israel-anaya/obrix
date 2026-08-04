use rust_decimal::Decimal;

use crate::models::ParametrosIndirectos;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrecioUnitarioDesglose {
    pub costo_directo: Decimal,
    pub indirectos: Decimal,
    pub financiamiento: Decimal,
    pub utilidad: Decimal,
    pub cargos_adicionales: Decimal,
    pub precio_unitario: Decimal,
}

/// Aplica la cascada clásica de un análisis de precio unitario mexicano:
/// costo directo -> + indirectos -> + financiamiento (sobre costo+indirectos)
/// -> + utilidad (sobre costo+indirectos+financiamiento) -> + cargos
/// adicionales (ej. 5 al millar, sobre costo+indirectos).
pub fn calcular_precio_unitario(
    costo_directo: Decimal,
    params: &ParametrosIndirectos,
) -> PrecioUnitarioDesglose {
    let cien = Decimal::from(100);

    let pct_indirectos = params.pct_administracion_campo + params.pct_administracion_oficina;
    let indirectos = costo_directo * pct_indirectos / cien;

    let base_financiamiento = costo_directo + indirectos;
    let financiamiento = base_financiamiento * params.pct_financiamiento / cien;

    let base_utilidad = costo_directo + indirectos + financiamiento;
    let utilidad = base_utilidad * params.pct_utilidad / cien;

    let base_cargos = costo_directo + indirectos;
    let cargos_adicionales = base_cargos * params.pct_cargos_adicionales / cien;

    let precio_unitario = costo_directo + indirectos + financiamiento + utilidad + cargos_adicionales;

    PrecioUnitarioDesglose {
        costo_directo,
        indirectos,
        financiamiento,
        utilidad,
        cargos_adicionales,
        precio_unitario,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn calcula_precio_unitario_final_con_cascada_completa() {
        // Ejemplo verificado a mano (ver docs/modelo-datos.md):
        // costo directo 28.50, admin campo 8%, admin oficina 5%,
        // financiamiento 2%, utilidad 10%, cargos 0.5% (5 al millar).
        let params = ParametrosIndirectos {
            pct_administracion_campo: dec!(8),
            pct_administracion_oficina: dec!(5),
            pct_financiamiento: dec!(2),
            pct_utilidad: dec!(10),
            pct_cargos_adicionales: dec!(0.5),
        };

        let desglose = calcular_precio_unitario(dec!(28.50), &params);

        assert_eq!(desglose.indirectos, dec!(3.7050));
        assert_eq!(desglose.financiamiento, dec!(0.644100));
        assert_eq!(desglose.utilidad, dec!(3.2849100));
        assert_eq!(desglose.cargos_adicionales, dec!(0.161025));
        assert_eq!(desglose.precio_unitario, dec!(36.295035));
    }

    #[test]
    fn sin_indirectos_ni_utilidad_precio_unitario_es_costo_directo() {
        let params = ParametrosIndirectos {
            pct_administracion_campo: dec!(0),
            pct_administracion_oficina: dec!(0),
            pct_financiamiento: dec!(0),
            pct_utilidad: dec!(0),
            pct_cargos_adicionales: dec!(0),
        };

        let desglose = calcular_precio_unitario(dec!(100), &params);

        assert_eq!(desglose.precio_unitario, dec!(100));
    }
}
