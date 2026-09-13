import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { computeBalances, simplifyDebts, computeDetailedDebts } from "@/lib/debt-simplification";

/**
 * GET /api/groups/:groupId/balances
 *
 * Returns:
 *  - balances: each member's net position (positive = owed, negative = owes)
 *  - simplified: minimal set of settlements to zero everyone out
 *  - detailed: every individual unpaid expense-split, for the
 *    "who owes whom for what" view
 */
export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const [members, expenses, splits, settlements] = await Promise.all([
      prisma.groupMember.findMany({
        where: { groupId: params.groupId },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      prisma.expense.findMany({
        where: { groupId: params.groupId },
        select: { id: true, paidById: true, amountCents: true, description: true },
      }),
      prisma.expenseSplit.findMany({
        where: { expense: { groupId: params.groupId } },
        select: { expenseId: true, userId: true, amountCents: true },
      }),
      prisma.settlement.findMany({
        where: { groupId: params.groupId },
        select: { fromUserId: true, toUserId: true, amountCents: true, settledAt: true },
      }),
    ]);

    const balances = computeBalances({
      userIds: members.map((m: { userId: string }) => m.userId),
      expenses,
      splits,
      settlements,
    });

    const simplified = simplifyDebts(balances);
    const detailed = computeDetailedDebts({ expenses, splits });

    const userById = new Map(
      members.map((m: { userId: string; user: unknown }) => [m.userId, m.user])
    );
    const enrich = <T extends { userId?: string; from?: string; to?: string }>(x: T) => x;

    return NextResponse.json({
      balances: balances.map((b) => ({ ...b, user: userById.get(b.userId) })),
      simplified: simplified.map((s) => ({
        ...s,
        fromUser: userById.get(s.from),
        toUser: userById.get(s.to),
      })),
      detailed: detailed.map((d) => ({
        ...d,
        fromUser: userById.get(d.from),
        toUser: userById.get(d.to),
      })),
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof Error) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
