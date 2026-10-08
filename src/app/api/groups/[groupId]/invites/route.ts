import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, requireAdmin, ApiError } from "@/lib/api-guard";
import { generateInviteToken } from "@/lib/tokens";

const createInviteSchema = z.object({
  email: z.string().email().optional(), // omit for a generic shareable link
  expiresInDays: z.number().int().positive().max(90).default(14),
});

export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const invites = await prisma.groupInvite.findMany({
      where: { groupId: params.groupId, revokedAt: null, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ invites });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);
    requireAdmin(membership);

    const parsed = createInviteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);

    const invite = await prisma.groupInvite.create({
      data: {
        groupId: params.groupId,
        email: parsed.data.email,
        invitedById: userId,
        expiresAt,
        token: generateInviteToken(),
      },
    });

    // In production, if `email` was supplied, queue a transactional email
    // with the invite link here (e.g. via Resend/Postmark). Left as a
    // hook point since the choice of email provider is a design decision.
    const inviteUrl = `${process.env.NEXTAUTH_URL ?? ""}/invite/${invite.token}`;

    return NextResponse.json({ invite, inviteUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
