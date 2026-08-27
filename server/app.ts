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
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  return app;
}

export function createApiApp() {
  return configureApiApp(express());
}
