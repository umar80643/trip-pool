import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const createSettlementSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  amountCents: z.number().int().positive(),
});

export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const settlements = await prisma.settlement.findMany({
      where: { groupId: params.groupId },
      include: {
        fromUser: { select: { id: true, name: true, avatarUrl: true } },
        toUser: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ settlements });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/**
 * Records that a payment was made. It starts unconfirmed (settledAt =
 * null) and only affects computed balances once the RECEIVER confirms it
 * via PATCH .../settlements/:id — see that route. This models real life:
 * "I sent you $20" (this endpoint) vs. "yes, I got it" (confirm).
 */
export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = createSettlementSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;

    if (data.fromUserId === data.toUserId) {
      throw new ApiError(400, "fromUserId and toUserId must be different.");
    }
    if (userId !== data.fromUserId) {
      throw new ApiError(403, "You can only record settlements you are paying yourself.");
    }

    const settlement = await prisma.settlement.create({
      data: { groupId: params.groupId, fromUserId: data.fromUserId, toUserId: data.toUserId, amountCents: data.amountCents },
      include: {
        fromUser: { select: { id: true, name: true, avatarUrl: true } },
        toUser: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    emitToGroup(params.groupId, "settlement:created", { settlement });
    return NextResponse.json({ settlement }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
