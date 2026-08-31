/**
 * 將伺服器回傳的 Base64 內容轉為檔案，觸發瀏覽器下載。
 * 用於匯出練習單（Word／PDF）等由後端產生的二進位檔案。
 */
export function downloadBase64File(filename: string, base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
