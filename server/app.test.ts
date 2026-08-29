import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApiApp } from "./app";

let server: ReturnType<typeof createServer> | undefined;

afterEach(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

describe("Vercel 相容 tRPC API 應用程式", () => {
  it("在不載入 OAuth 或儲存代理的情況下提供公開健康檢查", async () => {
    server = createServer(createApiApp());
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("無法取得測試 API 連接埠。");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/trpc/system.health?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22timestamp%22%3A1%7D%7D%7D`);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual([{ result: { data: { json: { ok: true } } } }]);
  });

  it("將非 API 深層連結回退到 Vite 首頁，但不遮蔽 API 路徑", async () => {
    server = createServer(createApiApp());
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("無法取得測試 API 連接埠。");

    const home = await fetch(`http://127.0.0.1:${address.port}/review`);
    const missingApi = await fetch(`http://127.0.0.1:${address.port}/api/not-a-route`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("國中數學解題教練");
    expect(missingApi.status).toBe(404);
    const missingAsset = await fetch(`http://127.0.0.1:${address.port}/assets/missing-bundle.js`);
    expect(missingAsset.status).toBe(404);
    expect(missingAsset.headers.get("content-type")).toContain("text/plain");
    expect(await missingAsset.text()).not.toContain("國中數學解題教練");
  });
});
