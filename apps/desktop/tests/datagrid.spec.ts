import { expect, test, type Locator, type Page } from "@playwright/test";

const ROW_HEIGHT = 27;

const rows = (p: Page) => p.locator("tbody tr[data-index]");
const cell = (p: Page, rowIdx: number, field: string) =>
  p.locator(`tbody tr[data-index="${rowIdx}"] td[data-column-id="${field}"]`);
const scroller = (p: Page) => p.locator("table").locator("xpath=..");
const log = (p: Page) => p.locator('[data-t="log"]');

async function ready(page: Page) {
  await page.goto("/grid-test.html");
  await expect(rows(page).first()).toBeVisible();
}

/** Selecciona una celda con clic y espera a que quede marcada. */
async function select(page: Page, rowIdx: number, field: string): Promise<Locator> {
  const c = cell(page, rowIdx, field);
  await c.click();
  await expect(c.locator("div").first()).toHaveClass(/ring-primary/);
  return c;
}

test.describe("virtualización", () => {
  test("monta solo una ventana de filas y llega hasta la última", async ({ page }) => {
    await ready(page);
    await expect(page.locator('[data-t="count"]')).toHaveText("filas:500");

    const montadas = await rows(page).count();
    expect(montadas).toBeGreaterThan(10);
    expect(montadas).toBeLessThan(80);

    await scroller(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(page.locator("tbody").getByText("INS-0499")).toBeVisible();
    expect(await rows(page).count()).toBeLessThan(80);
  });

  test("toda fila mide exactamente ROW_HEIGHT", async ({ page }) => {
    await ready(page);
    const alturas = await rows(page).evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(new Set(alturas)).toEqual(new Set([ROW_HEIGHT]));
  });
});

test.describe("columnas ancladas", () => {
  test("siguen pegadas al borde al hacer scroll horizontal", async ({ page }) => {
    await ready(page);
    const box = scroller(page);
    const antes = await cell(page, 0, "__index").boundingBox();
    await box.evaluate((el) => (el.scrollLeft = 900));
    await page.waitForTimeout(100);
    const despues = await cell(page, 0, "__index").boundingBox();
    expect(Math.abs(despues!.x - antes!.x)).toBeLessThan(2);

    // Y una columna normal sí se movió (el scroll ocurrió de verdad).
    expect(await box.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  });

  test("con fila en borrador la celda anclada queda opaca", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="add"]').click();
    await page.keyboard.press("Escape"); // cierra el editor, conserva el borrador

    const fila = page.locator("tbody tr.row-new");
    await expect(fila).toHaveCount(1);

    await scroller(page).evaluate((el) => (el.scrollLeft = 900));
    await page.waitForTimeout(100);

    const anclada = fila.locator('td[data-column-id="__actions"]');
    const pintura = await anclada.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.backgroundColor, imagen: s.backgroundImage };
    });
    // Capa 1: fondo opaco (nada del contenido que pasa por debajo se transparenta).
    expect(pintura.color).toMatch(/^rgb\(/);
    expect(pintura.color).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    // Capa 2: el mismo tinte de la fila, como gradiente.
    expect(pintura.imagen).toContain("gradient");
  });

  test("el tinte de borrador funciona en tema oscuro", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="theme"]').click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.locator('[data-t="add"]').click();
    await page.keyboard.press("Escape");

    const fila = page.locator("tbody tr.row-new");
    // Translúcido en oscuro (se mezcla con el fondo), no un verde sólido.
    // Chromium devuelve el `color-mix` como `oklab(… / 0.6)`.
    expect(await fila.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/\/\s*0?\.6/);

    // La celda anclada, en cambio, tiene que ser 100% opaca.
    const anclada = fila.locator('td[data-column-id="__actions"]');
    const fondoAnclada = await anclada.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fondoAnclada).not.toMatch(/\/\s*0?\.\d/);
    expect(fondoAnclada).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);
    expect(await anclada.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain("gradient");
  });
});

test.describe("cursor", () => {
  test("sobre las celdas es la flecha estándar, no la manita ni la barra de texto", async ({ page }) => {
    await ready(page);
    const cursorDe = (l: Locator) => l.evaluate((el) => getComputedStyle(el).cursor);

    for (const campo of ["codigo", "precio", "activo", "calidad", "created_by"]) {
      expect(await cursorDe(cell(page, 0, campo).locator("div").first()), campo).toBe("default");
    }
    // Columnas ancladas y el propio <tr> (el número de fila daba barra de texto).
    for (const campo of ["__index", "__select", "__actions"]) {
      expect(await cursorDe(cell(page, 0, campo)), campo).toBe("default");
    }
    expect(await cursorDe(cell(page, 0, "activo").locator("input"))).toBe("default");
    expect(await cursorDe(rows(page).first())).toBe("default");

    // En modo "single" la fila tampoco es un botón.
    await page.locator('[data-t="single"]').check();
    await expect(rows(page).first()).toBeVisible();
    expect(await cursorDe(rows(page).first())).toBe("default");
  });

  test("los editores sí muestran la barra de texto", async ({ page }) => {
    await ready(page);
    await cell(page, 0, "notas").dblclick();
    const editor = cell(page, 0, "notas").locator("input");
    expect(await editor.evaluate((el) => getComputedStyle(el).cursor)).toBe("text");

    await page.keyboard.press("Escape");
    await cell(page, 0, "familia").dblclick();
    const combo = cell(page, 0, "familia").locator("input");
    expect(await combo.evaluate((el) => getComputedStyle(el).cursor)).toBe("text");
  });

  test("el tirador de ancho sí conserva su cursor", async ({ page }) => {
    await ready(page);
    const th = page.locator("thead th").filter({ hasText: "Precio" });
    const tirador = th.locator("div").last();
    expect(await tirador.evaluate((el) => getComputedStyle(el).cursor)).toBe("col-resize");
  });
});

test.describe("redimensionar columnas", () => {
  test("arrastrar el tirador cambia el ancho de esa columna y no de las demás", async ({ page }) => {
    await ready(page);
    const th = page.locator('thead th').filter({ hasText: "Precio" });
    const otra = page.locator('thead th').filter({ hasText: "Cantidad" });
    const anchoAntes = (await th.boundingBox())!.width;
    const otraAntes = (await otra.boundingBox())!.width;

    const caja = (await th.boundingBox())!;
    await page.mouse.move(caja.x + caja.width - 3, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width + 80, caja.y + caja.height / 2, { steps: 10 });
    await page.mouse.up();

    const anchoDespues = (await th.boundingBox())!.width;
    expect(anchoDespues - anchoAntes).toBeGreaterThan(60);
    expect((await otra.boundingBox())!.width).toBeCloseTo(otraAntes, 0);

    // Las celdas del cuerpo siguieron el ancho (van por la variable CSS).
    const celda = (await cell(page, 0, "precio").boundingBox())!;
    expect(celda.width).toBeCloseTo(anchoDespues, 0);
  });
});

test.describe("teclado", () => {
  test("las flechas mueven la selección y F2 abre el editor", async ({ page }) => {
    await ready(page);
    await select(page, 0, "codigo");

    await page.keyboard.press("ArrowRight");
    await expect(cell(page, 0, "descripcion").locator("div").first()).toHaveClass(/ring-primary/);

    await page.keyboard.press("ArrowDown");
    await expect(cell(page, 1, "descripcion").locator("div").first()).toHaveClass(/ring-primary/);

    await page.keyboard.press("F2");
    await expect(cell(page, 1, "descripcion").locator("input")).toBeFocused();
  });

  test("mantener la flecha abajo recorre muchas filas", async ({ page }) => {
    await ready(page);
    await select(page, 0, "codigo");
    await page.keyboard.down("ArrowDown");
    await page.waitForTimeout(1200);
    await page.keyboard.up("ArrowDown");

    const seleccion = await page.locator("td div.ring-primary").first().textContent();
    const indice = Number(seleccion!.replace("INS-", ""));
    expect(indice).toBeGreaterThan(5);
  });

  test("escribir sobre una celda reemplaza el valor, Escape lo descarta", async ({ page }) => {
    await ready(page);
    await select(page, 0, "notas");
    await page.keyboard.type("hola");
    const editor = cell(page, 0, "notas").locator("input");
    await expect(editor).toHaveValue("hola");
    await page.keyboard.press("Escape");
    await expect(cell(page, 0, "notas")).not.toContainText("hola");
  });

  test("Delete vacía la celda y entra en borrador sin persistir", async ({ page }) => {
    await ready(page);
    await select(page, 5, "notas"); // el harness solo pone nota cada 5 filas
    await expect(cell(page, 5, "notas")).toContainText("Nota 5");
    await page.keyboard.press("Delete");
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(1);
    await expect(log(page)).toHaveText("");
  });

  test("Ctrl+Enter persiste la fila", async ({ page }) => {
    await ready(page);
    await select(page, 0, "precio");
    await page.keyboard.type("999.5");
    await page.keyboard.press("Control+Enter");
    await expect(log(page)).toContainText('"precio":999.5');
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(0);
  });

  test("Escape cancela el borrador y revierte el valor", async ({ page }) => {
    await ready(page);
    await select(page, 0, "notas");
    await page.keyboard.type("basura");
    await page.keyboard.press("Enter");
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(0);
    await expect(cell(page, 0, "notas")).not.toContainText("basura");
    await expect(log(page)).toHaveText("");
  });

  test("Ctrl+Home y Ctrl+End saltan a los extremos", async ({ page }) => {
    await ready(page);
    await select(page, 0, "codigo");
    await page.keyboard.press("Control+End");
    await expect(page.locator("tbody").getByText("INS-0499")).toBeVisible();
    await page.keyboard.press("Control+Home");
    await expect(page.locator("tbody").getByText("INS-0000")).toBeVisible();
  });
});

test.describe("columnas especiales", () => {
  test("las estrellas se pintan y el clic fija la calificación", async ({ page }) => {
    await ready(page);
    const estrellas = cell(page, 1, "calidad").locator("button");
    await expect(estrellas).toHaveCount(5);
    await estrellas.nth(3).click();
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(1);
    await page.keyboard.press("Control+Enter");
    await expect(log(page)).toContainText("edit");
  });

  test("el combobox filtra y las unidades dependen de la familia", async ({ page }) => {
    await ready(page);
    await select(page, 0, "familia");
    await page.keyboard.press("F2");
    const opciones = page.locator("ul[class*=fixed] li");
    await expect(opciones).toHaveCount(4);
    await opciones.filter({ hasText: "Madera" }).click();

    await select(page, 0, "unidad");
    await page.keyboard.press("F2");
    await expect(page.locator("ul[class*=fixed] li")).toHaveText(["Pieza", "m²", "m³"]);
  });

  test("el checkbox booleano alterna con la barra espaciadora", async ({ page }) => {
    await ready(page);
    const c = cell(page, 1, "activo");
    const chk = c.locator("input[type=checkbox]");
    const antes = await chk.isChecked();
    // Se llega con el teclado: el clic al centro de la celda daría en el propio
    // checkbox (y lo alternaría), y el clic al borde no selecciona — el `<div>`
    // del checkbox ocupa toda la celda y corta la propagación.
    await select(page, 1, "merma");
    await page.keyboard.press("ArrowRight");
    await expect(c.locator("div").first()).toHaveClass(/ring-primary/);
    await expect(chk).toBeChecked({ checked: antes });

    await page.keyboard.press(" ");
    await expect(chk).toBeChecked({ checked: !antes });
  });

  test("las columnas readOnly no se editan", async ({ page }) => {
    await ready(page);
    const c = cell(page, 0, "created_by");
    await c.click();
    await c.click();
    await expect(c.locator("input")).toHaveCount(0);
  });
});

test.describe("portapapeles", () => {
  test("copia la celda seleccionada", async ({ page }) => {
    await ready(page);
    await select(page, 2, "codigo");
    await page.keyboard.press("Control+c");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("INS-0002");
  });

  test("clic en la columna de índice copia la fila completa en TSV", async ({ page }) => {
    await ready(page);
    await cell(page, 2, "__index").click();
    await page.keyboard.press("Control+c");
    const texto = await page.evaluate(() => navigator.clipboard.readText());
    expect(texto.split("\t").length).toBe(12);
    expect(texto).toContain("INS-0002");
  });

  test("pegar varias columnas escribe en el borrador", async ({ page }) => {
    await ready(page);
    await select(page, 0, "codigo");
    await page.evaluate(() => navigator.clipboard.writeText("ABC-1\tDescripción pegada"));
    await page.keyboard.press("Control+v");
    await expect(cell(page, 0, "codigo")).toContainText("ABC-1");
    await expect(cell(page, 0, "descripcion")).toContainText("Descripción pegada");
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(1);
  });
});

test.describe("alta, baja y errores", () => {
  test("Agregar abre una fila nueva en borrador y la persiste", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="add"]').click();
    await expect(page.locator("tbody tr.row-new")).toHaveCount(1);
    await page.keyboard.type("NUEVO-1");
    await page.keyboard.press("Control+Enter");
    await expect(log(page)).toContainText('add "NUEVO-1"');
    await expect(page.locator('[data-t="count"]')).toHaveText("filas:501");
  });

  test("un guardado fallido conserva el borrador y marca el campo", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="fail"]').check();
    await page.locator('[data-t="add"]').click();
    await page.keyboard.type("X");
    await page.keyboard.press("Control+Enter");

    await expect(page.locator("tbody tr.row-new")).toHaveCount(1);
    await expect(page.getByText("El campo descripción no puede estar vacío").first()).toBeVisible();
    await expect(page.locator("td div.ring-destructive").first()).toBeVisible();
  });

  test("eliminar pide confirmación y avisa al padre", async ({ page }) => {
    await ready(page);
    await cell(page, 1, "__select").locator("input").check();
    await page.locator('[data-t="del"]').click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(log(page)).toContainText('delete ["r1"]');
    await expect(page.locator('[data-t="count"]')).toHaveText("filas:499");
  });
});

test.describe("búsqueda", () => {
  test("filtra por el texto que se ve en pantalla", async ({ page }) => {
    await ready(page);
    await page.getByPlaceholder("Buscar…").fill("INS-0123");
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("Insumo de prueba número 123");
  });

  test("encuentra por el valor formateado, no por el crudo", async ({ page }) => {
    await ready(page);
    // La fecha se guarda en ISO y se muestra en formato México: buscar lo que
    // se ve tiene que funcionar, y buscar el crudo no.
    const visible = (await cell(page, 3, "created_at").textContent())!.trim();
    expect(visible).toMatch(/^\d{2}\/\d{2}\/\d{2}/);

    await page.getByPlaceholder("Buscar…").fill(visible);
    await expect(rows(page).first()).toBeVisible();

    await page.getByPlaceholder("Buscar…").fill("2026-04-13T09");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator("tbody")).toContainText("Sin registros.");
  });
});

test.describe("menú contextual", () => {
  /** Abre el menú sobre una celda y devuelve sus ítems. */
  async function abrirMenu(page: Page, fila: number, campo: string) {
    await cell(page, fila, campo).click({ button: "right" });
    await expect(page.getByRole("menuitem").first()).toBeVisible();
    return page.getByRole("menuitem");
  }

  test("el clic derecho selecciona lo que hay debajo antes de abrirse", async ({ page }) => {
    await ready(page);
    // Con otra celda ya seleccionada: el menú tiene que actuar sobre la nueva,
    // no sobre la de antes.
    await select(page, 0, "codigo");
    await abrirMenu(page, 4, "descripcion");

    await expect(cell(page, 4, "descripcion").locator("div").first()).toHaveClass(/ring-primary/);
    await expect(cell(page, 4, "__select").locator("input")).toBeChecked();
  });

  test("copiar toma la celda sobre la que se pinchó", async ({ page }) => {
    await ready(page);
    const menu = await abrirMenu(page, 2, "codigo");
    await menu.filter({ hasText: "Copiar" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("INS-0002");
  });

  test("pegar escribe en el borrador", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => navigator.clipboard.writeText("MENU-1\tPegado desde el menú"));
    const menu = await abrirMenu(page, 0, "codigo");
    await menu.filter({ hasText: "Pegar" }).click();

    await expect(cell(page, 0, "codigo")).toContainText("MENU-1");
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(1);
  });

  test("agregar fila abre un borrador nuevo", async ({ page }) => {
    await ready(page);
    const menu = await abrirMenu(page, 1, "codigo");
    await menu.filter({ hasText: "Agregar fila" }).click();
    await expect(page.locator("tbody tr.row-new")).toHaveCount(1);
  });

  test("eliminar pide confirmación sobre la fila pinchada", async ({ page }) => {
    await ready(page);
    const menu = await abrirMenu(page, 1, "codigo");
    await menu.filter({ hasText: "Eliminar" }).click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(log(page)).toContainText('delete ["r1"]');
  });

  test("con un borrador abierto no deja agregar ni eliminar", async ({ page }) => {
    await ready(page);
    await select(page, 0, "codigo");
    await page.keyboard.type("BORRADOR");
    await page.keyboard.press("Enter");
    await expect(page.locator("tbody tr.row-edit")).toHaveCount(1);

    const menu = await abrirMenu(page, 0, "codigo");
    await expect(menu.filter({ hasText: "Agregar fila" })).toBeDisabled();
    await expect(menu.filter({ hasText: "Eliminar" })).toBeDisabled();
    // Copiar y pegar sí siguen disponibles sobre el propio borrador.
    await expect(menu.filter({ hasText: "Copiar" })).toBeEnabled();
  });

  test("dentro del editor manda el menú nativo, no el del grid", async ({ page }) => {
    await ready(page);
    await select(page, 0, "descripcion");
    await page.keyboard.press("F2");
    await page.locator("tbody input[type=text]").click({ button: "right" });
    await expect(page.getByRole("menuitem")).toHaveCount(0);
  });
});

test.describe("estado de carga", () => {
  test("sin filas todavía muestra el esqueleto, no «Sin registros»", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="empty"]').check();
    await expect(page.locator("tbody")).toContainText("Sin registros.");

    await page.locator('[data-t="loading"]').check();
    await expect(page.locator("tbody")).not.toContainText("Sin registros.");
    // Suficientes filas falsas para llenar el alto disponible.
    expect(await page.locator("tbody tr[data-skeleton]").count()).toBeGreaterThan(10);
    // Y con la misma altura que las de verdad, para que nada salte al llegar.
    const alturas = await page.locator("tbody tr[data-skeleton]").evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    expect(new Set(alturas)).toEqual(new Set([ROW_HEIGHT]));
  });

  test("una recarga con filas en pantalla las conserva y marca la espera arriba", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="loading"]').check();

    await expect(page.locator('[data-t="grid-loading"]')).toBeVisible();
    await expect(page.locator("tbody tr[data-skeleton]")).toHaveCount(0);
    await expect(cell(page, 0, "codigo")).toContainText("INS-0000");
  });

  test("al terminar la carga no queda ni barra ni esqueleto", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="loading"]').check();
    await page.locator('[data-t="loading"]').uncheck();

    await expect(page.locator('[data-t="grid-loading"]')).toHaveCount(0);
    await expect(page.locator("tbody tr[data-skeleton]")).toHaveCount(0);
  });
});
