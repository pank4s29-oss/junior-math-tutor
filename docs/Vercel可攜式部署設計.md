# Vercel 可攜式部署設計

## 目標架構

本專案以 **Supabase** 作為資料庫與私有題目照片儲存來源，以 **GitHub** 保存版本化程式碼，並將 React 前端與 Express/tRPC API 以 Vercel Node.js Runtime 發布。AI 解題改用品牌自有的模型供應商金鑰，不能依賴目前受管環境的內建模型服務。

## Vercel 相容性重點

Vercel 可以把 Express 應用程式轉為單一 Vercel Function；Express 應用需要從 Vercel 可偵測的入口檔匯出預設 app，或以其規範的 Node.js server 入口提供服務。靜態內容應由 Vercel CDN 提供，不能依賴 `express.static()`。[1]

Vercel 專案會依 `pnpm-lock.yaml` 偵測並執行 pnpm 安裝；環境變數應在 Project Settings 分別設定 Production、Preview 與 Development。變數會加密保存，但所有專案可存取成員都能檢視，因此只能設定伺服器端機密，不能提交到 GitHub。[2]

| 類別 | 可攜式做法 | 不可攜式依賴處理 |
|---|---|---|
| 資料與附件 | Supabase PostgreSQL、Storage、服務端 Secret key | 已完成核心學習資料與教師資料的 Supabase 切換。 |
| 登入 | Supabase Auth 或其他自有 OAuth 供應商 | 目前受管 OAuth callback 需替換，不能在 Vercel 沿用。 |
| AI 解題 | Anthropic 或 OpenAI 的伺服器端 API Key | 受管內建模型金鑰不可帶離或放到 Vercel。 |
| 教師通知 | Resend、Postmark、Slack 或 LINE API | 目前受管通知服務需替換。 |
| 網頁與 API | Vercel Node.js Function + CDN 靜態資產 | 需建立不呼叫受管 SDK 的入口與部署設定。 |

## 必要環境變數（Vercel 端）

| 名稱 | 用途 | 可公開 |
|---|---|---|
| `SUPABASE_URL` | Supabase 專案網址 | 是，僅作為端點資訊。 |
| `SUPABASE_SECRET_KEY` | 伺服器端資料與私有 Storage 操作 | 否。 |
| `SUPABASE_DB_URL` | 僅供需要直連 PostgreSQL 的安全身分橋接 | 否。 |
| `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` | 品牌託管 AI 解題呼叫 | 否。 |
| `AUTH_SECRET`、OAuth Client ID/Secret | 自有登入與 session 簽發 | 否。 |
| `NOTIFICATION_*` | 教師協助案件通知服務 | 否。 |

## GitHub 與 Vercel 發布順序

先將本專案的完整程式碼與 `vercel.json`、`.env.example`、Supabase 遷移 SQL 一併推送到 GitHub 的 `main` 分支；接著在 Vercel 匯入該 repository、設定環境變數、建立 Preview 部署與資料流程驗證，最後才將 `main` 設為 Production Branch。正式網域切換應在登入、AI、題目上傳、教師工作台、案件狀態更新都通過 Preview 驗收後進行。

## 參考資料

[1]: https://vercel.com/docs/frameworks/backend/express "Express on Vercel"
[2]: https://vercel.com/docs/environment-variables "Vercel Environment Variables"
