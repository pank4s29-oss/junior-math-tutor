# Vercel 正式環境白屏診斷紀錄

## 2026-08-29 驗證結果

使用 `https://junior-math-tutor.vercel.app/` 時，瀏覽器初始載入的 HTML 仍引用舊版 `/assets/index-B_gQmnfB.js` 與 `/assets/index-DqEM08pc.css`，DOM 只有空的 `#root`，因此畫面白屏。瀏覽器 console 沒有額外輸出，但 performance entry 確認舊 bundle 已被請求。

以 curl 重新取得的 production HTML 已改引用新版 `/assets/index-BGLrMxtL.js`；新版 JavaScript 回應為 `application/javascript` 且長度約 746 KB。對錯誤的舊資產路徑，Vercel 曾回傳 `text/html` 的 index.html，證實 Express SPA fallback 會把遺失資產當成首頁處理。

已將 `server/app.ts` fallback 改為：含副檔名的路徑或非 HTML Accept header 回傳純文字 404；只有無副檔名的 HTML 深層連結才回傳 index.html。`server/app.test.ts` 新增遺失 JavaScript 資產的 404、純文字 MIME 與不得包含首頁內容的回歸測試。

使用新的查詢參數 `https://junior-math-tutor.vercel.app/?fresh=1787963450` 重新驗證後，首頁可正常渲染，且可見繁體中文標題、年級／單元、三種解題模式、多題匯入、公式編輯器與登入入口。這表示白屏包含舊 HTML／資產快取因素；修正版已由新 production bundle 載入並可運作。
