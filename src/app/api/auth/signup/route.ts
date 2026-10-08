import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { generateSecureToken } from "@/lib/tokens";
import { sendMail } from "@/lib/mailer";

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: NextRequest) {
  const { allowed, retryAfterMs } = rateLimit(`signup:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash },
    select: { id: true, name: true, email: true },
  });

  const token = generateSecureToken();
  await prisma.emailVerificationToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) },
  });
  const verifyUrl = `${process.env.NEXTAUTH_URL ?? ""}/verify-email/${token}`;
  await sendMail({
    to: user.email,
    subject: "Verify your TripPool email",
    text: `Welcome to TripPool! Confirm your email address: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });

  return NextResponse.json({ user }, { status: 201 });
}
