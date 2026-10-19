import { isSupabaseConfigured, supabaseSelect } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let dbStatus = "untested";
  let dbError: string | null = null;

  if (isSupabaseConfigured()) {
    try {
      await supabaseSelect("aieditor_users?select=id&limit=1");
      dbStatus = "connected";
    } catch (err: any) {
      dbStatus = "failed";
      dbError = err?.message || String(err);
    }
  } else {
    dbStatus = "unconfigured";
  }

  return Response.json({
    status: "ok",
    dbStatus,
    dbError,
    env: {
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
      hasOwnerKey: Boolean(process.env.OWNER_API_KEY),
      hasComfyUrl: Boolean(process.env.COMFY_URL),
    },
  });
}
