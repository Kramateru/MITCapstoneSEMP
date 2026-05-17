import type { NextConfig } from "next";
import path from "node:path";

function firstConfiguredValue(...values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = (value || "").trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

const supabasePublicUrl = firstConfiguredValue(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_URL,
);

const supabasePublishableKey = firstConfiguredValue(
  process.env.SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  process.env.SUPABASE_ANON_KEY,
);

const backendPublicUrl = firstConfiguredValue(
  process.env.NEXT_PUBLIC_BACKEND_URL,
  process.env.BACKEND_URL,
);

const backendPublicWsUrl = firstConfiguredValue(
  process.env.NEXT_PUBLIC_BACKEND_WS_URL,
  backendPublicUrl
    ? backendPublicUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:")
    : "",
);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabasePublicUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabasePublishableKey,
    VITE_SUPABASE_URL: supabasePublicUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    NEXT_PUBLIC_BACKEND_URL: backendPublicUrl,
    NEXT_PUBLIC_BACKEND_WS_URL: backendPublicWsUrl,
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
