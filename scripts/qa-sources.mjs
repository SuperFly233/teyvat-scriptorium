import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.QA_URL || "http://127.0.0.1:8799";
const output = "artifacts/source-settings";
await mkdir(output, { recursive: true });

async function inspect(name, viewport, theme = "light") {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport });
  await page.addInitScript(({ theme }) => {
    localStorage.setItem(
      "teyvat:settings:v5",
      JSON.stringify({
        theme,
        dataSource: "auto",
        viewMode: "parallel",
        zhSize: 20,
        enSize: 20,
        fontFamily: "serif",
        traveler: "aether",
        languages: ["CHS", "EN"],
        columnWidths: [50, 50],
        guideEnabled: false,
        guideScope: "all",
      }),
    );
    localStorage.setItem("teyvat:catalog-guide:v1", "done");
    localStorage.setItem("teyvat:reader-guide:v1", "done");
  }, { theme });
  await page.goto(`${base}/?chapter=1700`, { waitUntil: "networkidle", timeout: 60000 });
  await page.locator(".settings-button").click();
  const section = page.locator(".source-settings");
  await section.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement;
    const modal = document.querySelector(".modal-panel");
    const section = document.querySelector(".source-settings");
    const cards = [...document.querySelectorAll(".source-strategy-cards button")];
    return {
      viewport: [innerWidth, innerHeight],
      documentOverflow: root.scrollWidth > root.clientWidth,
      modal: modal && { width: modal.getBoundingClientRect().width, height: modal.getBoundingClientRect().height },
      sectionWidth: section?.getBoundingClientRect().width,
      cardHeights: cards.map((card) => Math.round(card.getBoundingClientRect().height)),
      links: [...document.querySelectorAll(".source-links a")].map((link) => link.href),
      attributionVisible: Boolean(document.querySelector(".attribution-notice")),
    };
  });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: false });

  if (name === "desktop") {
    await page.locator(".source-strategy-cards button").nth(2).click();
    await page.waitForFunction(() => {
      const stored = JSON.parse(localStorage.getItem("teyvat:settings:v5") || "{}");
      return stored.dataSource === "honey";
    });
    await page.waitForTimeout(500);
    metrics.selectedSource = await page.locator(".source-strategy-cards button.active strong").textContent();
  }
  await browser.close();
  return metrics;
}

const desktop = await inspect("desktop", { width: 1440, height: 900 });
const mobile = await inspect("mobile-dark", { width: 390, height: 844 }, "dark");
console.log(JSON.stringify({ desktop, mobile }, null, 2));
if (desktop.documentOverflow || mobile.documentOverflow) process.exitCode = 1;
