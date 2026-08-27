# Supabase 帳密登入設計說明

## 採用流程

本系統採用 Supabase Email＋Password 原生 Auth。學生不需要先由教師或管理者在 Supabase 手動建立帳號：在網站輸入尚未註冊的電子郵件與密碼後，瀏覽器使用 Publishable key 呼叫 `auth.signUp`。Supabase 會寄出確認信；使用者完成驗證並回到已列入 Redirect URLs 的網站後，才建立可使用的 session。資料庫 `auth.users` 新增資料時，既有 trigger 會以最低權限 `student` 自動建立 `profiles` 與 `app_users`。

已註冊且驗證完成的使用者改以 `auth.signInWithPassword` 輸入信箱與密碼登入。前端使用 `auth.signOut` 清除本機 Supabase session；後端仍只接受 Authorization bearer token 並從受保護的 `profiles.role` 判定教師與管理者權限。密碼不會經過本專案後端、不會寫入 `profiles` 或 `app_users`，而是由 Supabase Auth 安全處理。

## Supabase Dashboard 必要設定

| 位置 | 必要設定 | 原因 |
|---|---|---|
| Authentication → Providers → Email | 啟用 Email provider，並保持 **Confirm email** 啟用 | hosted Supabase 預設會要求確認信箱，這可避免未驗證地址取得正式帳號 session。 |
| Authentication → URL Configuration | Site URL 設為正式 Vercel 網域；Redirect URLs 加入 localhost、Preview 與 Production 網域 | `emailRedirectTo` 只可導向允許清單中的 URL。 |
| Authentication → Email Templates | 使用 Confirm signup 範本；若要客製品牌信件，保留 Supabase 的確認 URL 變數 | 確保使用者能完成信箱確認與首次登入。 |
| Authentication → Rate Limits | 依學生量設定信件寄送與 OTP 限制 | 降低濫用與大量寄信風險。 |

## 忘記密碼

使用者按「忘記密碼」時，前端呼叫 `resetPasswordForEmail`，且使用與正式網域相符的 redirect URL。Supabase 為避免帳號枚舉，對不存在的信箱不會透露帳號存在與否；頁面一律顯示中性成功訊息。使用者從信件回站且 session 建立後，才可用 `updateUser` 設定新密碼。

## 參考資料

[1] [Supabase：Password-based Auth](https://supabase.com/docs/guides/auth/passwords)

[2] [Supabase JavaScript：signUp](https://supabase.com/docs/reference/javascript/auth-signup)

[3] [Supabase JavaScript：signInWithPassword](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)

[4] [Supabase JavaScript：resend](https://supabase.com/docs/reference/javascript/auth-resend)
