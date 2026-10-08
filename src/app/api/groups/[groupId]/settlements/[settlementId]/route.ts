import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

/**
 * Only the RECEIVER (toUserId) can confirm a settlement — this prevents
 * someone from unilaterally marking their own debt as paid without the
 * other party's acknowledgement.
 */
export async function PATCH(
  _req: NextRequest,
  { params }: { params: { groupId: string; settlementId: string } }
) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const existing = await prisma.settlement.findUniqueOrThrow({ where: { id: params.settlementId } });
    if (existing.toUserId !== userId) {
      throw new ApiError(403, "Only the recipient can confirm a settlement as paid.");
    }
    if (existing.settledAt) {
      return NextResponse.json({ settlement: existing }); // already confirmed, idempotent
    }

    const settlement = await prisma.settlement.update({
      where: { id: params.settlementId },
      data: { settledAt: new Date() },
      include: {
        fromUser: { select: { id: true, name: true, avatarUrl: true } },
        toUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    emitToGroup(params.groupId, "settlement:confirmed", { settlement });
    return NextResponse.json({ settlement });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { groupId: string; settlementId: string } }
) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const existing = await prisma.settlement.findUniqueOrThrow({ where: { id: params.settlementId } });
    if (existing.settledAt) {
      throw new ApiError(400, "Can't delete a confirmed settlement.");
    }
    if (existing.fromUserId !== userId) {
      throw new ApiError(403, "Only the person who recorded this settlement can cancel it.");
    }

    await prisma.settlement.delete({ where: { id: params.settlementId } });
    emitToGroup(params.groupId, "settlement:deleted", { settlementId: params.settlementId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
