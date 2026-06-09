import { NextResponse } from "next/server";
import { getServerAccountOwnerId } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";
import { downloadTelegramMedia } from "@/lib/telegram/media";
import { decrypt } from "@/lib/whatsapp/encryption";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;
    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountOwnerId = await getServerAccountOwnerId(supabase, user.id);
    const { data: config, error: configError } = await supabase
      .from("telegram_config")
      .select("bot_token")
      .eq("user_id", accountOwnerId)
      .eq("status", "connected")
      .maybeSingle();

    if (configError || !config?.bot_token) {
      return NextResponse.json(
        { error: "Telegram is not configured" },
        { status: 400 },
      );
    }

    const media = await downloadTelegramMedia({
      botToken: decrypt(config.bot_token),
      fileId: decodeURIComponent(fileId),
    });

    return new Response(new Uint8Array(media.buffer), {
      status: 200,
      headers: {
        "Content-Type": media.contentType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${media.fileName.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    console.error("[telegram/media] download failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch Telegram media" },
      { status: 500 },
    );
  }
}
