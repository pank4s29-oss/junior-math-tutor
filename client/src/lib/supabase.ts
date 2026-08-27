import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("缺少 Supabase 瀏覽器端登入設定。");
}

/** 僅使用公開 Project URL 與 Publishable key；不可在此放置服務端 Secret key。 */
export const supabaseBrowser = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});
