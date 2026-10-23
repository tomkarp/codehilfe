const { test, expect } = require("@playwright/test");

async function placeBlock(page, field, value) {
	const cards = page.locator(".ch-luecken-karten .ch-luecken-karte");
	const cardIndex = await cards.evaluateAll((elements, wanted) =>
		elements.findIndex((element) => element._wert === wanted), value);
	expect(cardIndex, `Baustein ${value} sollte verfügbar sein`).toBeGreaterThanOrEqual(0);
	await cards.nth(cardIndex).click();
	await field.click();
}

async function setGetterRows(page, valuesBySourceRow) {
	const sourceRows = await page.locator(".ch-block").evaluateAll((blocks) =>
		blocks.map((block) => block._block.schluessel.trim()));
	for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex++) {
		const values = valuesBySourceRow[sourceRows[rowIndex]];
		const fields = page.locator(".ch-block").nth(rowIndex).locator(".ch-lueckenfeld");
		for (let fieldIndex = 0; fieldIndex < values.length; fieldIndex++) {
			await placeBlock(page, fields.nth(fieldIndex), values[fieldIndex]);
		}
	}
}

async function moveRowsToOrder(page, desiredOrder) {
	for (let targetIndex = 0; targetIndex < desiredOrder.length; targetIndex++) {
		const currentIndex = await page.locator(".ch-block").evaluateAll((blocks, args) => {
			const [start, wanted] = args;
			return blocks.findIndex((block, index) =>
				index >= start && block._block.schluessel.trim() === wanted);
		}, [targetIndex, desiredOrder[targetIndex]]);
		expect(currentIndex, `Zeile ${desiredOrder[targetIndex]} sollte vorhanden sein`).toBeGreaterThanOrEqual(targetIndex);
		for (let index = currentIndex; index > targetIndex; index--) {
			await page.locator(".ch-block").nth(index).locator("button.ch-hoch").click();
		}
	}
}

test.describe("Getter-Aufgabe: Zeilen und Bausteine innerhalb der Gruppe tauschen", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/tests/fixtures/getter.html");
	});

	test("akzeptiert vertauschte x/y- und width/height-Bausteine in umsortierten Zeilen", async ({ page }) => {
		await moveRowsToOrder(page, [
			"y > 40",
			"x < world.width - 40",
			"x > 40",
			"y < world.height - 40"
		]);
		await setGetterRows(page, {
			"x > 40": ["y"],
			"y > 40": ["x"],
			"x < world.width - 40": ["y", "world.", "height"],
			"y < world.height - 40": ["x", "world.", "width"]
		});

		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Alles richtig");
		await expect(page.locator(".ch-lueckenfeld.ch-ok")).toHaveCount(8);
		await expect(page.locator(".ch-block.ch-richtig")).toHaveCount(4);
	});

	test("weist eine falsche Zuordnung von Weltbreite und Welthöhe zurück", async ({ page }) => {
		await setGetterRows(page, {
			"x > 40": ["x"],
			"y > 40": ["y"],
			"x < world.width - 40": ["x", "world.", "height"],
			"y < world.height - 40": ["y", "world.", "width"]
		});
		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Noch nicht alles richtig");
		/* Bei einer falschen Zeile markiert CodeHilfe alle drei zugehörigen
		 * Bausteine; zwei fehlerhafte Zeilen ergeben daher sechs Markierungen. */
		await expect(page.locator(".ch-lueckenfeld.ch-fehler")).toHaveCount(6);
	});
});

test.describe("Mehrfach vorkommende Zeilen in benannten Gruppen", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/tests/fixtures/duplicate-lines.html");
	});

	test("akzeptiert die richtige Anzahl identischer Zeilen pro Gruppe", async ({ page }) => {
		await moveRowsToOrder(page, [
			"println(tier1.name)",
			"println(tier2.name)",
			"println(tier1.energie)",
			"println(tier2.energie)",
			"println(tier1.energie)",
			"println(tier2.energie)"
		]);
		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Alles richtig");
		await expect(page.locator(".ch-block.ch-richtig")).toHaveCount(6);
	});

	test("weist doppelte tier1-Ausgabe in der vorher-Gruppe zurück", async ({ page }) => {
		await moveRowsToOrder(page, [
			"println(tier1.name)",
			"println(tier2.name)",
			"println(tier1.energie)",
			"println(tier1.energie)",
			"println(tier2.energie)",
			"println(tier2.energie)"
		]);
		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Noch nicht alles richtig");
		await expect(page.locator(".ch-block.ch-falsch")).toHaveCount(2);
	});
});

test.describe("Lokale Zeilengruppen", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/tests/fixtures/local-group.html");
	});

	test("akzeptiert das Vertauschen direkt aufeinanderfolgender Gruppenzeilen", async ({ page }) => {
		await moveRowsToOrder(page, [
			"println(\"B\")",
			"println(\"A\")",
			"println(\"C\")"
		]);
		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Alles richtig");
		await expect(page.locator(".ch-block.ch-richtig")).toHaveCount(3);
	});

	test("hält eine nicht gruppierte Zeile außerhalb der austauschbaren Gruppe", async ({ page }) => {
		await moveRowsToOrder(page, [
			"println(\"C\")",
			"println(\"A\")",
			"println(\"B\")"
		]);
		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Noch nicht alles richtig");
	});
});

test.describe("Eingetippte Lücken", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/tests/fixtures/typed-gap.html");
	});

	test("akzeptiert eine alternative richtige Antwort", async ({ page }) => {
		await page.locator(".ch-luecke").fill("43");
		await page.getByRole("button", { name: "Überprüfen" }).click();

		await expect(page.locator(".ch-meldung")).toContainText("Alles richtig");
		await expect(page.locator(".ch-lueckenfeld.ch-ok")).toHaveCount(1);
	});

	test("weist eine falsche Antwort zurück und prüft eine Korrektur erneut", async ({ page }) => {
		const input = page.locator(".ch-luecke");
		const check = page.getByRole("button", { name: "Überprüfen" });

		await input.fill("24");
		await check.click();
		await expect(page.locator(".ch-meldung")).toContainText("Noch nicht alles richtig");
		await expect(page.locator(".ch-lueckenfeld.ch-fehler")).toHaveCount(1);

		await input.fill("42");
		await expect(page.locator(".ch-meldung")).toBeEmpty();
		await check.click();
		await expect(page.locator(".ch-meldung")).toContainText("Alles richtig");
	});
});
