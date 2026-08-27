import { describe, expect, it } from "vitest";
import { createApiApp } from "../app";

describe("可攜式 API 的 OAuth 隔離", () => {
  it("Vercel API 工廠不註冊受管 OAuth callback", () => {
    const app = createApiApp() as unknown as { _router?: { stack?: Array<{ route?: { path?: string } }> } };
    const registeredPaths = app._router?.stack?.map(layer => layer.route?.path).filter(Boolean) ?? [];
    expect(registeredPaths).not.toContain("/api/oauth/callback");
  });
});
