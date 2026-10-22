import { test, expect } from "@playwright/test";
test("CINDER opens from the library, plays Run, edits glow and restores the previous scene", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.forge);
  const original = await page.evaluate(() => window.forge.getDocument().name);
  await page.locator("#cinder-demo").click();
  await expect
    .poll(() => page.evaluate(() => window.forge.getView().activeClip))
    .toBe("run");
  expect(await page.evaluate(() => window.forge.getView().playing)).toBe(true);
  await page.locator("#play").click();
  const start = await page.evaluate(() => {
    window.forge.seek(0);
    return window.forge.getPose("left-shin");
  });
  const other = await page.evaluate(() => {
    window.forge.seek(0.22);
    return window.forge.getPose("left-shin");
  });
  expect(other.rotation).not.toEqual(start.rotation);
  await page.evaluate(() => {
    window.forge.seek(0.88);
  });
  expect(await page.evaluate(() => window.forge.getPose("left-shin"))).toEqual(
    start,
  );
  await page.evaluate(() => window.forge.select("eye--1"));
  await expect(page.getByLabel("Цвет свечения", { exact: true })).toHaveValue(
    "#ffd36b",
  );
  await page.locator("#emissiveIntensity").fill("5");
  await page.locator("#emissiveIntensity").dispatchEvent("change");
  expect(
    await page.evaluate(
      () =>
        window.forge.getDocument().nodes.find((n) => n.id === "eye--1")
          .emissiveIntensity,
    ),
  ).toBe(5);
  await page.locator("#undo").click();
  await page.locator("#undo").click();
  expect(await page.evaluate(() => window.forge.getDocument().name)).toBe(
    original,
  );
  expect(errors).toEqual([]);
});
