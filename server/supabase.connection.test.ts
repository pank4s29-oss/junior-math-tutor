import { describe, expect, it } from "vitest";

describe("Supabase server connection", () => {
  it("accepts the configured server-only key on the project REST endpoint", async () => {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    expect(url).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i);
    expect(secretKey).toMatch(/^sb_secret_[A-Za-z0-9_-]+$/);

    const response = await fetch(`${url!.replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: secretKey! },
    });

    expect(response.status).toBeLessThan(400);
  });

  it("接受瀏覽器端登入所需的公開網址與 Publishable key", async () => {
    const url = process.env.VITE_SUPABASE_URL;
    const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    expect(url).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i);
    expect(publishableKey).toBeTruthy();

    const response = await fetch(`${url!.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: publishableKey! },
    });

    expect(response.status).toBeLessThan(400);
  });
});
