import { expect, test, type Locator, type Page } from "@playwright/test";

/** Un campo es un renglón; se busca por el `<th>` de su etiqueta. */
const fieldRow = (p: Page, field: string) => p.locator(`tbody tr:has(th[data-field="${field}"])`);
const cell = (p: Page, rowId: string, field: string) =>
  p.locator(`td[data-row-id="${rowId}"][data-field="${field}"]`);
const recordHeaders = (p: Page) => p.locator("thead th[data-row-id]");
/** El cuerpo: la segunda tabla (la primera es la tira del encabezado). */
const scroller = (p: Page) => p.locator("table").nth(1).locator("xpath=..");
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
    for (const titulo of ["Identificación", "Porcentajes", "En espera", "En reserva"]) {
      await expect(page.locator("tbody td", { hasText: new RegExp(`^${titulo}$`) })).toHaveCount(1);
    }
    // Sin `groups` se pintan todos los campos, en el orden de `config.columns`.
    await page.locator('[data-t="grouped"]').uncheck();
    await expect(page.locator("tbody td", { hasText: /^Identificación$/ })).toHaveCount(0);
    await expect(fieldRow(page, "nombre")).toHaveCount(1);
  });

  test("un grupo con el título vacío no pinta renglón de sección", async ({ page }) => {
    await ready(page);
    // El grupo "control" del banco de pruebas va con `title: ""`: sus campos se
    // pintan igual, pero sin encabezado ni renglón de más.
    await expect(fieldRow(page, "activo")).toHaveCount(1);
    await expect(fieldRow(page, "created_at")).toHaveCount(1);
    // Los renglones son: 4 títulos + 8 campos; sin el vacío, no 5 títulos.
    await expect(page.locator("tbody tr")).toHaveCount(12);
    await expect(page.locator("tbody tr:not(:has(th))")).toHaveCount(4);
  });

  test("la columna de etiquetas queda pegada al hacer scroll horizontal", async ({ page }) => {
    // Angosto a propósito: con la ventana entera la tabla cabe y no hay scroll
    // horizontal que probar.
    await page.setViewportSize({ width: 520, height: 800 });
    await ready(page);
    const etiqueta = fieldRow(page, "nombre").locator("th").first();
    const antes = await etiqueta.boundingBox();
    await scroller(page).evaluate((el) => (el.scrollLeft = 300));
    await page.waitForTimeout(100);
    expect(await scroller(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    const despues = await etiqueta.boundingBox();
    expect(Math.abs(despues!.x - antes!.x)).toBeLessThan(2);
  });

  test("los títulos de grupo tampoco se mueven al hacer scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 800 });
    await ready(page);
    const titulos = page.locator("tbody tr:not(:has(th)) span");
    await expect(titulos).toHaveCount(4);
    const antes = await titulos.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)));
    await scroller(page).evaluate((el) => (el.scrollLeft = 300));
    await page.waitForTimeout(100);
    expect(await scroller(page).evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    const despues = await titulos.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)));
    // Se quedan donde estaban (el 1px de tolerancia es el borde de la tabla).
    despues.forEach((x, i) => expect(Math.abs(x - antes[i])).toBeLessThan(2));
  });
});

test.describe("alineación de las dos tablas", () => {
  // El encabezado y el cuerpo son tablas distintas (ver `VerticalGrid`), así
  // que sus columnas tienen que coincidir al píxel — con el reparto automático
  // cada una se estiraba según su contenido y dejaban de cuadrar.
  test("cada columna del encabezado cae sobre la del cuerpo", async ({ page }) => {
    await ready(page);
    const medidas = async () =>
      page.evaluate(() => {
        const geo = (el: Element) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.x), Math.round(r.width)];
        };
        return {
          encabezado: [...document.querySelectorAll("thead th")].map(geo),
          cuerpo: [...document.querySelector("tbody tr:has(th)")!.children].map(geo),
        };
      });
    const { encabezado, cuerpo } = await medidas();
    expect(encabezado.length).toBe(cuerpo.length);
    expect(encabezado).toEqual(cuerpo);

    // Y siguen cuadrando después de ajustar el ancho de un registro a mano.
    await page.locator("thead th[data-row-id]").first().hover({ position: { x: 148, y: 10 } });
    await page.mouse.down();
    await page.mouse.move(400, 100, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(120);
    const despues = await medidas();
    expect(despues.encabezado).toEqual(despues.cuerpo);
    expect(despues.encabezado[1][1]).toBeGreaterThan(encabezado[1][1]);
  });
});

test.describe("celdas pegadas opacas", () => {
  /** Recorta una banda de la pantalla y la devuelve como texto comparable. */
  const banda = async (page: Page, clip: { x: number; y: number; width: number; height: number }) =>
    (await page.screenshot({ clip })).toString("base64");

  // Se compara entre posiciones ya desplazadas y no contra el grid en reposo:
  // al quedar pegada, la celda se rasteriza con otro desfase de subpíxel y el
  // texto cambia de antialias sin que nada se transparente.
  // El encabezado vive fuera del área que se desplaza (ver el `<table>` del
  // encabezado en `VerticalGrid`), así que ningún renglón pasa por debajo: su
  // franja completa —bordes incluidos— tiene que verse idéntica a cualquier
  // altura de scroll, sin costuras de subpíxel.
  test("el encabezado se ve igual sin importar el scroll vertical", async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 300 });
    await ready(page);
    const tira = (await page.locator("thead").locator("xpath=../..").boundingBox())!;
    // Justo la tira, sin el primer píxel del cuerpo, que sí cambia al desplazarse.
    const clip = { x: tira.x, y: tira.y, width: 420, height: Math.floor(tira.height) };
    await scroller(page).evaluate((el) => (el.scrollTop = 44));
    await page.waitForTimeout(120);
    const quieto = await banda(page, clip);
    for (const top of [47, 50, 61, 3]) {
      await scroller(page).evaluate((el, t) => (el.scrollTop = t), top);
      await page.waitForTimeout(120);
      expect(await banda(page, clip), `con scrollTop=${top}`).toBe(quieto);
    }
  });

  test("la columna de etiquetas se ve igual sin importar el scroll horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 520, height: 600 });
    await ready(page);
    const caja = (await scroller(page).boundingBox())!;
    const ancho = await fieldRow(page, "nombre")
      .locator("th")
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    const clip = { x: caja.x, y: caja.y, width: Math.round(ancho), height: 200 };
    await scroller(page).evaluate((el) => (el.scrollLeft = 40));
    await page.waitForTimeout(120);
    const pegada = await banda(page, clip);
    for (const left of [120, 217, 300]) {
      await scroller(page).evaluate((el, l) => (el.scrollLeft = l), left);
      await page.waitForTimeout(120);
      expect(await banda(page, clip), `con scrollLeft=${left}`).toBe(pegada);
    }
  });
});

test.describe("alto del encabezado", () => {
  const altoEncabezado = (p: Page) => recordHeaders(p).first().evaluate((el) => Math.round(el.getBoundingClientRect().height));

  test("sin `recordHeaderHeight` el alto lo da el contenido, y no brinca al editar", async ({ page }) => {
    await ready(page);
    const antes = await altoEncabezado(page);
    await select(page, "p1", "nombre");
    await page.keyboard.type("X");
    await page.keyboard.press("Enter");
    // Los ✓/✗ tienen su lugar reservado desde el principio: entrar en borrador
    // no mueve el encabezado ni un pixel.
    expect(await altoEncabezado(page)).toBe(antes);
  });

  test("con `recordHeaderHeight` todos miden lo pedido, también en borrador", async ({ page }) => {
    await ready(page);
    await page.locator('[data-t="alto"]').check();
    const altos = await recordHeaders(page).evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    // 48 del contenido + 1px de borde + 8px del `py-1` de la celda.
    expect(new Set(altos).size).toBe(1);
    expect(altos[0]).toBeGreaterThanOrEqual(48);
    expect(altos[0]).toBeLessThan(64);

    await select(page, "p1", "nombre");
    await page.keyboard.type("X");
    await page.keyboard.press("Enter");
    expect(await altoEncabezado(page)).toBe(altos[0]);
    // Y los botones del borrador siguen completos, no recortados.
    const boton = recordHeaders(page).nth(1).getByTitle("Confirmar (Ctrl+Enter)");
    await expect(boton).toBeVisible();
    expect((await boton.boundingBox())!.height).toBeGreaterThanOrEqual(16);
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
