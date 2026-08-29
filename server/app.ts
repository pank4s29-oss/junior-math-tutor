import express, { type Express } from "express";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";

/** 可同時供本機開發伺服器與 Vercel Function 使用的 API 應用程式。 */
export function configureApiApp(app: Express) {
  app.disable("x-powered-by");
  // 題目照片在瀏覽器先壓縮為不超過 3MB 的 JPEG；保留額度供 JSON 與 tRPC metadata。
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ limit: "4mb", extended: true }));
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  const staticDir = path.resolve(process.cwd(), "public");
  app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    // SPA fallback 只服務 HTML 導覽；資產路徑若不存在必須維持 404，避免瀏覽器把 index.html 當成 JS/CSS 載入而白屏。
    if (req.path.includes(".") || !req.accepts("html")) {
      res.status(404).type("text").send("Not found");
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });

  return app;
}

export function createApiApp() {
  return configureApiApp(express());
}
