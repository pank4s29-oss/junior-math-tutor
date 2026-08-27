import express from "express";
import { configureApiApp } from "../../server/app";

// Vercel 將此檔案作為 /api/trpc/* 的 Node.js Serverless Function。
// Express 只承擔 API；Vite 建置出的 SPA 由 Vercel CDN 供應。
export default configureApiApp(express());
