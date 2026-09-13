import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { allowed, retryAfterMs } = rateLimit(`invite-accept:${clientIp(req)}`, 20, 15 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const userId = await requireUserId();

    const invite = await prisma.groupInvite.findUnique({ where: { token: params.token } });
    if (!invite) {
      return NextResponse.json({ error: "Invite not found." }, { status: 404 });
    }
    if (invite.revokedAt) {
      return NextResponse.json({ error: "This invite has been revoked." }, { status: 410 });
    }
    if (invite.acceptedAt) {
      return NextResponse.json({ error: "This invite has already been used." }, { status: 410 });
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invite has expired." }, { status: 410 });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (invite.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "This invite was sent to a different email address." },
        { status: 403 }
      );
    }

    const [membership] = await prisma.$transaction([
      prisma.groupMember.upsert({
        where: { userId_groupId: { userId, groupId: invite.groupId } },
        create: { userId, groupId: invite.groupId, role: "member" },
        update: {},
      }),
      prisma.groupInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ]);

    emitToGroup(invite.groupId, "member:joined", { groupId: invite.groupId, userId });
    return NextResponse.json({ membership });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
