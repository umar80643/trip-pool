import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const confirmSchema = z.object({ token: z.string().min(1) });

export async function POST(req: NextRequest) {
  const { allowed, retryAfterMs } = rateLimit(`verify-email-confirm:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const record = await prisma.emailVerificationToken.findUnique({ where: { token: parsed.data.token } });
  if (!record) {
    return NextResponse.json({ error: "This verification link is invalid or has already been used." }, { status: 404 });
  }
  if (record.expiresAt < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } });
    return NextResponse.json({ error: "This verification link has expired. Request a new one." }, { status: 410 });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.emailVerificationToken.delete({ where: { id: record.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
