import { chromium } from "playwright";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
await mkdir("artifacts/journey-navigation", { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://local").pathname;
    if (pathname.startsWith("/api/quest/")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(await readFile("public/data/quest-1700.json"));
      return;
    }
    if (pathname === "/api/catalog") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(await readFile("public/data/catalog.json"));
      return;
    }
    const requested = pathname === "/" ? "index.html" : pathname.slice(1);
    const path = join("dist", requested);
    const body = await readFile(path).catch(() => readFile("dist/index.html"));
    response.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.setItem("teyvat:settings:v5", JSON.stringify({ guideReader: false, guideCatalog: false, guideScenes: false, dataSource: "yatta" }));
  sessionStorage.setItem("teyvat:catalog:view", JSON.stringify("journey"));
  sessionStorage.setItem("teyvat:journey:mode", JSON.stringify("nation"));
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });

const nodKrai = page.locator(".timeline-node").filter({ hasText: "挪德卡莱" });
const archonTitles = await nodKrai.locator(".timeline-task-group.type-aq button strong").allTextContents();
const order = ["归途", "雪浪与苍林之舞", "尘与灯的挽歌"];
const orderIndexes = order.map((title) => archonTitles.indexOf(title));

const rail = page.locator(".timeline-scroll");
await rail.evaluate((node) => {
  node.scrollLeft = (node.scrollWidth - node.clientWidth) * 0.58;
  node.dispatchEvent(new Event("scroll"));
});
await page.waitForTimeout(120);
const positionBefore = JSON.parse(await page.evaluate(() => sessionStorage.getItem("teyvat:journey:position")));
const latestBefore = await page.locator(".timeline-latest").count();
await page.locator(".timeline-latest").click();
await page.waitForTimeout(650);
const latestAtEnd = await page.locator(".timeline-latest").count();
await rail.evaluate((node) => {
  node.scrollLeft = Math.max(0, node.scrollWidth - node.clientWidth - 900);
  node.dispatchEvent(new Event("scroll"));
});
await page.waitForTimeout(120);
const latestReturned = await page.locator(".timeline-latest").count();
const latestAnimations = latestReturned ? await page.locator(".timeline-latest").evaluate((node) => node.getAnimations().length) : 0;
await page.screenshot({ path: "artifacts/journey-navigation/timeline.png", fullPage: false });

await nodKrai.locator(".timeline-task-group.type-aq button").first().click();
await page.waitForSelector(".reader-page");
await page.locator(".header-nav button").first().click();
await page.waitForSelector(".journey-timeline");
const catalogAfterDirectory = !new URL(page.url()).searchParams.has("chapter");
const restoredPosition = JSON.parse(await page.evaluate(() => sessionStorage.getItem("teyvat:journey:position")));

await page.locator(".timeline-task-group.type-aq button").first().click();
await page.waitForSelector(".reader-page");
await page.locator(".header-nav button").nth(1).click();
await page.waitForSelector(".changelog");
const catalogBehindChangelog = !new URL(page.url()).searchParams.has("chapter") && (await page.locator(".journey-timeline").count()) === 1;
await page.locator(".modal > header button").click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(120);
await page.screenshot({ path: "artifacts/journey-navigation/mobile.png", fullPage: false });

const result = {
  orderIndexes,
  preludeFirst: orderIndexes[0] >= 0 && orderIndexes[0] < orderIndexes[1] && orderIndexes[1] < orderIndexes[2],
  positionBefore,
  latestBefore,
  latestAtEnd,
  latestReturned,
  latestAnimations,
  catalogAfterDirectory,
  restoredPosition,
  catalogBehindChangelog,
  mobileControlsVisible: await page.locator(".timeline-controls").isVisible(),
  noHorizontalPageOverflow: await page.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth),
};
console.log(JSON.stringify(result, null, 2));
if (!result.preludeFirst || latestAtEnd || !latestReturned || !catalogAfterDirectory || !catalogBehindChangelog) process.exitCode = 1;
await browser.close();
server.close();
