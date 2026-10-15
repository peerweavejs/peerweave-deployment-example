import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import config from "../../apps/web/vite.config.js";
import { createSignalingServer } from "./backend-fixture.js";

export async function withExample(path: string, test: (a: Page, b: Page) => Promise<void>) {
  const relay = await createSignalingServer({ port: 0 });
  const vite = await createServer({
    ...config,
    configFile: false,
    root: new URL("../../apps/web", import.meta.url).pathname,
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": relay.url.replace(/\/signaling$/, "").replace(/^ws/, "http"),
        "/signaling": { target: relay.url.replace(/\/signaling$/, ""), ws: true },
      },
    },
  });
  await vite.listen();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const a = await browser.newPage();
    const b = await browser.newPage();
    const url = vite.resolvedUrls?.local[0];
    if (!url) throw new Error("No example URL");
    const errors: string[] = [];
    for (const page of [a, b]) page.on("pageerror", (error) => errors.push(error.message));
    await Promise.all([a.goto(new URL(path, url).href), b.goto(new URL(path, url).href)]);
    await test(a, b);
    if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  } finally {
    await browser.close();
    await vite.close();
    await relay.close();
  }
}
