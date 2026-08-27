# 國中數學解題系統：Supabase 資料庫建立與 Vercel 移轉指南

> **適用範圍：**本指南對應目前的「國中數學解題教練」功能，包括學生帳號、教師工作台、核准教材、單元規則、解題紀錄、錯題循環、題目照片、回報案件與每日用量。它是將目前受管 MySQL 架構移轉為 **Supabase PostgreSQL + Supabase Auth + Supabase Storage** 的藍圖，而不是把既有連線字串直接貼到 Vercel。

## 0. 先理解移轉範圍

目前專案的資料層是 MySQL／Drizzle，登入、檔案、AI 與通知則使用受管服務。Supabase 提供的是 PostgreSQL、Auth 與 Storage；因此資料表型別、資料庫驅動、登入流程與檔案儲存程式都需要調整。請把本次作業視為**重建可攜式後端基礎**，而不是單純更換 `DATABASE_URL`。

| 現有能力 | Supabase 對應方案 | 移轉時的必要調整 |
|---|---|---|
| MySQL + Drizzle | Supabase PostgreSQL | 將 Drizzle schema 改為 `drizzle-orm/pg-core`，或改用 `@supabase/supabase-js`。 |
| 受管登入 | Supabase Auth | 將使用者識別由數字 ID 改為 `auth.users.id` 的 UUID。 |
| 受管檔案儲存 | Supabase Storage 私有 bucket | 題目照片只存入私有 bucket；資料表只保存物件路徑與辨識狀態。 |
| 受管模型呼叫 | Anthropic／OpenAI 等伺服器端 API | 模型 API Key 只放在 Vercel 的伺服器端環境變數。 |
| 受管通知 | Resend、Postmark、LINE 或 Slack | 教師協助案件由 Vercel API 驗證後發出通知。 |

Supabase 的每個專案都包含完整 PostgreSQL，並可透過 Dashboard 的 Table Editor 與 SQL Editor 管理。[1] 本系統會使用 Supabase Auth 作身分驗證，並將使用者 UUID 作為所有學生資料的擁有者欄位。Auth 發出的 JWT 可被 RLS 政策以 `auth.uid()` 用於資料列授權。[2]

---

## 1. 建立 Supabase 專案

請進入 [Supabase Dashboard](https://supabase.com/dashboard)，登入後依下列步驟建立專案。

1. 點選 **New project**，選擇自己的 Organization；若尚未建立 Organization，先依畫面建立一個個人或教學事業用 Organization。
2. 輸入清楚的專案名稱，例如 `junior-math-tutor-production`。正式環境與測試環境建議建立為**兩個獨立專案**，不要將試驗資料寫入正式學生資料庫。
3. 選擇離目標使用者較近的亞洲區域；以臺灣學生為主時，可比較 Dashboard 中可選的亞洲區域後選擇較近者。
4. 建立**高強度資料庫密碼**，存入密碼管理器。這是資料庫管理密碼，並非學生登入密碼。
5. 點選 **Create new project**，等待專案狀態轉為可用。

建立完成後，Dashboard 左側應可看到 **Table Editor**、**SQL Editor**、**Authentication** 與 **Storage**。先不要把任何 Secret key 貼到 GitHub、程式碼或聊天工具。

---

## 2. 取得正確的連線資訊與金鑰

在專案 Dashboard 右上角點選 **Connect**，可取得 PostgreSQL 連線資訊；特定金鑰則位於 **Settings → API Keys**。[3] 請建立下列環境變數「名稱」，但先不要將任何機密值公開。

| 環境變數 | 從哪裡取得 | 可以出現在瀏覽器？ | 用途 |
|---|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Connect 或 Settings → API Keys | 可以 | Supabase 專案 URL。 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Settings → API Keys → Publishable key | 可以 | 前端建立 Supabase client；安全性依賴 Auth 與 RLS，不是這把 key 本身。 |
| `SUPABASE_SECRET_KEY` | Settings → API Keys → Secret keys | **不可以** | 僅 Vercel API／伺服器端使用，會繞過 RLS。 |
| `SUPABASE_DB_URL` | Connect → Transaction pooler | **不可以** | 若使用 Drizzle／Postgres driver，供 Vercel Serverless Functions 使用。 |
| `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` | 所選模型供應商帳號後台 | **不可以** | 僅伺服器端發出受控解題與手寫辨識呼叫。 |
| `RESEND_API_KEY` 等通知 key | 所選通知供應商後台 | **不可以** | 僅伺服器端寄送教師協助通知。 |

Supabase 的 **Publishable key** 是給網頁與行動端使用的低權限 key；**Secret key** 具備較高權限、會繞過 RLS，絕不可放進瀏覽器、`NEXT_PUBLIC_` 變數、GitHub 或用戶端程式碼。[4]

### Vercel 與資料庫連線模式

Vercel 的 Serverless Functions 屬於短生命週期工作負載，應優先使用 Supabase Dashboard 的 **Transaction pooler** 連線字串（通常為 port `6543`），而非長連線用的 Direct connection。[3] 將此字串只放在 Vercel 的 Production、Preview 與 Development 環境設定中；若改用 `@supabase/supabase-js` 走 HTTPS Data API，則可以不使用 `SUPABASE_DB_URL`。

---

## 3. 設定學生與教師登入

本系統建議以 **Supabase Auth 的 Email OTP／Magic Link** 作為第一版學生登入方式，避免自建密碼流程。您可視家長／學生使用情境，後續再開啟 Google 登入或其他 OAuth 供應商。

1. 前往 **Authentication → Providers**，開啟 Email Provider；第一版可選擇 Magic Link 或 Email OTP。
2. 前往 **Authentication → URL Configuration**。
3. 在 **Site URL** 先填 Vercel 正式網站網址，例如 `https://你的專案.vercel.app`。自訂網域完成後再改為正式自訂網域。
4. 在 **Redirect URLs** 加入：
   - `http://localhost:3000/**`（本機開發）
   - `https://你的專案.vercel.app/**`（正式環境）
   - `https://*-你的Vercel帳號.vercel.app/**`（若要支援 Preview Deployment，依 Vercel 實際網址規則調整）
5. 不要把教師或管理者角色放進可由學生自行修改的 `user_metadata`；角色應由資料庫中的受保護欄位，或不可由學生自行修改的 `app_metadata` 管理。[2]

本指南的 SQL 會建立 `public.profiles`，並以 trigger 在使用者註冊時自動建立 profile。`profiles.id` 會直接引用 `auth.users.id`，而不是自行建立另一個使用者識別碼。[5]

---

## 4. 建立資料表、索引與 RLS

1. 前往 **SQL Editor → New query**。
2. 開啟附件 `supabase_junior_math_schema.sql`，完整複製貼入 SQL Editor。
3. 按 **Run**。這會建立 enum、資料表、`handle_new_user()` trigger、索引、RLS 政策與私有 `math-problems` bucket。
4. 切換至 **Table Editor**，確認出現 `profiles`、`teacher_units`、`approved_contents`、`math_conversations`、`math_attachments`、`math_attempts`、`practice_results`、`teacher_escalations` 與 `daily_usage`。
5. 在 **Authentication → Users** 建立一個自己的測試教師帳號，以驗證 profile trigger 是否寫入 `profiles`。
6. 再到 SQL Editor 執行：

```sql
update public.profiles
set role = 'admin'
where id = '貼上自己的 auth.users UUID';
```

不要讓學生直接更新 `role` 欄位。腳本中的 RLS 讓學生讀取自己的資料；教學規則、教材寫入、解題紀錄建立、每日用量與案件狀態，建議都經過經過身分驗證的 Vercel API 執行，以避免用戶端跳過業務規則。

### 為何要開啟 RLS

RLS 可對每次資料庫存取套用資料列條件；Supabase 明確建議對任何暴露於 API 的 table 啟用 RLS，並同時設定最小必要的 grants 與逐一操作政策。[6] 例如本系統的學生只能選取 `user_id = auth.uid()` 的對話、題目照片 metadata、解題紀錄與練習結果；非教師不得讀取未核准教材或教師案件。

---

## 5. 建立私有題目照片儲存桶

SQL 腳本會以 `math-problems` 建立**私有 bucket**，允許 `image/jpeg`、`image/png`、`image/webp`，並限制 5MB。題目照片不可使用 public bucket；私有 bucket 的讀取與下載均會受 RLS 約束，或需要伺服器端建立短效 signed URL。[7]

目前網站的建議流程如下：

1. 學生在瀏覽器選取題目照片。
2. 前端只做尺寸、對比與基本品質訊號預檢；不在前端儲存任何 Secret。
3. 將檔案送至 Vercel 的受保護 API。
4. API 驗證登入、MIME type、檔案大小與每日限制後，以 `SUPABASE_SECRET_KEY` 上傳至 `math-problems/<student-uuid>/<timestamp>.jpg`。
5. `math_attachments` 只保存 bucket 路徑、檔名、大小、MIME type 與辨識狀態；不把影像位元資料放進資料庫。
6. 手寫辨識時，API 為該檔案建立短效 signed URL 給視覺模型，並將轉寫結果送回學生核對。模型 API Key 仍只存在 Vercel 伺服器端。

Supabase Storage 預設不允許沒有 RLS policy 的上傳；若由受保護 Vercel API 以 Secret key 統一處理，學生端不需要對 `storage.objects` 擁有直接寫入權限。[8]

---

## 6. 在 Vercel 設定環境變數

完成 Supabase 專案後，進入 Vercel 的目標專案：**Settings → Environment Variables**。

1. 將第 2 節列出的變數逐一新增；選擇 Production、Preview 與 Development 所需環境。
2. `NEXT_PUBLIC_` 僅限 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。不要在名稱前加 `NEXT_PUBLIC_` 的 Secret key、資料庫連線字串、模型 key 或通知 key。
3. 儲存後重新部署。Vercel 的環境變數只會注入新建置，舊的已部署版本不會自動取得新值。
4. 若採用 Supabase Vercel Integration，可在 Vercel Marketplace 連接兩邊帳戶來協助同步部分 Supabase 變數；但仍應自行核對哪些變數是公開值、哪些是伺服器端秘密。[9]

---

## 7. 將現有程式改為可連接 Supabase

現有程式碼不能只換一條 connection string 即完成移轉。建議分兩階段處理。

### 階段 A：先建立可攜式後端

| 工作項目 | 實作方向 |
|---|---|
| 登入 | 用 `@supabase/supabase-js` 取代目前受管登入；API 每次驗證 Supabase JWT。 |
| 使用者 ID | 所有原本的數字型 `userId` 改為 UUID，使用 `auth.uid()`／`profiles.id`。 |
| 資料存取 | 選擇 `@supabase/supabase-js` 的 Data API，或把 Drizzle MySQL schema 改為 Postgres schema。兩者不可混用原有 MySQL 型別。 |
| API | 將 Express/tRPC 的受保護路由轉為 Vercel Serverless Functions 或 Next.js Route Handlers；每個寫入操作先驗證使用者。 |
| Storage | 將目前受管 Storage helper 改成 Supabase Storage server client，保留私有 bucket／signed URL 架構。 |
| 模型呼叫 | 以伺服器端 `ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY` 呼叫，保留現有固定 JSON 回覆格式、低信心澄清與額度檢查。 |

### 階段 B：移轉既有資料

若目前已有真實學生資料，請先匯出資料並在**測試 Supabase 專案**驗證，而不是直接寫進正式環境。由於使用者 ID 將從現有數字型 ID 換成 Supabase Auth UUID，必須先建立舊 ID 與新 UUID 的安全對照表，再按「教師內容 → 對話 → 附件 metadata → 解題紀錄 → 練習 → 回報 → 用量」的依賴順序匯入。題目照片應個別搬遷至私有 bucket，並更新 `storage_path`，不應放入 SQL 匯出檔。

---

## 8. 驗證清單

| 驗證項目 | 預期結果 |
|---|---|
| 未登入使用者讀取 API | 讀不到學生資料或私有教材。 |
| 學生 A 讀取學生 B 的對話／附件 metadata | RLS 拒絕或回傳零筆。 |
| 學生讀取核准教材 | 可以讀取 `is_approved = true` 的教材與規則。 |
| 學生讀取未核准教材 | 不可取得。 |
| 學生直接更新教師規則或案件 | 不可執行。 |
| 教師／管理者帳號 | 可經 Vercel API 儲存規則、教材與案件狀態。 |
| 上傳題目照片 | 僅接受允許的圖片格式與大小，並寫入私有 bucket。 |
| signed URL | 僅短時間可讀取特定學生照片。 |
| 每日用量 | 超額時 Vercel API 在模型呼叫前拒絕。 |
| Vercel Production | 新增環境變數後重新部署，登入、解題、圖片與教師工作台都可操作。 |

RLS policy 應另外以 Supabase CLI 的 `supabase test db` 測試「允許」與「拒絕」兩種情境，而不是只依畫面是否能載入判斷。[6]

---

## 9. 建議的執行順序

1. 建立一個 **Supabase development** 專案與 Vercel Preview；不要先切正式網站。
2. 執行本附件 SQL，測試 Auth、profiles trigger、私有 Storage 與 RLS。
3. 重構程式的登入與資料層，完成後用測試帳號驗證學生與教師角色。
4. 建立 production Supabase 專案，將同一份 migration 套用至正式環境。
5. 在 Vercel 設定 Production 變數、更新 OAuth／Auth redirect URLs，部署 Preview 後再切 Production。
6. 先以自訂網域的測試子網域進行驗收，再正式切換 DNS。
7. 上線後持續查看 Supabase Security Advisor、Database Logs、Storage usage 與 Vercel logs；任何 Secret key 疑似外洩時立即建立新 key、更新 Vercel 環境變數並重新部署。[4]

## 參考資料

[1] [Supabase Database Overview](https://supabase.com/docs/guides/database/overview)

[2] [Supabase Auth Guide](https://supabase.com/docs/guides/auth)

[3] [Connecting to Supabase Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)

[4] [Understanding Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys)

[5] [Managing User Data in Supabase](https://supabase.com/docs/guides/auth/managing-user-data)

[6] [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

[7] [Supabase Storage Buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)

[8] [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)

[9] [Supabase for Vercel](https://supabase.com/partners/catalog/vercel)
