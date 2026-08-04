use rust_decimal::Decimal;

use crate::models::{ApuMatrizItem, TipoInsumo};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CostoDirectoDesglose {
    pub materiales: Decimal,
    pub mano_obra: Decimal,
    pub equipo_herramienta: Decimal,
}

impl CostoDirectoDesglose {
    pub fn total(&self) -> Decimal {
        self.materiales + self.mano_obra + self.equipo_herramienta
    }
}

pub fn calcular_costo_directo(items: &[ApuMatrizItem]) -> CostoDirectoDesglose {
    let mut desglose = CostoDirectoDesglose::default();
    for item in items {
        let importe = item.importe();
        match item.tipo {
            TipoInsumo::Material => desglose.materiales += importe,
            TipoInsumo::ManoObra => desglose.mano_obra += importe,
            TipoInsumo::EquipoHerramienta => desglose.equipo_herramienta += importe,
        }
    }
    desglose
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use uuid::Uuid;

    fn item(tipo: TipoInsumo, rendimiento: Decimal, precio_unitario: Decimal) -> ApuMatrizItem {
        ApuMatrizItem {
            id: Uuid::new_v4(),
            concepto_id: Uuid::new_v4(),
            insumo_id: Uuid::new_v4(),
            tipo,
            rendimiento,
            precio_unitario,
            congelado: false,
        }
    }

    #[test]
    fn costo_directo_agrupa_por_tipo_y_suma_importes() {
        // Excavación a máquina, 1 m³: diesel + operador + retroexcavadora.
        let items = vec![
            item(TipoInsumo::Material, dec!(0.5), dec!(25.00)), // 12.50
            item(TipoInsumo::ManoObra, dec!(0.02), dec!(450.00)), // 9.00
            item(TipoInsumo::EquipoHerramienta, dec!(0.02), dec!(350.00)), // 7.00
        ];

        let desglose = calcular_costo_directo(&items);

        assert_eq!(desglose.materiales, dec!(12.50));
        assert_eq!(desglose.mano_obra, dec!(9.00));
        assert_eq!(desglose.equipo_herramienta, dec!(7.00));
        assert_eq!(desglose.total(), dec!(28.50));
    }

    #[test]
    fn costo_directo_de_matriz_vacia_es_cero() {
        let desglose = calcular_costo_directo(&[]);
        assert_eq!(desglose.total(), Decimal::ZERO);
    }
}
