import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { uploadImageToComfy } from "@/lib/comfy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large (15MB max)." }, { status: 400 });
  }

  try {
    const result = await uploadImageToComfy(file);
    return NextResponse.json({ filename: result.name });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "Upload failed." }, { status: 502 });
  }
}
