# 國中數學解題教練：Vercel 與 Supabase 正式發布指南

本專案的正式架構為 **GitHub 保存程式碼、Vercel 提供 React SPA 與 Node.js API、Supabase 管理 Auth／PostgreSQL／私有題目照片、Gemini 提供伺服器端 AI 解題與手寫辨識**。Gemini 與 Supabase Secret key 僅可存在 Vercel 的伺服器端環境變數，絕不可放入任何 `VITE_` 變數、前端程式或 Git repository。

Gemini 服務使用官方 `@google/genai` SDK 與帳戶目前可用的 `gemini-3.6-flash`，以 `responseMimeType: "application/json"` 搭配 JSON schema 固定回覆欄位；題目照片會在完成 Supabase 擁有權檢查後，從 private bucket 讀為 base64 inline image，再由伺服器傳送至模型。Gemini 官方文件支援以 JSON schema 取得可預測的結構化輸出，以及以 inline data 處理圖片。[4] [5]

| 區域 | 元件 | 用途 | 是否可公開 |
|---|---|---|---|
| 前端 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` | Magic Link 登入與取得使用者 session | 是，Supabase 設計為瀏覽器端使用 |
| Vercel API | `SUPABASE_SECRET_KEY` | 後端資料、私有 Storage、profile 角色查詢 | 否 |
| Vercel API | `GEMINI_API_KEY` | Gemini 3.6 Flash 的文字解題與圖片辨識 | 否 |
| 僅維運 | `SUPABASE_DB_URL` | 執行 SQL migration 的管理連線，不是網站 runtime 必需 | 否 |

## 1. Supabase 設定

先在 Supabase SQL Editor 依序套用 `supabase/migrations/20260827_03_supabase_auth_native_identity.sql`、`20260827_04_auth_profile_bootstrap.sql` 與 `20260827_05_auth_app_user_bootstrap.sql`；前者讓新帳號可以只依 `auth.users` UUID 建立 `app_users`，同時保留早期資料的相容欄位，後兩者讓每一個 Auth 帳號建立時原子化產生最低權限 `student` 的 `profiles` 與 `app_users`。接著在 **Authentication → Providers → Email** 啟用 Email provider，並在 **Authentication → URL Configuration** 將 Site URL 設為正式 Vercel 網域。額外 Redirect URLs 至少應包含 `http://localhost:3000/**` 與 `https://*-<你的 Vercel 帳號或團隊 slug>.vercel.app/**`；正式環境另加精確的正式網域。Supabase 對 `redirectTo` 僅接受允許清單中的網址，並建議正式環境使用精確網址。[1]

登入後，將教師的 `profiles.role` 更新為 `teacher` 或 `admin`；伺服器會先驗證 Supabase access token，再以 server-only key 讀取此欄位。這表示瀏覽器傳來的 user metadata 無法自行提升教師權限。

## 2. GitHub 與 Vercel 建立專案

將本 repository 的 `main` 分支推送到你的 GitHub repository 後，在 Vercel 選擇 **Add New → Project → Import Git Repository** 並匯入 `junior-math-tutor`。建置命令為 `pnpm build:client`，Vite 會輸出至根目錄的 `public/`，由 Vercel CDN 提供；`server.ts` 是 Vercel Node/Express 入口，處理 `/api/trpc/*`，而 `vercel.json` 只將非 API 深層網址回退至 `index.html`，使 `/review` 與 `/teacher` 可用。這符合 Vercel 對 Express 專案以 default export 供應 API、根目錄 `public/**` 供應靜態檔案的模式。[2]

| Vercel Environment Variable | Development | Preview | Production | 說明 |
|---|---:|---:|---:|---|
| `VITE_SUPABASE_URL` | 是 | 是 | 是 | Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 是 | 是 | 是 | Supabase Publishable（或 legacy anon）key |
| `SUPABASE_URL` | 是 | 是 | 是 | 伺服器端 Supabase URL |
| `SUPABASE_SECRET_KEY` | 是 | 是 | 是 | 僅 server-side 的 Supabase Secret key |
| `GEMINI_API_KEY` | 是 | 是 | 是 | 僅 server-side Gemini API key |

建議先建立 Preview deployment 並以實際學生帳號驗證 Magic Link、文字解題、手寫照片、錯題本、教師工作台與資料隔離；確認後才將 `main` 發布為 Production。Vercel Function 每次請求或回應的 payload 上限為 4.5MB，因此前端會在送出前將圖片縮放與 JPEG 壓縮至約 3MB；不要移除此防護。[3]

## 3. 教師案件通知與後續選項

目前「回報答案問題」與「請教師協助」會可靠寫入 Supabase `teacher_escalations`，並立即出現在教師工作台；**尚未設定第三方推播**，因此 `notification_delivered` 會是 `false`。若需要即時通知，可在確認偏好的供應商後整合 Resend、Slack Incoming Webhook 或 LINE Messaging API；該服務的 secret 必須只填入 Vercel 的 server-only environment variables。

## 4. 發布前安全檢查

確認 `.env*` 沒有進入 Git、前端 bundle 沒有 `SUPABASE_SECRET_KEY` 或 `GEMINI_API_KEY`、Supabase bucket `math-problems` 維持 private、教師角色僅由 `profiles.role` 管理、並執行 `pnpm test && pnpm check && pnpm build:client`。不要在聊天、issue、commit message 或截圖中貼出資料庫連線字串、Secret key 或 Gemini key。

## References

[1] [Supabase, Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

[2] [Vercel, Express on Vercel](https://vercel.com/docs/frameworks/backend/express)

[3] [Vercel, Functions Limits](https://vercel.com/docs/functions/limitations)

[4] [Google AI for Developers, Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

[5] [Google AI for Developers, Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)

[6] [Vercel, Functions](https://vercel.com/docs/functions)
