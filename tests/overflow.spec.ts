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

// Chat bubbles only exist mid-conversation — ask (no model call: the
// deterministic insufficient-history path answers) and check with real bubbles.
test("coach: chat bubbles stay inside the viewport", async ({ page }) => {
  await page.goto(`/smoke.html?screen=coach`);
  await page.waitForSelector("body[data-smoke-ready='1']");
  await page
    .getByRole("textbox", { name: "Ask the coach" })
    .fill("How many workouts did I complete this month?");
  await page.getByRole("button", { name: "SEND" }).click();
  // apostrophe-agnostic: the code's copy uses a straight apostrophe
  await page.getByText(/enough workout history yet/).waitFor();
  const report = await overflowReport(page);
  expect(report.wide, "elements painted past the viewport").toEqual([]);
  expect(report.scrollWidth).toBeLessThanOrEqual(report.clientWidth);
});
