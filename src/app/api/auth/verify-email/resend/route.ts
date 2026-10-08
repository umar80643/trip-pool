import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { generateSecureToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mailer";

const resendSchema = z.object({ email: z.string().email() });
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Always returns the same generic message whether or not the email exists,
// or is already verified — otherwise this endpoint becomes a way to check
// which addresses have an account (or which are already verified).
const GENERIC_RESPONSE = { message: "If that email needs verifying, we've sent a new link." };

export async function POST(req: NextRequest) {
  const { allowed, retryAfterMs } = rateLimit(`verify-email-resend:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const parsed = resendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && !user.emailVerifiedAt) {
    await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    const token = generateSecureToken();
    await prisma.emailVerificationToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) },
    });
    const verifyUrl = `${process.env.NEXTAUTH_URL ?? ""}/verify-email/${token}`;
    await sendMail({
      to: user.email,
      subject: "Verify your TripPool email",
      text: `Confirm your email address: ${verifyUrl}\n\nThis link expires in 24 hours.`,
    });
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
