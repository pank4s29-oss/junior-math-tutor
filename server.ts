import express from "express";
import { configureApiApp } from "./server/app";

// Vercel Node/Express 入口：平台會將根目錄 public/ 以 CDN 供應，
// 此應用程式僅處理未被靜態檔案命中的 /api/trpc 請求。
export default configureApiApp(express());
