import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, ApiError } from "@/lib/api-guard";
import { computeBalances } from "@/lib/debt-simplification";

export async function GET() {
  try {
    const userId = await requireUserId();

    const groups = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = groups.map((g: { groupId: string }) => g.groupId);

    let totalOwedToMe = 0;
    let totalIOwe = 0;
    const perGroup: { groupId: string; groupName: string; netCents: number }[] = [];

    for (const groupId of groupIds) {
      const [group, members, expenses, splits, settlements] = await Promise.all([
        prisma.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true } }),
        prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
        prisma.expense.findMany({ where: { groupId }, select: { paidById: true, amountCents: true } }),
        prisma.expenseSplit.findMany({
          where: { expense: { groupId } },
          select: { userId: true, amountCents: true },
        }),
        prisma.settlement.findMany({
          where: { groupId },
          select: { fromUserId: true, toUserId: true, amountCents: true, settledAt: true },
        }),
      ]);

      const balances = computeBalances({
        userIds: members.map((m: { userId: string }) => m.userId),
        expenses,
        splits,
        settlements,
      });
      const mine = balances.find((b: { userId: string }) => b.userId === userId)?.amountCents ?? 0;

      if (mine > 0) totalOwedToMe += mine;
      if (mine < 0) totalIOwe += -mine;
      perGroup.push({ groupId, groupName: group.name, netCents: mine });
    }

    // Spend by category / over time, across all my groups, for MY splits only.
    const mySplits = await prisma.expenseSplit.findMany({
      where: { userId, expense: { groupId: { in: groupIds } } },
      select: { amountCents: true, expense: { select: { category: true, date: true } } },
    });

    const byCategory = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const s of mySplits) {
      byCategory.set(s.expense.category, (byCategory.get(s.expense.category) ?? 0) + s.amountCents);
      const monthKey = s.expense.date.toISOString().slice(0, 7); // YYYY-MM
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + s.amountCents);
    }

    return NextResponse.json({
      totalOwedToMeCents: totalOwedToMe,
      totalIOweCents: totalIOwe,
      perGroup,
      spendByCategory: Array.from(byCategory.entries()).map(([category, amountCents]) => ({
        category,
        amountCents,
      })),
      spendByMonth: Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amountCents]) => ({ month, amountCents })),
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
