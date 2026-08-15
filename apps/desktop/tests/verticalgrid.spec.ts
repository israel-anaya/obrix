import { expect, test, type Locator, type Page } from "@playwright/test";

/** Un campo es un renglón; se busca por el `<th>` de su etiqueta. */
const fieldRow = (p: Page, field: string) => p.locator(`tbody tr:has(th[data-field="${field}"])`);
const cell = (p: Page, rowId: string, field: string) =>
  p.locator(`td[data-row-id="${rowId}"][data-field="${field}"]`);
const recordHeaders = (p: Page) => p.locator("thead th[data-row-id]");
const scroller = (p: Page) => p.locator("table").locator("xpath=..");
const log = (p: Page) => p.locator('[data-t="log"]');

async function ready(page: Page) {
  await page.goto("/vertical-grid-test.html");
  await expect(recordHeaders(page).first()).toBeVisible();
}

/** Selecciona una celda con clic y espera a que quede marcada. */
async function select(page: Page, rowId: string, field: string): Promise<Locator> {
  const c = cell(page, rowId, field);
  await c.click();
  await expect(c.locator("div").first()).toHaveClass(/ring-primary/);
  return c;
}

test.describe("transposición", () => {
  test("los campos son renglones y los registros columnas", async ({ page }) => {
    await ready(page);
    await expect(recordHeaders(page)).toHaveCount(4);
    // Un renglón por campo capturable, con su etiqueta a la izquierda.
    for (const field of ["nombre", "turno", "activo", "created_at"]) {
      await expect(fieldRow(page, field)).toHaveCount(1);
    }
    await expect(fieldRow(page, "nombre").locator("th")).toHaveText("Nombre");
    // Y cada registro aporta una celda a ese renglón.
    await expect(fieldRow(page, "nombre").locator("td[data-row-id]")).toHaveCount(4);
    await expect(cell(page, "p2", "nombre")).toHaveText("Perfil 2");
    await expect(cell(page, "p2", "espera_depreciacion")).toHaveText("4%");
  });

  test("los grupos titulan secciones que cruzan todo el ancho", async ({ page }) => {
    await ready(page);
    for (const titulo of ["Identificación", "Porcentajes", "En espera", "En reserva", "Control"]) {
      await expect(page.locator("tbody td", { hasText: new RegExp(`^${titulo}$`) })).toHaveCount(1);
    }
    // Sin `groups` se pintan todos los campos, en el orden de `config.columns`.
    await page.locator('[data-t="grouped"]').uncheck();
    await expect(page.locator("tbody td", { hasText: /^Identificación$/ })).toHaveCount(0);
    await expect(fieldRow(page, "nombre")).toHaveCount(1);
  });

  test("la columna de etiquetas queda pegada al hacer scroll horizontal", async ({ page }) => {
    await ready(page);
    const etiqueta = fieldRow(page, "nombre").locator("th").first();
    const antes = await etiqueta.boundingBox();
    await scroller(page).evaluate((el) => (el.scrollLeft = 300));
    await page.waitForTimeout(100);
    const despues = await etiqueta.boundingBox();
    expect(Math.abs(despues!.x - antes!.x)).toBeLessThan(2);
  });
});

test.describe("edición", () => {
  test("teclear sobre la celda la edita y ✓ la guarda", async ({ page }) => {
    await ready(page);
    await select(page, "p1", "espera_depreciacion");
    await page.keyboard.type("77");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+Enter");
    await expect(log(page)).toContainText('"id":"p1"');
    await expect(log(page)).toContainText('"espera_depreciacion":77');
    await expect(cell(page, "p1", "espera_depreciacion")).toHaveText("77%");
  });

  test("Escape cancela el borrador y deja el valor anterior", async ({ page }) => {
    await ready(page);
    await select(page, "p1", "espera_inversion");
    await page.keyboard.type("99");
    await page.keyboard.press("Enter");
    await expect(cell(page, "p1", "espera_inversion")).toHaveText("99%");
    await page.keyboard.press("Escape");
    await expect(cell(page, "p1", "espera_inversion")).toHaveText("3%");
    await expect(log(page)).toHaveText("");
  });

  test("un guardado fallido conserva el borrador y avisa", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="fail"]').check();
    await select(page, "p0", "nombre");
    await page.keyboard.type("Otro");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+Enter");
    await expect(log(page)).toContainText("error");
    // El aviso arriba del grid, y el campo señalado dentro de la celda.
    await expect(page.locator("div.text-destructive").first()).toHaveText("El campo nombre no puede estar vacío");
    await expect(cell(page, "p0", "nombre").locator("div").first()).toHaveClass(/ring-destructive/);
    await expect(cell(page, "p0", "nombre")).toHaveText("Otro");
  });
});

test.describe("teclado", () => {
  test("↑/↓ caminan los campos y ←/→ los registros", async ({ page }) => {
    await ready(page);
    await select(page, "p1", "nombre");
    await page.keyboard.press("ArrowDown");
    await expect(cell(page, "p1", "turno").locator("div").first()).toHaveClass(/ring-primary/);
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, "p2", "turno").locator("div").first()).toHaveClass(/ring-primary/);
    await page.keyboard.press("ArrowUp");
    await expect(cell(page, "p2", "nombre").locator("div").first()).toHaveClass(/ring-primary/);
    await page.keyboard.press("ArrowLeft");
    await expect(cell(page, "p1", "nombre").locator("div").first()).toHaveClass(/ring-primary/);
  });

  test("con un borrador abierto ←/→ no cambian de registro", async ({ page }) => {
    await ready(page);
    await select(page, "p1", "espera_depreciacion");
    await page.keyboard.type("5");
    // Enter cierra el editor y deja el cursor en el siguiente campo del registro.
    await page.keyboard.press("Enter");
    await expect(cell(page, "p1", "espera_inversion").locator("div").first()).toHaveClass(/ring-primary/);
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, "p2", "espera_inversion").locator("div").first()).not.toHaveClass(/ring-primary/);
    // Pero ↑/↓ (el eje de los campos) siguen funcionando dentro del registro.
    await page.keyboard.press("ArrowDown");
    await expect(cell(page, "p1", "reserva_depreciacion").locator("div").first()).toHaveClass(/ring-primary/);
  });

  test("Supr limpia la celda y F2 abre el editor", async ({ page }) => {
    await ready(page);
    await select(page, "p3", "espera_inversion");
    await page.keyboard.press("Delete");
    await expect(cell(page, "p3", "espera_inversion")).toHaveText("0%");
    await page.keyboard.press("F2");
    await expect(page.locator("td input[type=text]")).toBeVisible();
  });
});

test.describe("alta y baja", () => {
  test("agregar abre una columna nueva en borrador y la guarda", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="add"]').click();
    await expect(recordHeaders(page)).toHaveCount(5);
    await page.keyboard.type("Perfil nuevo");
    await page.keyboard.press("Control+Enter");
    await expect(log(page)).toContainText("add");
    await expect(page.locator('[data-t="count"]')).toHaveText("registros:5");
  });

  test("eliminar pide confirmación y borra el registro seleccionado", async ({ page }) => {
    await ready(page);
    await recordHeaders(page).nth(1).click();
    await page.locator('[data-t="del"]').click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await expect(log(page)).toContainText('delete ["p1"]');
    await expect(recordHeaders(page)).toHaveCount(3);
  });
});

test.describe("búsqueda", () => {
  test("filtra registros, es decir columnas", async ({ page }) => {
    await ready(page);
    await page.getByPlaceholder("Buscar…").fill("Perfil 2");
    await expect(recordHeaders(page)).toHaveCount(1);
    await expect(cell(page, "p2", "nombre")).toBeVisible();
    await page.getByPlaceholder("Buscar…").fill("");
    await expect(recordHeaders(page)).toHaveCount(4);
  });
});

test.describe("portapapeles", () => {
  test("copia el registro como columna: un campo por renglón", async ({ page }) => {
    await ready(page);
    await recordHeaders(page).nth(0).click();
    await page.keyboard.press("Control+c");
    const texto = await page.evaluate(() => navigator.clipboard.readText());
    expect(texto.split("\n")[0]).toBe("Perfil 0");
    expect(texto.split("\n")[1]).toBe("Matutino");
    expect(texto.split("\n").length).toBe(8);
  });

  test("pega una columna de valores hacia abajo desde la celda activa", async ({ page }) => {
    await ready(page);
    await page.evaluate(() => navigator.clipboard.writeText("11\n22"));
    await select(page, "p3", "espera_depreciacion");
    await page.keyboard.press("Control+v");
    await expect(cell(page, "p3", "espera_depreciacion")).toHaveText("11%");
    await expect(cell(page, "p3", "espera_inversion")).toHaveText("22%");
  });
});

test.describe("estados", () => {
  test("sin registros lo dice, y cargando pinta el esqueleto", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="empty"]').check();
    await expect(page.getByText("Sin registros.")).toBeVisible();
    await page.locator('[data-t="loading"]').check();
    await expect(page.locator("td[data-skeleton]").first()).toBeVisible();
    await expect(page.getByText("Sin registros.")).toHaveCount(0);
  });
});
