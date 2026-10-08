import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, ApiError } from "@/lib/api-guard";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
