import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const confirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const { allowed, retryAfterMs } = rateLimit(`password-reset-confirm:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const record = await prisma.passwordResetToken.findUnique({ where: { token: parsed.data.token } });
  if (!record || record.usedAt) {
    return NextResponse.json({ error: "This reset link is invalid or has already been used." }, { status: 404 });
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link has expired. Request a new one." }, { status: 410 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // Note: sessions here are JWTs (see src/lib/auth.ts), which can't be
  // individually revoked server-side — anyone already signed in on another
  // device stays signed in until their token naturally expires. Switching
  // to database-backed sessions would let a reset also invalidate those.
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true });
}
