import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const removeMemberSchema = z.object({ userId: z.string() });

export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const members = await prisma.groupMember.findMany({
      where: { groupId: params.groupId },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/**
 * Removes a member. Admins can remove anyone (except the last admin);
 * any member can remove themselves ("leave group"). Refuses to remove a
 * member who still has a non-zero balance — they need to settle up
 * first, otherwise their debts silently vanish from the ledger.
 */
export async function DELETE(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const requesterId = await requireUserId();
    const requesterMembership = await requireGroupMember(requesterId, params.groupId);

    const parsed = removeMemberSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const targetUserId = parsed.data.userId;

    const isSelf = targetUserId === requesterId;
    if (!isSelf && requesterMembership.role !== "admin") {
      throw new ApiError(403, "Only a group admin can remove other members.");
    }

    if (isSelf && requesterMembership.role === "admin") {
      const adminCount = await prisma.groupMember.count({
        where: { groupId: params.groupId, role: "admin" },
      });
      if (adminCount <= 1) {
        throw new ApiError(400, "You're the last admin — promote someone else first.");
      }
    }

    // Guard: don't let someone leave (or be removed) with an open balance.
    const [paid, owed] = await Promise.all([
      prisma.expense.aggregate({
        where: { groupId: params.groupId, paidById: targetUserId },
        _sum: { amountCents: true },
      }),
      prisma.expenseSplit.aggregate({
        where: { userId: targetUserId, expense: { groupId: params.groupId } },
        _sum: { amountCents: true },
      }),
    ]);
    const net = (paid._sum.amountCents ?? 0) - (owed._sum.amountCents ?? 0);
    if (net !== 0) {
      throw new ApiError(
        400,
        "This member has an outstanding balance. Settle up before removing them from the group."
      );
    }

    await prisma.groupMember.delete({
      where: { userId_groupId: { userId: targetUserId, groupId: params.groupId } },
    });

    emitToGroup(params.groupId, "member:removed", { groupId: params.groupId, userId: targetUserId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
