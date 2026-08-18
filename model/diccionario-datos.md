# Diccionario de datos

Convenciones generales:

- Todas las tablas usan `id UUID` como llave primaria.
- Campos monetarios y de cantidad usan tipo `decimal` (precisión exacta, nunca
  float) — porcentajes se expresan en base 100 (`8` = 8%), no en fracción.
- Toda tabla lleva campos de control: `created_at` / `created_by` y
  `updated_at` / `updated_by` (timestamp + FK → `usuario`, quién la creó y
  quién hizo el último cambio) — para colaboración y auditoría. Excepciones: 
  `historial_cambio` (append-only por diseño, ya lleva su propio `usuario_id`
  como autor, no se actualiza nunca).
- Los enums se listan con sus valores permitidos entre paréntesis.

---

## 1. Organización y colaboración

### `historial_cambio`

Auditoría append-only. No se actualiza ni se borra.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| entidad | text | nombre de la tabla afectada, ej. `proyecto_presupuesto` |
| entidad_id | uuid | id del registro afectado |
| accion | enum | `crear`, `actualizar`, `eliminar` |
| usuario_id | uuid | FK → usuario, autor del cambio |
| diff_json | json | snapshot de campos cambiados (antes/después) |
| created_at | timestamp | |

### `organizacion`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| razon_social | text | |
| rfc | text | RFC de la persona moral u física titular del despacho/constructora |
| tipo | enum | `despacho`, `constructora`, `gobierno` |
| moneda_default_id | uuid | FK → moneda, requerido — moneda con la que arranca la UI al capturar precios (ej. `precio_material`); siempre sembrada con MXN al crear la organización |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |

### `usuario`

**Identidad global**, no pertenece a una sola organización — un mismo
correo puede colaborar en varios despachos/constructoras (ej. un
freelancer que hace costos para dos clientes distintos). El rol es
propio del usuario (no varía por organización); qué organizaciones puede
ver vive en `organizacion_usuario`.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | |
| correo | text | único |
| rol | enum | `admin`, `propietario`, `editor`, `lector` |
| activo | bool | cuenta global habilitada para iniciar sesión |
| created_at / created_by / updated_at / updated_by | | |

### `organizacion_usuario`

**Membresía** — qué organizaciones puede ver un usuario.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| usuario_id | uuid | FK → usuario |
| activo | bool | default true — acceso a esta organización revocable sin borrar la cuenta ni la membresía |
| created_at / created_by / updated_at / updated_by | | `created_by` = quién invitó al usuario |

Restricción: única `(organizacion_id, usuario_id)`.

### `cliente`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| razon_social | text | |
| rfc | text | |
| tipo | enum | `privado`, `gobierno` |
| contacto_nombre | text | nullable |
| contacto_correo | text | nullable |
| contacto_telefono | text | nullable |
| domicilio_fiscal | text | nullable |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `comentario`

Polimórfico, estilo colaboración Notion/Linear sobre cualquier entidad.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| entidad | text | ej. `proyecto_presupuesto`, `insumo`, `estimacion` |
| entidad_id | uuid | id del registro comentado |
| usuario_id | uuid | FK → usuario, autor (equivalente a `created_by`) |
| texto | text | |
| resuelto | bool | default false |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


---

## 2. Catálogos generales

### `unidad_medida`

Catálogo maestro de unidades, con su clave SAT correspondiente para eventual
conciliación con CFDI de proveedores (catálogo `c_ClaveUnidad` del SAT).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| simbolo | text | ej. `M2`, `M3`, `PZA`, `KG`, `JOR` (jornal) |
| simbolo_impresion | text | símbolo a usar en documentos impresos — por defecto igual a `simbolo`, editable independientemente |
| variantes | text | grafías equivalentes separadas por coma; la primera es el `simbolo` (ej. `pieza, pza`). Al importar CSV, `UnidadMedidaService::variantes` junta este campo con `simbolo`, `simbolo_impresion` y `descripcion` para resolver el token — no es un LIKE en SQL |
| clave_sat | text | nullable — clave del catálogo SAT c_ClaveUnidad |
| descripcion | text | ej. "Metro cuadrado" |
| tipo_magnitud | enum | `longitud`, `area`, `volumen`, `masa`, `pieza`, `tiempo`, `otro` |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `moneda`

Catálogo global de monedas (ISO 4217), para proyectos u organizaciones que
operan con moneda distinta al peso mexicano (ej. presupuestos en dólares
para insumos importados).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| codigo | text | código ISO 4217, ej. `MXN`, `USD`, `EUR` — único |
| nombre | text | ej. "Peso mexicano" |
| simbolo | text | ej. `$`, `US$` |
| decimales | int | número de decimales de la moneda, default 2 |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `region`

Zonificación geográfica para ajustar precios de bancos de referencia — el
costo de insumos en México varía fuerte entre zona metropolitana, frontera
norte y sureste.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| nombre | text | ej. "Zona Metropolitana CDMX", "Frontera Norte", "Sureste" |
| estado | text | entidad federativa |
| factor_ajuste | decimal | nullable — factor multiplicador sobre precio base nacional |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `familia_insumo`

Clasificación jerárquica de insumos (ej. "Cementos y concretos" → "Concreto
premezclado").

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| parent_id | uuid | FK → familia_insumo, nullable |
| nombre | text | |
| insumos_asociados | text | nullable — descripción de insumos típicos de la subfamilia |
| icono | text | nullable — id del pictograma Lucide (`familia-aceros`); normalmente solo en familias raíz |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


---

## 3. Catálogo de insumos y precios

### `proveedor`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| razon_social | text | |
| rfc | text | |
| contacto | text | nullable |
| calificacion | decimal | nullable — rating interno de confiabilidad, 0–5 |
| deleted | bool | Indica si el elemento a sido eliminado
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `insumo`

Catálogo maestro a nivel organización — se reutiliza entre proyectos.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| clave | text | única dentro de la organización |
| tipo | enum | `material`, `mano_obra`, `equipo_herramienta`, `basico_auxiliar` |
| descripcion | text | |
| unidad_id | uuid | FK → unidad_medida |
| familia_id | uuid | FK → familia_insumo, nullable |
| sub_familia_id | uuid | FK → familia_insumo, nullable — debe ser hijo (`parent_id`) de `familia_id` |
| tags | json | nullable — lista de pares llave/valor libres, definidos por el usuario (ej. `{"norma": "NMX-C-155", "obra_tipo": "hidraulica"}`), sin esquema fijo — no participa en ningún cálculo, solo filtrado/búsqueda en catálogo |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |

---



































### Extensiones de `insumo`

`insumo` es un pivote sin precio ni comportamiento propio — cada fila
adquiere su función real mediante **exactamente una** tabla de extensión
1:1 (`insumo_id` como PK/FK), elegida según `insumo.tipo` y, dentro de
`mano_obra` y `equipo_herramienta`, según la naturaleza específica del
insumo:

| `insumo.tipo` | Extensión posible | Cuándo aplica |
|---|---|---|
| `material` | `material` (+ `flete` opcional) | siempre |
| `mano_obra` | `categoria_fasar` | trabajador individual/atómico |
| `mano_obra` | `cuadrilla` | equipo de trabajo compuesto por varios integrantes |
| `equipo_herramienta` | `equipo_costo_horario` | equipo propio, costo calculado por depreciación/consumo |
| `equipo_herramienta` | `herramienta` | herramienta mayor/con motor, precio propio simple, sin cálculo de depreciación |
| `equipo_herramienta` | `equipo_rentado` | equipo de terceros, tarifa de renta |
| `basico_auxiliar` | `basico_auxiliar` | material compuesto, mezcla o sistema con matriz propia recursiva |


### `material`

Extensión 1:1 de `insumo` cuando `insumo.tipo = material`.

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |
| proveedor_id | uuid | FK → proveedor, nullable |
| merma_porcentaje | integer | default 0 — % de merma típico, 0 a 100 |
| marca | text | nullable |

### `precio_material`

Historial de precios — nunca se sobrescribe un precio, se agrega un nuevo
registro con su vigencia. **Acotado exclusivamente a `material`** — es la
única extensión cuyo precio se historiza con vigencias.

`region_id` sí es **nullable** — el precio de un material no siempre se
cotiza a nivel regional, así que la llave admite ambos grados de
especificidad en vez de forzar capturar una fila por región. El precio
vigente para un material en un proyecto se resuelve con prioridad
descendente:

1. `(material, region_id = región del proyecto)` — precio regional específico.
2. `(material, region_id = NULL)` — nacional por defecto, fallback final.

`moneda` es parte de esa misma llave de vigencia: `(material_id, region_id,
moneda)`. Un material puede tener, al mismo tiempo, un precio vigente en MXN
y otro en USD para la misma región — son vigencias independientes, y
registrar uno nuevo solo cierra el anterior que comparta exactamente su
`region_id` **y** su `moneda`. La UI lo trata como "qué se está viendo y
configurando": un combo de moneda filtra tanto la lista de vigentes como el
histórico, y decide en cuál moneda se registra el precio nuevo.

Nota de implementación: `NULL` no cuenta como igual a `NULL` en una
restricción `UNIQUE` estándar, así que la unicidad de "un solo vigente por
región+moneda" (incluyendo cuando `region_id IS NULL`) debe reforzarse con
un índice único parcial o a nivel de aplicación, no queda garantizada solo
por declarar la llave.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| material_id | uuid | FK → material (insumo_id) |
| region_id | uuid | FK → region, nullable — ver prioridad de resolución arriba |
| moneda | text | default `MXN` |
| precio | decimal | |
| fecha_vigencia_desde | date | |
| fecha_vigencia_hasta | date | nullable — null = vigente |
| created_at / created_by / updated_at / updated_by | | `updated_at`/`updated_by` reflejan cuándo se cerró `fecha_vigencia_hasta` al registrar el siguiente precio |

### `flete`

**Catálogo, sin precio propio** — orígenes de transporte (planta, cantera,
almacén) a nivel organización, reutilizable entre materiales distintos que
se abastecen del mismo lugar. No calcula ni guarda costo: el costo de flete
ya viene integrado en `precio_material.precio` (el precio "puesto en obra"
incluye lo que costó traerlo); `flete` solo documenta **de dónde** vino ese
precio, para trazabilidad/filtrado.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| nombre | text | ej. "Planta X", "Cantera Y" |
| distancia_km | decimal | nullable |
| notas | text | nullable |
| created_at / created_by / updated_at / updated_by | | |





































### `factor_salario_real`

Factor de Salario Real (FSR): integra al salario base diario las
prestaciones y cargas patronales obligatorias en México, para obtener el
costo real de la mano de obra — nunca se usa el salario nominal directo en
un APU. Reutilizable entre varios insumos de mano de obra (ej. un mismo FSR
para todo el personal de campo con la misma configuración).

A diferencia de un primer bosquejo con columnas de porcentaje sueltas
(prestaciones, IMSS patronal, INFONAVIT, ISN...), el modelo de cálculo — qué
variables existen y cómo se combinan (`VariableCalculo[]`) — vive en
`modelo_calculo_json`, editable con el ícono "Editar modelo de cálculo" (ver
`apps/desktop/src/lib/formulaEngine.ts` y `modeloCalculo.ts` para el
intérprete; `data/initial/factor_salario_real.json` es el modelo estándar con el
que se siembra un renglón nuevo). `parametros_json` trae, por separado, los
valores concretos de los parámetros tipo `numero`/`booleano` que ese modelo
declara para este renglón (UMA, salario mínimo, tasas IMSS, días LFT...).

Los parámetros tipo `rango` (ej. la tabla de cesantía-vejez) también son
`Parametro[]` dentro de `modelo_calculo_json`, pero **no** son capturables
por renglón ni viven en `parametros_json` — su único valor es el
`valor_default` declarado en el propio modelo, editable solo desde "Editar
modelo de cálculo" (mismo para todos los renglones que compartan ese
modelo). `evaluarModelo` (`apps/desktop/src/lib/modeloCalculo.ts`) los
resuelve siempre así, ignorando `parametros_json` para ellos.

https://www.youtube.com/watch?v=YFUh-bf7nHQ

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| nombre | text | ej. "FSR construcción — riesgo clase V, 2026" |
| region_id | uuid | FK → region, nullable — `null` = nacional (sin región específica) |
| modelo_calculo_json | json | `VariableCalculo[]` — CÓMO se calcula (variables y fórmulas) |
| parametros_json | json | valores concretos de los parámetros `numero`/`booleano` que declara `modelo_calculo_json` — QUÉ se captura. Nunca incluye parámetros `rango`, ver nota arriba |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `categoria_fasar`

Extensión 1:1 de `insumo` cuando `insumo.tipo = mano_obra`.

Representa un **trabajador atómico** (no una cuadrilla) — una categoría de mano de obra
como "Oficial albañil" u "Operador de retroexcavadora". Tabla delgada, sin
columnas propias más allá del vínculo: toda la variación (salario, FSR,
vigencia, región) vive en `salario_categoria_fasar` — mismo patrón que
`material`/`precio_material`.

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |


### `salario_categoria_fasar`

Historial de salario+FSR de una `categoria_fasar` — nunca se sobrescribe,
se agrega un nuevo registro con su vigencia. Separa el salario que se
negocia (`salario_base_diario`) del costo real que efectivamente carga el
concepto (`salario_real_diario`).

`region_id` es **nullable**, igual que en `precio_material`: el salario de
una categoría no siempre se pacta a nivel regional. El salario vigente para
una `categoria_fasar` en un proyecto se resuelve con la misma prioridad
descendente que `precio_material`:

1. `(categoria_fasar, region_id = región del proyecto)` — salario regional específico.
2. `(categoria_fasar, region_id = NULL)` — nacional por defecto, fallback final.

`factor_salario_real` (el número) y `salario_real_diario` no los calcula el
backend — el cálculo del FSR vive en el cliente
(`apps/desktop/src/lib/formulaEngine.ts` + `modeloCalculo.ts`, a partir de
`factor_salario_real.modelo_calculo_json`/`parametros_json`). El cliente
calcula ambos valores y los envía al registrar una vigencia nueva; el
backend solo los guarda, igual que `precio_material.precio` es "lo que se
entró" sin que el backend lo derive.

Nota de implementación: igual que en `precio_material`, `NULL` no cuenta
como igual a `NULL` en una restricción `UNIQUE` estándar, así que la
unicidad de "un solo vigente por región" (incluyendo cuando `region_id IS
NULL`) debe reforzarse con un índice único parcial o a nivel de aplicación.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| categoria_fasar_id | uuid | FK → categoria_fasar (insumo_id) |
| region_id | uuid | FK → region, nullable — ver prioridad de resolución arriba |
| salario_base_diario | decimal | salario nominal pactado para esta vigencia/región |
| factor_salario_real_id | uuid | FK → factor_salario_real elegido para esta vigencia |
| factor_salario_real | decimal | valor numérico del factor, calculado y enviado por el cliente |
| salario_real_diario | decimal | = salario_base_diario × factor_salario_real, también enviado por el cliente |
| fecha_vigencia_desde | date | |
| fecha_vigencia_hasta | date | nullable — null = vigente |
| created_at / created_by / updated_at / updated_by | | `updated_at`/`updated_by` reflejan cuándo se cerró `fecha_vigencia_hasta` al registrar la siguiente vigencia |


### `condicion_trabajo`

Catálogo reutilizable de turnos y condiciones que recargan el salario o
reducen el rendimiento de la mano de obra (nocturno, altura, espacio
confinado, tiempo extra, clima). **No es un insumo ni una extensión de
`insumo`**: igual que `factor_salario_real`, declara *cómo* se ajusta un
costo, no *qué* trabajador es. No es un campo suelto en
`salario_categoria_fasar` ni en `cuadrilla`: varias categorías o cuadrillas
pueden compartir la misma receta.

`metodo_aplicacion` dice cómo entra `valor` al salario. `afecta_rendimiento`
es independiente: un recargo (p. ej. nocturno) puede además bajar
productividad. Si `metodo_aplicacion = factor_rendimiento`, no hay recargo
salarial (`valor` no aplica) y `afecta_rendimiento` debe ser verdadero.

El FSR no cambia: se aplica al salario ya recargado, no se recalcula. El
rendimiento base no vive aquí — es el de la matriz que consume la cuadrilla
(`concepto_componente.rendimiento`, `basico_auxiliar_componente.cantidad`).
Esta tabla solo aporta el multiplicador cuando `afecta_rendimiento`.

Orden al aplicar una o más condiciones vigentes sobre una
`categoria_fasar` en una valuación:

1. `salario_categoria_fasar.salario_base_diario`
2. + recargos con `metodo_aplicacion` `porcentaje_salario` o `monto_fijo`
   → salario ajustado
3. × `salario_categoria_fasar.factor_salario_real` (el factor del catálogo
   FSR, intacto)
   → costo real por jornada
4. × `cuadrilla_costo_detalle.cantidad` de esa categoría
   → costo de cuadrilla por jornada
5. ÷ rendimiento base × Π `factor_rendimiento` de las condiciones con
   `afecta_rendimiento`
   → costo de mano de obra por unidad

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| nombre | text | ej. "Nocturno", "Altura >30m", "Espacio confinado", "Tiempo extra" |
| tipo | enum | `turno`, `riesgo`, `acceso`, `clima` |
| metodo_aplicacion | enum | `porcentaje_salario`, `monto_fijo`, `factor_rendimiento` — cómo entra `valor` al salario; `factor_rendimiento` = sin recargo salarial |
| valor | decimal | si `porcentaje_salario`: 0–100 sobre `salario_base_diario` (`25` = 25%, no `0.25`); si `monto_fijo`: importe por jornada en la moneda de la organización; si `factor_rendimiento`: no aplica |
| afecta_rendimiento | bool | ¿reduce el rendimiento de la cuadrilla? independiente de `metodo_aplicacion`, salvo cuando éste es `factor_rendimiento` (entonces debe ser verdadero) |
| factor_rendimiento | decimal | nullable — multiplicador sobre el rendimiento base (`0.85` = 15% menos productividad), no un porcentaje en base 100; requerido si `afecta_rendimiento` |
| base_legal | text | nullable — referencia normativa (ej. LFT art. 74), para auditoría |
| fecha_vigencia_desde | date | |
| fecha_vigencia_hasta | date | nullable — null = vigente |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |




### `cuadrilla`

Extensión 1:1 de `insumo` cuando `insumo.tipo = mano_obra`.

Representa un **equipo de trabajo compuesto** (ej. "Cuadrilla de albañilería tipo A"
= oficial + ayudantes; o una cuadrilla de topografía = topógrafo + cadenero
+ equipo de medición). Tabla delgada, igual que `categoria_fasar`: no guarda
cantidades ni costos. La receta (quién integra el equipo) vive en
`cuadrilla_detalle`; la valuación por región (cuánto de cada integrante,
a qué costo, qué importe) vive en `cuadrilla_costo` /
`cuadrilla_costo_detalle` — mismo corte que `material`/`precio_material` y
`categoria_fasar`/`salario_categoria_fasar`.

No lleva `region_id`: un `region_id` en la extensión 1:1 dejaría una sola
región por insumo. Quien consume el costo de la cuadrilla
(`concepto_componente.precio_unitario`, `basico_auxiliar_componente.importe`,
`equipo_costo_horario_detalle.costo` si el operador es cuadrilla) toma
`cuadrilla_costo.costo_total` resuelto por región, no un número en esta
tabla.

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |


### `cuadrilla_detalle`

Composición **plana, no recursiva**, compartida entre regiones. Un equipo de
trabajo es gente y equipo, nunca "un equipo que contiene otro equipo". La
receta no se copia por región: si un integrante entra o sale, entra o sale
en todas. `cantidad` / `costo` / `importe` no viven aquí — varían por
región y cuelgan de `cuadrilla_costo_detalle`.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| cuadrilla_id | uuid | FK → cuadrilla (insumo_id) |
| detalle_insumo_id | uuid | FK → insumo — debe ser `mano_obra` (con extensión `categoria_fasar`) o `equipo_herramienta` (con extensión `herramienta`) |
| tipo | enum | `categoria_fasar`, `equipo_herramienta` — denormalizado de qué extensión resuelve `detalle_insumo_id`, para poder separar `cuadrilla_costo.sub_total_mano_obra` de `cuadrilla_costo.sub_total_herramienta` sin join |
| orden | int | orden de visualización dentro de la cuadrilla |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


Restricción: única `(cuadrilla_insumo_id, detalle_insumo_id)`.

Al insertar un renglón de receta hay que insertar también un
`cuadrilla_costo_detalle` en **cada** `cuadrilla_costo` existente de esa
cuadrilla (nacional y regionales). Al borrar el renglón, se borran esos
detalles de valuación.

### `cuadrilla_costo`

Valuación regional de una `cuadrilla` — los tres caches que antes vivían
en la extensión 1:1. **Sin vigencias**: el costo de la cuadrilla no se
cotiza solo, se deriva de `salario_categoria_fasar`, que ya historiza por
fecha. Duplicar la dimensión tiempo aquí desfasaría el cache al registrar
un salario nuevo. El congelamiento sigue siendo de proyecto
(`concepto_componente` / `proyecto_presupuesto.precio_unitario`). Al
cerrar una vigencia de salario se recalcula el `cuadrilla_costo` de esa
región (y el nacional si el salario tocado es nacional).

`region_id` es **nullable**, igual que en `precio_material` y
`salario_categoria_fasar`. El costo vigente de una cuadrilla en un
proyecto se resuelve con la misma prioridad descendente:

1. `(cuadrilla, region_id = región del proyecto)` — valuación regional.
2. `(cuadrilla, region_id = NULL)` — nacional por defecto, fallback final.

Toda cuadrilla nace con la fila nacional (`region_id = NULL`). Una fila
regional es opcional: se crea cuando esa zona necesita otras cantidades, o
cuando se quiere el cache ya resuelto con los salarios de esa región. Al
crearla se copian las `cantidad` desde la valuación nacional, se resuelve
`costo` con los salarios vigentes de esa región y se recalcula.

El cálculo se corre **dentro de un** `cuadrilla_costo` (una región), no
sobre la receta entera:

1. Mano de obra: cada `cuadrilla_costo_detalle` cuyo `cuadrilla_detalle.tipo`
   = `categoria_fasar` toma `costo` =
   `salario_categoria_fasar.salario_real_diario` vigente de esa misma
   región (misma prioridad regional → nacional). Si no hay salario vigente
   (ni regional ni nacional), `costo` e `importe` quedan en 0 y
   `fecha_precio` en NULL — el renglón se conserva; un recálculo posterior
   rellena el cache cuando ya exista salario. Con eso se obtiene
   `sub_total_mano_obra`.
2. Herramienta: cada detalle cuyo `cuadrilla_detalle.tipo` =
   `equipo_herramienta` toma `costo` = el `sub_total_mano_obra` recién
   calculado de **esta** valuación. Con eso se obtiene
   `sub_total_herramienta`.
3. `costo_total` = `sub_total_mano_obra` + `sub_total_herramienta`.

Nota de implementación: igual que en `precio_material`, `NULL` no cuenta
como igual a `NULL` en una restricción `UNIQUE` estándar, así que la
unicidad de "una sola valuación por región" (incluyendo cuando `region_id
IS NULL`) debe reforzarse con un índice único parcial o a nivel de
aplicación.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| cuadrilla_id | uuid | FK → cuadrilla (insumo_id) |
| region_id | uuid | FK → region, nullable — ver prioridad de resolución arriba |
| sub_total_mano_obra | decimal | cache = Σ cuadrilla_costo_detalle.importe donde el `cuadrilla_detalle.tipo` = categoria_fasar, de **esta** valuación |
| sub_total_herramienta | decimal | cache = Σ cuadrilla_costo_detalle.importe donde el `cuadrilla_detalle.tipo` = equipo_herramienta, de **esta** valuación |
| costo_total | decimal | cache = sub_total_mano_obra + sub_total_herramienta |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


### `cuadrilla_costo_detalle`

Números de un renglón de receta **en una valuación**. `region_id` no se
repite aquí: se hereda de `cuadrilla_costo`, así un renglón no puede
colgar de una valuación de otra región. Toda valuación tiene exactamente
un renglón numérico por cada `cuadrilla_detalle` de esa cuadrilla —
`cantidad = 0` si en esa región el integrante no aplica, sin borrar la
receta.

`cantidad` es el único campo capturable. `costo` e `importe` son cache y
los deriva el recálculo del `cuadrilla_costo` padre.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| cuadrilla_costo_id | uuid | FK → cuadrilla_costo |
| cuadrilla_detalle_id | uuid | FK → cuadrilla_detalle — debe pertenecer a la misma cuadrilla que `cuadrilla_costo.cuadrilla_insumo_id` |
| cantidad | decimal | **capturable** — jornales/integrantes si el detalle es `categoria_fasar`; porcentaje 0–100 (no fracción 0–1) si es `equipo_herramienta`. Al dar de alta una herramienta en la receta, el default es `herramienta.porcentaje_mano_obra` |
| costo | decimal | cache: si tipo = categoria_fasar, `salario_categoria_fasar.salario_real_diario` vigente de la región de `cuadrilla_costo` (0 si no hay salario vigente); si tipo = equipo_herramienta, `cuadrilla_costo.sub_total_mano_obra` de esta misma valuación |
| importe | decimal | cache = cantidad × costo |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


Restricción: única `(cuadrilla_costo_id, cuadrilla_detalle_id)`.





































### `herramienta`

Extensión 1:1 de `insumo` cuando `insumo.tipo = equipo_herramienta` 

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |
| porcentaje_mano_obra | int | porcentaje por default — se copia a `cuadrilla_costo_detalle.cantidad` al integrar la herramienta en una cuadrilla; a partir de ahí la cantidad es de la valuación (puede diferir por región) |


### `perfil_inactividad_equipo`

Receta reutilizable para derivar el costo horario **en espera** y **en
reserva** a partir del análisis activo de un `equipo_costo_horario`. No es
un insumo ni una extensión de `insumo`: igual que `factor_salario_real`,
declara *cómo* se transforma un costo, no *qué* máquina es. Varios equipos
pueden compartir el mismo perfil.

Espera = la máquina está en el frente, asignada a la tarea, sin producir
(ciclo, material, la otra máquina). Reserva = está en el patio de la obra,
de respaldo, no asignada a ninguna tarea.

No hay un porcentaje único sobre `equipo_costo_horario.costo_horario_total`:
reserva suele conservar inversión y seguro y apagar diesel y operador. Cada
porcentaje (0–100) se aplica al rubro activo que ya cachea
`equipo_costo_horario` — los cuatro cargos fijos por separado,
`subtotal_operacion`, y el consumo **partido por naturaleza** (combustible,
lubricante, llantas, piezas especiales, otras fuentes), no sobre
`subtotal_consumo` entero. CMIC y el RLOPSRM desglosan así los costos por
consumo; un solo % aplastaría diesel (ralentí) y llantas (no se desgastan
paradas). El perfil no puede aplicarse si las líneas de
`equipo_costo_horario_detalle` con `tipo = consumo` no llevan `naturaleza`.

No aplica a `herramienta` (es un % sobre mano de obra) ni a
`equipo_rentado` (la tarifa ya mete ociosidad; horas paradas = más horas de
la misma tarifa). Si un equipo no elige perfil, no se cotiza espera ni
reserva. El borrado es lógico (`deleted`): lo saca del catálogo al asignar;
no borra el vínculo de equipos que ya lo usan.

Los valores de semilla son una receta de partida (frente / patio), no una
norma: el despacho los edita. El reglamento pide justificar el costo
inactivo; no fija estos porcentajes.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| nombre | text | ej. "CMIC frente / patio 2026" |
| espera_depreciacion_porcentaje | decimal | 0–100 — sobre `cf_depreciacion_hora` |
| espera_inversion_porcentaje | decimal | sobre `cf_inversion_hora` |
| espera_seguro_porcentaje | decimal | sobre `cf_seguro_hora` |
| espera_mantenimiento_porcentaje | decimal | sobre `cf_mantenimiento_hora` |
| espera_combustible_porcentaje | decimal | sobre Σ importe de detalle `tipo = consumo` y `naturaleza = combustible` |
| espera_lubricante_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = lubricante` |
| espera_llantas_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = llantas` |
| espera_piezas_especiales_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = piezas_especiales` |
| espera_otras_fuentes_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = otras_fuentes` |
| espera_operacion_porcentaje | decimal | sobre `subtotal_operacion` (operador) |
| reserva_depreciacion_porcentaje | decimal | 0–100 — sobre `cf_depreciacion_hora` |
| reserva_inversion_porcentaje | decimal | sobre `cf_inversion_hora` |
| reserva_seguro_porcentaje | decimal | sobre `cf_seguro_hora` |
| reserva_mantenimiento_porcentaje | decimal | sobre `cf_mantenimiento_hora` |
| reserva_combustible_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = combustible` |
| reserva_lubricante_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = lubricante` |
| reserva_llantas_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = llantas` |
| reserva_piezas_especiales_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = piezas_especiales` |
| reserva_otras_fuentes_porcentaje | decimal | sobre Σ importe de detalle `naturaleza = otras_fuentes` |
| reserva_operacion_porcentaje | decimal | sobre `subtotal_operacion` |
| deleted | bool | indica si el registro fue eliminado lógicamente |
| created_at / created_by / updated_at / updated_by / deleted_at / deleted_by | | |


Semilla ilustrativa (editable):

| Rubro | Espera | Reserva |
|---|---|---|
| Depreciación | 100 | 0 |
| Inversión | 100 | 100 |
| Seguro | 100 | 100 |
| Mantenimiento | 50 | 0 |
| Combustible | 0 | 0 |
| Lubricante | 0 | 0 |
| Llantas | 0 | 0 |
| Piezas especiales | 0 | 0 |
| Otras fuentes | 0 | 0 |
| Operación | 100 | 0 |

### `equipo_costo_horario`

Extensión 1:1 de `insumo` cuando `insumo.tipo = equipo_herramienta`

Equipo **propio**. Descompone el costo por hora en cargos fijos (existen
aunque la máquina no trabaje, calculados sobre el valor de la máquina) y
cargos variables (consumos y operación, que dependen del uso) — metodología
estándar en México (SCT, CMIC): nunca se toma solo la depreciación lineal
como costo horario.

Los cargos fijos se calculan sobre `cf_valor_maquina` (el costo de
adquisición **sin** llantas ni piezas especiales, que se deprecian aparte
por su propio desgaste — las llantas de hecho se cargan como consumo, ver
`equipo_costo_horario_detalle`), no sobre el costo total de la máquina.

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |
| region_id | uuid | FK → region, nullable — `null` = nacional (sin región específica) |
| cf_costo_maquina | decimal | precio de la máquina nueva, todo incluido (Cm) |
| cf_valor_llantas | decimal | default 0 — valor de las llantas incluido en `cf_costo_maquina` (Pn), se resta porque se deprecia por desgaste, no por tiempo |
| cf_valor_piezas_especiales | decimal | default 0 — valor de piezas especiales incluido en `cf_costo_maquina` (Pa) |
| cf_valor_maquina | decimal | cache = cf_costo_maquina − cf_valor_llantas − cf_valor_piezas_especiales (Vm) |
| cf_valor_rescate_porcentaje | decimal | % de valor de rescate al final de su vida económica (r) |
| cf_valor_rescate | decimal | cache = cf_valor_maquina × cf_valor_rescate_porcentaje / 100 (Vr) |
| cf_vida_economica_anios | decimal | vida económica estimada, en años |
| cf_horas_uso_anual | decimal | horas efectivas de uso al año (Hea), para prorratear cargos fijos |
| cf_vida_util_horas | decimal | cache = cf_vida_economica_anios × cf_horas_uso_anual (Ve) |
| cf_tasa_interes_anual_porcentaje | decimal | costo de capital/oportunidad de la inversión (i) |
| cf_tasa_seguros_anual_porcentaje | decimal | (s) |
| cf_mantenimiento_porcentaje | decimal | % de la depreciación que representa el cargo de mantenimiento (Ko) |
| cf_depreciacion_hora | decimal | cache = (cf_valor_maquina − cf_valor_rescate) / cf_vida_util_horas (D) |
| cf_inversion_hora | decimal | cache = (cf_valor_maquina + cf_valor_rescate) × cf_tasa_interes_anual_porcentaje/100 / (2 × cf_horas_uso_anual) (Im) |
| cf_seguro_hora | decimal | cache = (cf_valor_maquina + cf_valor_rescate) × cf_tasa_seguros_anual_porcentaje/100 / (2 × cf_horas_uso_anual) (Sm) |
| cf_mantenimiento_hora | decimal | cache = cf_mantenimiento_porcentaje/100 × cf_depreciacion_hora (Mn) |
| cf_cargo_fijo_hora | decimal | cache = cf_depreciacion_hora + cf_inversion_hora + cf_seguro_hora + cf_mantenimiento_hora |
| subtotal_consumo | decimal | cache = Σ `equipo_costo_horario_detalle`.importe donde `tipo = consumo` |
| subtotal_operacion | decimal | cache = Σ `equipo_costo_horario_detalle`.importe donde `tipo = operacion` |
| cargo_variable_hora | decimal | cache = subtotal_consumo + subtotal_operacion |
| costo_horario_total | decimal | cache = cf_cargo_fijo_hora + cargo_variable_hora |

INFO AYUDA
https://www.youtube.com/watch?v=TsdTwQzFdME


### `equipo_costo_horario_detalle`

Matriz de cargos variables (insumo, cantidad
por hora, costo, importe), unificada en una sola tabla con `tipo` para
distinguir **consumo** (diesel, aceites, llantas — insumos `material`) de
**operación** (el operador, como `salario` o `cuadrilla`, con su cantidad en
jornales u horas consumidos por hora de máquina).

Cuando `tipo = consumo`, `naturaleza` clasifica el renglón en el desglose
CMIC/RLOPSRM (combustible, lubricante, llantas, piezas especiales, otras
fuentes de energía). Sin eso, `perfil_inactividad_equipo` no puede aplicar
un % distinto a diesel, a llantas o a energía eléctrica. El analista
asigna el valor; no se infiere del insumo.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| equipo_costo_horario_id | uuid | FK → equipo_costo_horario (insumo_id) |
| detalle_insumo_id | uuid | FK → insumo — `material` si `tipo = consumo`; `mano_obra`/`cuadrilla` si `tipo = operacion` |
| tipo | enum | `consumo`, `operacion` |
| naturaleza | enum | `combustible`, `lubricante`, `llantas`, `piezas_especiales`, `otras_fuentes` — obligatorio si `tipo = consumo`; `null` si `tipo = operacion` |
| orden | int | orden de visualización |
| cantidad | decimal | cantidad consumida (o jornales/horas de operador) por hora de máquina |
| costo | decimal | precio/costo vigente del insumo referenciado — si es `cuadrilla`, `cuadrilla_costo.costo_total` resuelto por región (ver `cuadrilla_costo`) |
| importe | decimal | cache = cantidad × costo |
| created_at / created_by / updated_at / updated_by | | |














### `equipo_rentado`

Extensión 1:1 de `insumo` cuando `insumo.tipo = equipo_herramienta` y el
equipo es de un **proveedor externo** — tarifa de renta en vez de cálculo de
depreciación propia. La tarifa es un campo simple, sin historial de
vigencias (igual que `salario`/`herramienta`).

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |
| tarifa_hora | decimal | campo simple, sin historial de vigencias |
| incluye_operador | bool | default false |
| operador_insumo_id | uuid | FK → insumo, nullable — si el operador viene incluido en la renta pero se factura como insumo aparte |
| tipo_propiedad | enum | `rentado`, `rentado_a_compra` — arrendamiento puro vs. arrendamiento con opción a compra |
| procedencia | enum | `nacional`, `extranjero` |
| marca | text | nullable |
| modelo | text | nullable |
| placas | text | nullable |
| numero_serie | text | nullable |
| pais | text | nullable — país de origen del equipo, relevante si `procedencia = extranjero` |
| anio | int | nullable — año de fabricación |
| ubicacion_actual | text | nullable |
| uso_actual | text | nullable |
| capacidad | text | nullable — ej. "7.00 m3", "13.00 toneladas" |
| vida_util | text | nullable |
| propietario | text | nullable — nombre del propietario legal del equipo, si difiere del proveedor que lo renta |

Sin columnas de auditoría propias — comparte el ciclo de vida de su `insumo` (ver nota en `material`).

### `basico_auxiliar`

Extensión 1:1 de `insumo` cuando `insumo.tipo = basico_auxiliar`.

Material compuesto, mezcla o sistema con su propia matriz de insumos (ej.
concreto premezclado, mortero, cimbra común, sistema de impermeabilización).
A diferencia de `cuadrilla`, **sí permite composición recursiva** — un
auxiliar puede tener como componente a otro auxiliar (ej. un "aplanado" que
usa "mortero" como componente).

| Campo | Tipo | Notas |
|---|---|---|
| insumo_id | uuid | PK, FK → insumo |
| sub_total_material | decimal | cache = Σ basico_auxiliar_componente.importe donde basico_auxiliar_componente.tipo = material |
| sub_total_mano_obra | decimal | cache = Σ basico_auxiliar_componente.importe donde basico_auxiliar_componente.tipo = mano_obra |
| sub_total_equipo | decimal | cache = Σ basico_auxiliar_componente.importe donde basico_auxiliar_componente.tipo = equipo_herramienta |
| sub_total_basico_auxiliar | decimal | cache = Σ basico_auxiliar_componente.importe donde basico_auxiliar_componente.tipo = basico_auxiliar |
| costo_total | decimal | cache = sub_total_material + sub_total_mano_obra + sub_total_equipo + sub_total_basico_auxiliar (= Σ basico_auxiliar_componente.importe) |

Sin columnas de auditoría propias — comparte el ciclo de vida de su `insumo` (ver nota en `material`).

### `basico_auxiliar_componente`

Composición **recursiva** de un `basico_auxiliar` — a diferencia de
`cuadrilla_detalle`, aquí sí se permite que un componente sea otro
`basico_auxiliar` (o una `cuadrilla`), ya que un material compuesto puede
usar otro material compuesto como parte de su receta (ej. un "aplanado" que
usa "mortero" como componente, y "mortero" a su vez es otro auxiliar).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| basico_auxiliar_insumo_id | uuid | FK → basico_auxiliar (insumo_id) |
| componente_insumo_id | uuid | FK → insumo — cualquier tipo, incluyendo otro `basico_auxiliar` o `cuadrilla` (permite recursión) |
| tipo | enum | `material`, `mano_obra`, `equipo_herramienta`, `basico_auxiliar` — denormalizado desde `insumo.tipo` del componente, evita un join para saber qué naturaleza tiene la línea |
| cantidad | decimal | rendimiento del componente por unidad del auxiliar |
| importe | decimal | cache = cantidad × precio/costo vigente del componente — si el componente es `cuadrilla`, el costo es `cuadrilla_costo.costo_total` resuelto por región (ver `cuadrilla_costo`) |
| created_at / created_by / updated_at / updated_by | | |


### `concepto`

**Catálogo maestro** de partidas de obra, a nivel organización — igual que
`insumo`, se define una vez y se reutiliza entre proyectos (ej. "Excavación a
máquina en material tipo II" con su clave y unidad estándar del despacho o
banco de precios de origen). No lleva cantidad ni pertenece a un proyecto:
eso es responsabilidad de `proyecto_presupuesto`.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| clave | text | única dentro de la organización — clave de catálogo (interna o de banco de precios de origen) |
| descripcion | text | |
| unidad_id | uuid | FK → unidad_medida — unidad por defecto |
| sub_total_material | decimal | cache = Σ concepto_componente.importe donde concepto_componente.tipo = material |
| sub_total_mano_obra | decimal | cache = Σ concepto_componente.importe donde concepto_componente.tipo = mano_obra |
| sub_total_equipo | decimal | cache = Σ concepto_componente.importe donde concepto_componente.tipo = equipo_herramienta |
| sub_total_basico_auxiliar | decimal | cache = Σ concepto_componente.importe donde concepto_componente.tipo = basico_auxiliar |
| costo_total | decimal | cache = sub_total_material + sub_total_mano_obra + sub_total_equipo + sub_total_basico_auxiliar (= Σ concepto_componente.importe) — costo de catálogo, orientativo; no es el costo real de ningún proyecto |
| activo | bool | default true |
| created_at / created_by / updated_at / updated_by | | |

### `concepto_componente`

**Matriz de insumos a nivel catálogo** — mismo patrón que
`basico_auxiliar_componente` (un renglón por insumo con su rendimiento y
costo), pero cuelga de `concepto` en lugar de un `insumo`: un concepto **no
es un insumo**, no tiene `insumo_id` ni puede usarse como componente de otro
concepto, otra cuadrilla o otro básico/auxiliar. Es la única matriz de
insumos de un concepto — su `costo_total` es lo que se copia a
`proyecto_presupuesto.precio_unitario` al instanciar el concepto en un nodo
`partida`; el proyecto no tiene su propia matriz de insumos, solo puede
editar el `precio_unitario` copiado.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| concepto_id | uuid | FK → concepto |
| insumo_id | uuid | FK → insumo  |
| tipo | enum | `material`, `mano_obra`, `equipo_herramienta`, `basico_auxiliar` — denormalizado de `insumo.tipo` |
| orden | int | |
| cantidad | decimal | cantidad de insumo por unidad de concepto |
| precio_unitario | decimal | precio/costo vigente del insumo al momento de consultar — no historizado, se recalcula (a diferencia de `proyecto_presupuesto.precio_unitario`, que sí se congela por proyecto una vez copiado). Si el insumo es `cuadrilla`, se toma `cuadrilla_costo.costo_total` resuelto por región (ver `cuadrilla_costo`) |
| importe | decimal | cache = cantidad × precio_unitario |

| created_at / created_by / updated_at / updated_by | | |

---

## 4. Estructura del presupuesto y APU

### `proyecto_presupuesto`

**Árbol del presupuesto de un proyecto** — estructura de profundidad libre
(no ceñida a los 3 niveles fijos capítulo/subcapítulo/partida de un
clasificador normado, aunque puede modelarlos si se necesita). Cada nodo es
o bien un **agrupador** (`tipo = grupo`, ej. capítulo/subcapítulo/frente de
obra, sin `concepto_id`) o una **instancia de un concepto de catálogo**
(`tipo = partida`, hoja del árbol, con `concepto_id` obligatorio). Un mismo
`concepto` de catálogo puede instanciarse en muchos nodos/proyectos con
cantidad y precio distintos (los precios de insumo varían por
región/proyecto aunque el concepto de catálogo sea el mismo).

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| parent_id | uuid | FK → proyecto_presupuesto, nullable — nulo en los nodos raíz |
| tipo | enum | `grupo`, `partida` |
| orden | int | orden de presentación entre hermanos |
| clave | text | clave de presupuesto del nodo (ej. "1", "1.03") — única dentro del proyecto |
| nombre | text | nullable — solo si `tipo = grupo`; en `partida` la descripción viene de `concepto` (u `descripcion_override`) |
| concepto_id | uuid | FK → concepto, nullable — obligatorio si `tipo = partida`, debe ser nulo si `tipo = grupo` |
| descripcion_override | text | nullable — solo si `tipo = partida` y el proyecto necesita ajustar la redacción sin tocar el catálogo |
| unidad_id | uuid | FK → unidad_medida, nullable — solo si `tipo = partida`, copiada de `concepto.unidad_id` al agregarlo, editable |
| cantidad | decimal | nullable — solo si `tipo = partida`, cantidad contratada de este concepto en el proyecto |
| precio_unitario | decimal | nullable — solo si `tipo = partida`, copiado de `concepto.costo_total` al instanciar; editable si el proyecto necesita ajustarlo sin tocar el catálogo — no hay matriz de insumos a nivel proyecto, el detalle vive en `concepto_componente` |
| importe | decimal | nullable — solo si `tipo = partida`, cache = cantidad × precio_unitario |
| created_at / created_by / updated_at / updated_by | | |
| importe | decimal | cache = rendimiento × precio_unitario |
| importe_herramienta_menor | decimal | cache, solo si el insumo referenciado es `mano_obra`/`cuadrilla` = importe × `porcentaje_herramienta_menor` del insumo — línea visible aparte, no requiere insumo de herramienta en catálogo |
| created_at / created_by / updated_at / updated_by | | |

### `numero_generador_hoja`

Agrupador de la hoja de números generadores por concepto instanciado en el
proyecto — permite separar la cuantificación por eje, nivel o frente de
obra.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_presupuesto_id | uuid | FK → proyecto_presupuesto — debe apuntar a un nodo con `tipo = partida` |
| nombre | text | ej. "Eje A-B, Nivel 1" |
| orden | int | |
| created_at / created_by / updated_at / updated_by | | |

### `numero_generador_renglon`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| hoja_id | uuid | FK → numero_generador_hoja |
| descripcion | text | |
| cantidad | decimal | default 1 |
| largo / ancho / alto | decimal | nullable — dimensión no usada equivale a factor 1 |
| subtotal | decimal | cache = cantidad × largo × ancho × alto |
| orden | int | |
| created_at / created_by / updated_at / updated_by | | |

---

## 5. Parámetros financieros

### `indirecto_item`

Desglose itemizado de los indirectos — la práctica mexicana no captura un
porcentaje a ojo, sino que arma un "análisis de indirectos" con cada renglón
de costo de campo y de oficina central, prorrateado sobre la duración de la
obra. Es la fuente de donde se calculan los porcentajes cacheados en
`parametros_indirectos`.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| categoria | enum | `administracion_campo` (residente, superintendente, laboratorista, veladores, oficina de campo...) o `administracion_central` (oficinas centrales, depreciación de mobiliario, capacitación, seguros corporativos...) |
| concepto | text | ej. "Sueldo de residente de obra", "Renta de campamento" |
| tipo_costo | enum | `sueldo_personal`, `renta_arrendamiento`, `servicios`, `papeleria_comunicaciones`, `depreciacion_mobiliario`, `seguros_fianzas`, `capacitacion`, `otro` |
| insumo_relacionado_id | uuid | FK → insumo, nullable — si el renglón es personal ya dado de alta como insumo `mano_obra` (ej. residente de obra) |
| monto_mensual | decimal | |
| cantidad_meses | decimal | duración estimada de la obra usada para prorratear |
| importe_total | decimal | cache = monto_mensual × cantidad_meses |
| created_at / created_by / updated_at / updated_by | | |

### `parametros_indirectos`

Uno por proyecto. Los porcentajes de administración son un **caché
calculado** desde `indirecto_item` (Σ importe_total de la categoría ÷ costo
directo total del presupuesto × 100) — se guardan aquí porque la cascada de
cálculo del presupuesto (costo directo → indirectos → financiamiento →
utilidad → cargos adicionales) los consume como porcentaje, no como lista de
renglones. También admiten captura manual directa cuando no se itemiza.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto, único |
| porcentaje_administracion_campo | decimal | default 0 — cache desde indirecto_item o captura manual |
| porcentaje_administracion_central | decimal | default 0 — cache desde indirecto_item o captura manual |
| porcentaje_financiamiento | decimal | default 0 |
| tasa_referencia_financiamiento | decimal | nullable — ej. TIIE usada para calcular financiamiento |
| porcentaje_utilidad | decimal | default 0 |
| created_at / created_by / updated_at / updated_by | | |

### `cargo_adicional`

Catálogo de cargos normativos aplicables sobre el costo directo o
directo+indirectos (ej. "5 al millar" de vigilancia SFP en obra pública,
derechos locales de supervisión). Modelado como catálogo, no como campo fijo,
porque varía por dependencia y contrato.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| nombre | text | |
| porcentaje | decimal | |
| base_calculo | enum | `costo_directo`, `costo_directo_mas_indirectos` |
| obligatorio | bool | true si es requisito de ley (ej. obra pública federal) |
| created_at / created_by / updated_at / updated_by | | |

---

## 6. Ejecución y pagos (obra pública)

Específico del mecanismo de pago de obra pública mexicana: avances
periódicos facturados vía "estimaciones", con anticipo amortizable y fianzas
obligatorias (Art. 48 LOPSRM).

### `estimacion`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| numero | int | consecutivo |
| periodo_inicio / periodo_fin | date | |
| fecha_presentacion | date | nullable |
| estatus | enum | `borrador`, `presentada`, `autorizada`, `pagada` |
| monto_bruto | decimal | cache = Σ estimacion_concepto.importe |
| amortizacion_anticipo | decimal | cache |
| retencion_garantia | decimal | cache |
| monto_neto | decimal | cache = bruto − amortización − retenciones |
| created_at / created_by / updated_at / updated_by | | |

### `estimacion_concepto`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| estimacion_id | uuid | FK → estimacion |
| proyecto_presupuesto_id | uuid | FK → proyecto_presupuesto — debe apuntar a un nodo con `tipo = partida` |
| cantidad_periodo | decimal | avance de este periodo |
| cantidad_acumulada | decimal | avance acumulado a la fecha, no puede exceder `proyecto_presupuesto.cantidad` |
| importe | decimal | cache = cantidad_periodo × precio unitario congelado del concepto |
| created_at / created_by / updated_at / updated_by | | |

### `anticipo`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| monto | decimal | |
| porcentaje_del_contrato | decimal | típicamente hasta 30% en obra pública federal |
| fecha_entrega | date | |
| created_at / created_by / updated_at / updated_by | | |

### `garantia_fianza`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| proyecto_id | uuid | FK → proyecto |
| tipo | enum | `anticipo`, `cumplimiento`, `vicios_ocultos`, `calidad` |
| afianzadora | text | |
| numero_poliza | text | |
| monto | decimal | |
| fecha_emision | date | |
| fecha_vigencia | date | |
| created_at / created_by / updated_at / updated_by | | |

---

## 7. Bancos de precios de referencia

### `banco_precios`

Catálogos externos importables — nunca referenciados en vivo desde un
concepto.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| fuente | enum | `indaabin`, `cmic`, `cfe`, `pemex`, `sct`, `estatal`, `otro` |
| nombre | text | |
| version | text | |
| fecha_publicacion | date | |
| licencia | text | nullable |
| region_id | uuid | FK → region, nullable — algunos bancos son regionales |
| created_at / created_by / updated_at / updated_by | | |

### `banco_precios_item`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| banco_precios_id | uuid | FK → banco_precios |
| clave | text | |
| tipo | enum | `material`, `mano_obra`, `equipo_herramienta`, `basico_auxiliar` — alineado a `insumo.tipo` |
| descripcion | text | |
| unidad_id | uuid | FK → unidad_medida |
| precio | decimal | |
| matriz_json | json | nullable — si el banco trae análisis detallado de insumos, no solo precio unitario |
| created_at / created_by / updated_at / updated_by | | |

---

## 8. Adjuntos (polimórfico)

### `adjunto`

Archivos ligados a cualquier entidad — planos, fotos de campo que sustentan
un renglón de números generadores, evidencia fotográfica de una estimación,
cotizaciones en PDF de un proveedor.

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| entidad | text | ej. `proyecto_presupuesto`, `numero_generador_renglon`, `estimacion` |
| entidad_id | uuid | id del registro al que se adjunta |
| nombre_archivo | text | |
| ruta_o_url | text | |
| tipo_mime | text | |
| tamano_bytes | int | |
| created_at / created_by / updated_at / updated_by | | `created_by` = quién subió el archivo; `updated_by` solo cambia si se reemplaza el archivo |

---

## Proyecto (entidad raíz — referenciada por todos los módulos)

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| organizacion_id | uuid | FK → organizacion |
| cliente_id | uuid | FK → cliente, nullable |
| region_id | uuid | FK → region, nullable |
| folio | text | |
| nombre | text | |
| descripcion | text | nullable |
| tipo_obra | enum | `publica`, `privada` |
| numero_contrato | text | nullable |
| fecha_contrato | date | nullable |
| dependencia | text | nullable — ej. "SCT", "CFE", gobierno estatal, solo si `tipo_obra = publica` |
| ubicacion | text | nullable |
| moneda | text | default `MXN` |
| fecha_inicio | date | nullable |
| fecha_termino_contractual | date | nullable |
| estatus | enum | `borrador`, `en_proceso`, `cerrado`, `cancelado` |
| modo | enum | `local`, `compartido` — local = archivo aislado, compartido = sincronizado entre colaboradores |
| created_at / created_by / updated_at / updated_by | | |
