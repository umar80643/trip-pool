import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { generateSecureToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mailer";

const requestSchema = z.object({ email: z.string().email() });
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — shorter-lived than email verification since it grants account control

// Same email or not, registered or not: identical response. A different
// message for "no account with that email" is a classic enumeration leak.
const GENERIC_RESPONSE = { message: "If an account exists for that email, we've sent a reset link." };

export async function POST(req: NextRequest) {
  const { allowed, retryAfterMs } = rateLimit(`password-reset-request:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.passwordHash) {
    // Also rate-limit per account, not just per IP, so an attacker can't
    // spam reset emails at one victim from many source addresses.
    const perAccount = rateLimit(`password-reset-request:user:${user.id}`, 3, 15 * 60 * 1000);
    if (perAccount.allowed) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      const token = generateSecureToken();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
      });
      const resetUrl = `${process.env.NEXTAUTH_URL ?? ""}/reset-password/${token}`;
      await sendMail({
        to: user.email,
        subject: "Reset your TripPool password",
        text: `Someone requested a password reset for this account. If that was you: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
      });
    }
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
