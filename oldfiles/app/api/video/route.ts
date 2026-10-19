import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fetchComfyFile } from "@/lib/comfy";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename");
  const subfolder = searchParams.get("subfolder") ?? "";
  const type = searchParams.get("type") ?? "output";

  if (!filename) {
    return new Response("Missing filename.", { status: 400 });
  }

  // Prevent path traversal
  if (filename.includes("..") || subfolder.includes("..")) {
    return new Response("Invalid filename.", { status: 400 });
  }

  // Generated outputs (type=output) are accessible directly so external clients,
  // browsers, and OpenAI integrations can display the returned image URLs.
  // Non-output assets (e.g. input uploads) strictly require authentication.
  if (type !== "output") {
    const user = await requireUser(req);
    if (!user) {
      return new Response("Not authenticated.", { status: 401 });
    }
  }

  try {
    const comfyRes = await fetchComfyFile(filename, subfolder, type);
    return new Response(comfyRes.body, {
      headers: {
        "Content-Type": comfyRes.headers.get("content-type") ?? "video/mp4",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(err.message ?? "Failed to fetch video.", { status: 502 });
  }
}
