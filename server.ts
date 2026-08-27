import { createApiApp } from "./server/app";

// Vercel Node/Express 偵測所需的根入口。靜態 Vite 產物仍由
// vercel.json 的 outputDirectory 與 CDN 處理；此 app 僅提供 /api/trpc。
export default createApiApp();
