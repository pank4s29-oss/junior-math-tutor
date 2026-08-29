# Vercel 正式環境白屏與模型錯誤診斷紀錄

## 2026-08-29 驗證結果

使用 `https://junior-math-tutor.vercel.app/` 時，瀏覽器初始載入的 HTML 曾引用舊版 `/assets/index-B_gQmnfB.js` 與 `/assets/index-DqEM08pc.css`，DOM 只有空的 `#root`，因此畫面白屏。對舊資產路徑的請求會被原本的 Express SPA fallback 回傳 `text/html` 的 index.html，證實遺失資產被錯誤當成首頁處理。

已將 `server/app.ts` fallback 改為：含副檔名的路徑或非 HTML Accept header 回傳純文字 404；只有無副檔名的 HTML 深層連結才回傳 index.html。`server/app.test.ts` 新增遺失 JavaScript 資產的 404、純文字 MIME 與不得包含首頁內容的回歸測試。

正式檢查結果為：新版 JS `/assets/index-BGLrMxtL.js` 回應 `200 application/javascript`，新版 CSS `/assets/index-DAHYA9tC.css` 回應 `200 text/css`，遺失 bundle 回應 `404 text/plain`，`/review` 回應 `200 text/html`。使用 cache-busting URL 後首頁可正常顯示繁體中文標題、年級／單元、三種解題模式、多題匯入、公式編輯器與登入入口。

## Gemini runtime log

透過 Vercel production runtime error 叢集查詢，最近錯誤不是前端白屏，而是 `Gemini tutor request failed` 的 HTTP 429。Gemini API 明確回報 `generate_content_free_tier_requests`、模型 `gemini-3.6-flash`、免費層每日上限 20 次，並提供約 29–57 秒 retry delay。這屬於 Gemini 專案配額／方案限制，不是圖片或 PDF 解析程式的 MIME、路由或前端掛載錯誤；程式已保留失敗退款與可操作的錯誤提示。若要恢復正式解題服務，需在該 Gemini API 專案提高配額或等待配額重置，並以受控帳號重新驗證。
