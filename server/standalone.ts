import dotenv from "dotenv";
import { createApiApp } from "./app";

// 本機獨立開發時僅讀取未提交的 .env.local；Vercel 則由平台注入環境變數。
dotenv.config({ path: ".env.local" });

const port = Number(process.env.TUTOR_API_PORT ?? 3001);
const app = createApiApp();

app.listen(port, "127.0.0.1", () => {
  console.log(`Portable tutor API running at http://127.0.0.1:${port}`);
});
