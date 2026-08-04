-- Esquema inicial. Todas las tablas sincronizables usan `id` UUID (no
-- autoincremental) y `updated_at`/`updated_by` para ser compatibles con el
-- modo compartido (PowerSync) sin requerir un cambio de esquema después.

CREATE TABLE proyecto (
    id              TEXT PRIMARY KEY,
    folio           TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    cliente         TEXT,
    ubicacion       TEXT,
    moneda          TEXT NOT NULL DEFAULT 'MXN',
    estatus         TEXT NOT NULL DEFAULT 'borrador',
    modo            TEXT NOT NULL DEFAULT 'local' CHECK (modo IN ('local', 'compartido')),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    updated_by      TEXT
);

CREATE TABLE insumo (
    id              TEXT PRIMARY KEY,
    proyecto_id     TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
    clave           TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('material', 'mano_obra', 'equipo_herramienta')),
    descripcion     TEXT NOT NULL,
    unidad          TEXT NOT NULL,
    precio_base     TEXT NOT NULL,
    fecha_precio    TEXT,
    origen_banco_id TEXT,
    updated_at      TEXT NOT NULL,
    updated_by      TEXT,
    UNIQUE (proyecto_id, clave)
);

CREATE TABLE concepto (
    id              TEXT PRIMARY KEY,
    proyecto_id     TEXT NOT NULL REFERENCES proyecto(id) ON DELETE CASCADE,
    parent_id       TEXT REFERENCES concepto(id) ON DELETE CASCADE,
    clave           TEXT NOT NULL,
    descripcion     TEXT NOT NULL,
    unidad          TEXT NOT NULL,
    cantidad        TEXT NOT NULL DEFAULT '0',
    updated_at      TEXT NOT NULL,
    updated_by      TEXT,
    UNIQUE (proyecto_id, clave)
);

CREATE TABLE apu_matriz_item (
    id              TEXT PRIMARY KEY,
    concepto_id     TEXT NOT NULL REFERENCES concepto(id) ON DELETE CASCADE,
    insumo_id       TEXT NOT NULL REFERENCES insumo(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('material', 'mano_obra', 'equipo_herramienta')),
    rendimiento     TEXT NOT NULL,
    precio_unitario TEXT NOT NULL,
    congelado       INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL,
    updated_by      TEXT
);

CREATE TABLE parametros_indirectos (
    id                          TEXT PRIMARY KEY,
    proyecto_id                 TEXT NOT NULL UNIQUE REFERENCES proyecto(id) ON DELETE CASCADE,
    pct_administracion_campo    TEXT NOT NULL DEFAULT '0',
    pct_administracion_oficina  TEXT NOT NULL DEFAULT '0',
    pct_financiamiento          TEXT NOT NULL DEFAULT '0',
    pct_utilidad                TEXT NOT NULL DEFAULT '0',
    pct_cargos_adicionales      TEXT NOT NULL DEFAULT '0',
    updated_at                  TEXT NOT NULL,
    updated_by                  TEXT
);

CREATE TABLE numero_generador_renglon (
    id              TEXT PRIMARY KEY,
    concepto_id     TEXT NOT NULL REFERENCES concepto(id) ON DELETE CASCADE,
    descripcion     TEXT NOT NULL,
    cantidad        TEXT NOT NULL DEFAULT '1',
    largo           TEXT,
    ancho           TEXT,
    alto            TEXT,
    updated_at      TEXT NOT NULL,
    updated_by      TEXT
);

CREATE TABLE banco_precios (
    id              TEXT PRIMARY KEY,
    fuente          TEXT NOT NULL,
    version         TEXT NOT NULL,
    fecha           TEXT NOT NULL,
    licencia        TEXT
);

CREATE TABLE banco_precios_item (
    id              TEXT PRIMARY KEY,
    banco_precios_id TEXT NOT NULL REFERENCES banco_precios(id) ON DELETE CASCADE,
    clave           TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('material', 'mano_obra', 'equipo_herramienta')),
    descripcion     TEXT NOT NULL,
    unidad          TEXT NOT NULL,
    precio          TEXT NOT NULL
);

CREATE INDEX idx_insumo_proyecto ON insumo(proyecto_id);
CREATE INDEX idx_concepto_proyecto ON concepto(proyecto_id);
CREATE INDEX idx_concepto_parent ON concepto(parent_id);
CREATE INDEX idx_apu_matriz_concepto ON apu_matriz_item(concepto_id);
CREATE INDEX idx_generador_concepto ON numero_generador_renglon(concepto_id);
