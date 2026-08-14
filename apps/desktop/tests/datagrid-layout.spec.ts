/**
 * El diseño de columnas que el usuario arma a mano —orden, columnas ocultas,
 * anchos y ordenación— y que el grid recuerda entre sesiones
 * (`useGridLayout` + `gridLayoutStorage`).
 */
import { expect, test, type Page } from "@playwright/test";

/** La clave de `localStorage` sale del `config.title` del banco de pruebas. */
const CLAVE = "obrix-grid-Insumos";

const encabezados = (p: Page) => p.locator("thead th[data-column-id]:not([data-column-id^='__'])");
const celda = (p: Page, fila: number, campo: string) =>
  p.locator(`tbody tr[data-index="${fila}"] td[data-column-id="${campo}"]`);
const menu = (p: Page) => p.locator('thead th[data-column-id="__index"] [data-slot="dropdown-menu-trigger"]');

async function listo(page: Page) {
  await page.goto("/grid-test.html");
  await expect(page.locator("tbody tr[data-index]").first()).toBeVisible();
}

/** Los campos de las columnas de datos, en el orden en que se pintan. */
const orden = (p: Page) =>
  encabezados(p).evaluateAll((els) => els.map((el) => el.getAttribute("data-column-id")));

const guardado = (p: Page, clave = CLAVE) =>
  p.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null"), clave);

/**
 * Arrastra la cabecera `desde` hasta la mitad indicada de la cabecera `hasta`,
 * con el ratón de verdad para pasar por el arrastre nativo del navegador y no
 * por eventos inventados. Hacen falta dos movimientos: el primero arranca el
 * arrastre, el segundo es el que deja el puntero sobre la mitad que decide
 * dónde cae la columna.
 */
async function arrastrarColumna(page: Page, desde: string, hasta: string, mitad: "izq" | "der") {
  const origen = (await page.locator(`th[data-column-id="${desde}"] button`).boundingBox())!;
  const destino = (await page.locator(`th[data-column-id="${hasta}"]`).boundingBox())!;
  const x = destino.x + destino.width * (mitad === "izq" ? 0.2 : 0.8);
  const y = destino.y + destino.height / 2;

  await page.mouse.move(origen.x + origen.width / 2, origen.y + origen.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.up();
}

test.describe("ordenar", () => {
  test("clic en la cabecera ordena y el segundo clic invierte", async ({ page }) => {
    await listo(page);
    const primera = () => celda(page, 0, "cantidad").innerText();
    const boton = page.locator('th[data-column-id="cantidad"] button');

    await boton.click();
    await expect(page.locator('th[data-column-id="cantidad"] svg')).toBeVisible();
    expect(await primera()).toBe("1");

    await boton.click();
    expect(await primera()).toBe("50");
  });

  test("sobrevive a recargar la página", async ({ page }) => {
    await listo(page);
    await page.locator('th[data-column-id="cantidad"] button').click();
    await page.locator('th[data-column-id="cantidad"] button').click();
    expect(await guardado(page)).toMatchObject({ sort: [{ id: "cantidad", desc: true }] });

    await page.reload();
    await expect(page.locator("tbody tr[data-index]").first()).toBeVisible();
    expect(await celda(page, 0, "cantidad").innerText()).toBe("50");
  });
});

test.describe("ancho de columna", () => {
  test("se recuerda tras recargar", async ({ page }) => {
    await listo(page);
    const th = page.locator('th[data-column-id="codigo"]');
    const antes = (await th.boundingBox())!.width;

    const tirador = th.locator("div").last();
    const caja = (await tirador.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 70, caja.y + caja.height / 2, { steps: 6 });
    await page.mouse.up();

    const despues = (await th.boundingBox())!.width;
    expect(despues).toBeGreaterThan(antes + 50);

    // `saveWidths` espera a que la mano se detenga antes de escribir.
    await expect.poll(async () => (await guardado(page))?.widths?.codigo).toBeGreaterThan(antes + 50);

    await page.reload();
    await expect(page.locator("tbody tr[data-index]").first()).toBeVisible();
    expect((await page.locator('th[data-column-id="codigo"]').boundingBox())!.width).toBeCloseTo(despues, 0);
  });
});

test.describe("ocultar columnas", () => {
  test("el menú de la esquina quita una columna y la recuerda", async ({ page }) => {
    await listo(page);
    expect(await orden(page)).toContain("notas");

    await menu(page).click();
    await page.getByRole("menuitemcheckbox", { name: "Notas" }).click();
    await page.keyboard.press("Escape");

    await expect(page.locator('th[data-column-id="notas"]')).toHaveCount(0);
    await expect(celda(page, 0, "notas")).toHaveCount(0);
    expect(await guardado(page)).toMatchObject({ hidden: ["notas"] });

    await page.reload();
    await expect(page.locator("tbody tr[data-index]").first()).toBeVisible();
    await expect(page.locator('th[data-column-id="notas"]')).toHaveCount(0);
  });

  test("las flechas saltan la columna oculta", async ({ page }) => {
    await listo(page);
    await menu(page).click();
    await page.getByRole("menuitemcheckbox", { name: "Unidad" }).click();
    await page.keyboard.press("Escape");

    await celda(page, 1, "familia").click();
    await page.keyboard.press("ArrowRight");
    await expect(celda(page, 1, "cantidad").locator("div").first()).toHaveClass(/ring-primary/);
  });

  test("ocultar la columna del cursor mueve la selección", async ({ page }) => {
    await listo(page);
    await celda(page, 2, "unidad").click();
    await expect(celda(page, 2, "unidad").locator("div").first()).toHaveClass(/ring-primary/);

    await menu(page).click();
    await page.getByRole("menuitemcheckbox", { name: "Unidad" }).click();
    await page.keyboard.press("Escape");

    // La selección no se queda apuntando a algo que ya no está en pantalla.
    await expect(celda(page, 2, "codigo").locator("div").first()).toHaveClass(/ring-primary/);
  });

  test("la búsqueda ignora lo que está oculto", async ({ page }) => {
    await listo(page);
    const buscador = page.getByPlaceholder("Buscar…");
    await buscador.fill("Nota 55");
    await expect(page.locator("tbody tr[data-index]")).toHaveCount(1);

    await buscador.fill("");
    await menu(page).click();
    await page.getByRole("menuitemcheckbox", { name: "Notas" }).click();
    await page.keyboard.press("Escape");

    await buscador.fill("Nota 55");
    await expect(page.locator("tbody td", { hasText: "Sin registros." })).toBeVisible();
  });

  test("no deja ocultar la última columna", async ({ page }) => {
    await listo(page);
    await menu(page).click();
    const items = page.getByRole("menuitemcheckbox");
    const total = await items.count();
    // Se van marcando todas; la única que quede tiene que estar deshabilitada.
    for (let i = 0; i < total; i++) {
      const item = items.nth(i);
      if (!(await item.isDisabled())) await item.click();
    }
    // Solo la que sigue visible queda bloqueada; las ocultas siguen marcables
    // para poder traerlas de vuelta.
    let bloqueadas = 0;
    for (let i = 0; i < total; i++) {
      if (await items.nth(i).isDisabled()) bloqueadas++;
    }
    expect(bloqueadas).toBe(1);
    await page.keyboard.press("Escape");
    expect(await orden(page)).toHaveLength(1);
  });
});

test.describe("reordenar columnas", () => {
  test("arrastrar una cabecera cambia el orden y lo recuerda", async ({ page }) => {
    await listo(page);
    expect((await orden(page)).slice(0, 3)).toEqual(["codigo", "descripcion", "familia"]);

    await arrastrarColumna(page, "familia", "codigo", "izq");

    expect((await orden(page)).slice(0, 3)).toEqual(["familia", "codigo", "descripcion"]);
    expect(await guardado(page)).toMatchObject({ order: expect.arrayContaining(["familia"]) });
    expect((await guardado(page)).order.slice(0, 3)).toEqual(["familia", "codigo", "descripcion"]);

    await page.reload();
    await expect(page.locator("tbody tr[data-index]").first()).toBeVisible();
    expect((await orden(page)).slice(0, 3)).toEqual(["familia", "codigo", "descripcion"]);
  });

  test("las celdas siguen a su cabecera", async ({ page }) => {
    await listo(page);
    const antes = await celda(page, 0, "familia").innerText();
    await arrastrarColumna(page, "familia", "codigo", "izq");

    const primeraCelda = page.locator('tbody tr[data-index="0"] td:not([data-column-id^="__"])').first();
    await expect(primeraCelda).toHaveAttribute("data-column-id", "familia");
    expect(await primeraCelda.innerText()).toBe(antes);
  });
});

test.describe("restablecer", () => {
  test("devuelve el grid a su diseño original y borra lo guardado", async ({ page }) => {
    await listo(page);
    const anchoOriginal = (await page.locator('th[data-column-id="codigo"]').boundingBox())!.width;

    await arrastrarColumna(page, "familia", "codigo", "izq");
    await menu(page).click();
    await page.getByRole("menuitemcheckbox", { name: "Notas" }).click();
    await page.keyboard.press("Escape");
    await page.locator('th[data-column-id="cantidad"] button').click();
    expect(await guardado(page)).not.toBeNull();

    await menu(page).click();
    await page.getByRole("menuitem", { name: "Restablecer diseño" }).click();

    expect(await orden(page)).toEqual([
      "codigo", "descripcion", "familia", "unidad", "cantidad", "precio",
      "merma", "activo", "calidad", "notas", "created_at", "created_by",
    ]);
    await expect(page.locator('th[data-column-id="cantidad"] svg')).toHaveCount(0);
    expect((await page.locator('th[data-column-id="codigo"]').boundingBox())!.width).toBeCloseTo(anchoOriginal, 0);
    expect(await guardado(page)).toBeNull();
  });
});

/**
 * Con una columna ordenada, editarla movía la fila en cuanto cambiaba el valor
 * y el registro se perdía de vista. El orden se congela mientras hay borrador.
 */
test.describe("editar con una columna ordenada", () => {
  const zzz = (p: Page) =>
    p.locator('tbody td[data-column-id="codigo"]').filter({ hasText: "ZZZ-9999" });
  const filaDe = (celda: ReturnType<typeof zzz>) => celda.locator("xpath=..");
  const scroll = (p: Page) => p.locator("table").locator("xpath=..").evaluate((e) => e.scrollTop);

  /** Ordena por código y reescribe el de la primera fila, que pasa a ser el último. */
  async function editarPrimera(page: Page) {
    await listo(page);
    await page.locator('th[data-column-id="codigo"] button').click();
    await expect(celda(page, 0, "codigo")).toHaveText("INS-0000");

    await celda(page, 0, "codigo").click();
    await page.keyboard.press("F2");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("ZZZ-9999");
    await page.keyboard.press("Enter");
  }

  test("la fila no se mueve mientras está en borrador", async ({ page }) => {
    await editarPrimera(page);
    await expect(filaDe(zzz(page))).toHaveAttribute("data-index", "0");
    await expect(zzz(page)).toBeVisible();
    expect(await scroll(page)).toBe(0);
  });

  test("al aceptar toma su lugar, y el grid la sigue", async ({ page }) => {
    await editarPrimera(page);
    await page.keyboard.press("Control+Enter");

    await expect(filaDe(zzz(page))).toHaveAttribute("data-index", "499");
    // Lo que evita la sensación de registro perdido: sigue en pantalla.
    await expect(zzz(page)).toBeInViewport();
  });

  test("cancelar la deja donde estaba", async ({ page }) => {
    await editarPrimera(page);
    await page.keyboard.press("Escape");

    await expect(celda(page, 0, "codigo")).toHaveText("INS-0000");
    expect(await scroll(page)).toBe(0);
  });

  test("una fila nueva se queda al final mientras se llena", async ({ page }) => {
    await listo(page);
    await page.locator('th[data-column-id="codigo"] button').click();
    await page.locator('[data-t="add"]').click();

    const borrador = page
      .locator("tbody tr[data-index]")
      .filter({ has: page.locator('td[data-column-id="__actions"] button') });
    await expect(borrador).toHaveAttribute("data-index", "500");

    // "AAA" ordenaría la primera: no se mueve hasta que se acepta.
    await page.keyboard.type("AAA-0001");
    await page.keyboard.press("Enter");
    await expect(borrador).toHaveAttribute("data-index", "500");

    await page.keyboard.press("Control+Enter");
    const nueva = page.locator('tbody td[data-column-id="codigo"]').filter({ hasText: "AAA-0001" });
    await expect(filaDe(nueva)).toHaveAttribute("data-index", "0");
    await expect(nueva).toBeInViewport();
  });
});
