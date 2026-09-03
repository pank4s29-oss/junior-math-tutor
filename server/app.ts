import express, { type Express } from "express";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { refillPracticeQuestionBank } from "./tutor/practiceQuestionBank";

/** 可同時供本機開發伺服器與 Vercel Function 使用的 API 應用程式。 */
export function configureApiApp(app: Express) {
  app.disable("x-powered-by");
  // 題目照片在瀏覽器先壓縮為不超過 3MB 的 JPEG；保留額度供 JSON 與 tRPC metadata。
  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ limit: "4mb", extended: true }));

  // Vercel Cron（見 vercel.json 的 crons 設定）呼叫的背景補題端點：不經過 tRPC／使用者
  // 登入狀態（cron 觸發時沒有登入的使用者），改用共用密鑰驗證。這條路由與 server.ts
  // 共用同一個 Serverless Function，執行時間上限同樣受 vercel.json 的 maxDuration=60 秒限制，
  // 因此 refillPracticeQuestionBank 內部本身就有時間預算保護，不會被平台強制中斷。
  app.get("/api/cron/refill-practice-bank", async (req, res) => {
    const expectedSecret = process.env.CRON_SECRET?.trim();
    if (!expectedSecret) {
      // 尚未設定密鑰時直接停用端點，避免任何人都能公開觸發這支會呼叫付費 Gemini API 的路徑。
      res.status(503).json({ error: "CRON_SECRET 尚未設定，補題排程端點目前已停用。" });
      return;
    }
    const providedSecret = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (providedSecret !== expectedSecret) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    try {
      const summary = await refillPracticeQuestionBank();
      res.status(200).json({ success: true, summary });
    } catch (error) {
      console.error("Practice question bank cron refill failed", { message: error instanceof Error ? error.message : "unknown error" });
      res.status(500).json({ success: false, error: "補題排程執行失敗，詳見伺服器 log。" });
    }
  });

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
