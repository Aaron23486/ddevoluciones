import { NextResponse } from "next/server";
import { requireActiveProfile } from "@/lib/auth/require-user";
import { getMyNotifications } from "@/repositories/notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireActiveProfile();
    const notifications = await getMyNotifications(24);

    return NextResponse.json(
      { notifications },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { notifications: [] },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  }
}