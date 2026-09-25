import { expect, test, type Page } from "@playwright/test";
import { SMOKE_SCREENS } from "../src/smoke/screen-names";

/**
 * Layout smoke: jsdom has no layout engine, so horizontal overflow (the
 * 2026-09-24 class of bugs — nav spill, unstyled rows, unshrinkable inputs)
 * can only be caught in a real browser. Fails when the document scrolls
 * sideways or any element paints past the viewport edge.
 */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const wide = [...document.querySelectorAll("main *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.right > window.innerWidth + 1 || r.left < -1)
      .slice(0, 10)
      .map(
        ({ el, r }) =>
          `${el.tagName.toLowerCase()}.${String(el.className || "").split(" ")[0]}` +
          ` @${Math.round(r.left)}..${Math.round(r.right)}`,
      );
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide };
  });
}

for (const screen of SMOKE_SCREENS) {
  test(`${screen}: no horizontal overflow`, async ({ page }) => {
    await page.goto(`/smoke.html?screen=${screen}`);
    await page.waitForSelector("body[data-smoke-ready='1']");
    const report = await overflowReport(page);
    // The wide list names the culprits — assert it first so failures diagnose.
    expect(report.wide, "elements painted past the viewport").toEqual([]);
    expect(
      report.scrollWidth,
      `document scrolls sideways: ${report.scrollWidth} > ${report.clientWidth}`,
    ).toBeLessThanOrEqual(report.clientWidth);
  });
}

// The smoke fixture has no real Firestore connection: verify the history error
// is honest and the submitted user message remains within the viewport.
test("coach: history error and submitted message stay inside the viewport", async ({ page }) => {
  await page.goto(`/smoke.html?screen=coach`);
  await page.waitForSelector("body[data-smoke-ready='1']");
  await page
    .getByRole("textbox", { name: "Ask the coach" })
    .fill("How many workouts did I complete this month?");
  await page.getByRole("button", { name: "SEND" }).click();
  await expect(page.getByText("Could not load your workout history. Check your connection and retry.")).toBeVisible();
  await expect(
    page.getByRole("log", { name: "Conversation" }).getByText("How many workouts did I complete this month?"),
  ).toBeVisible();
  const report = await overflowReport(page);
  expect(report.wide, "elements painted past the viewport").toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.clientWidth);
});

test("signed-out home keeps the training-sheet landing inside the viewport", async ({ page }) => {
  await page.goto("/");
  const landing = page.getByRole("region", { name: "Sign in" });
  await expect(landing).toBeVisible();
  await expect(landing.getByRole("heading", { name: "A steadier way to get stronger." })).toBeVisible();
  await expect(landing.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(page.getByRole("complementary", { name: "Today's workout preview" })).toBeVisible();

  const layout = await page.evaluate(() => {
    const headline = document.querySelector<HTMLElement>(".landingHeadline");
    const sheet = document.querySelector<HTMLElement>(".trainingSheet");
    if (!headline || !sheet) throw new Error("Landing content did not render");
    const headlineRect = headline.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const root = document.documentElement;
    return {
      viewportWidth: window.innerWidth,
      documentWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      headlineRight: headlineRect.right,
      sheetLeft: sheetRect.left,
      sheetRight: sheetRect.right,
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.headlineRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.sheetLeft).toBeGreaterThanOrEqual(-1);
  expect(layout.sheetRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
});
