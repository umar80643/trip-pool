import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { computeSplits, SplitMode } from "@/lib/splits";
import { emitToGroup } from "@/lib/realtime-emit";

const participantSchema = z.object({
  userId: z.string(),
  value: z.number().optional(),
});

const createExpenseSchema = z.object({
  amountCents: z.number().int().positive(),
  description: z.string().min(1).max(200),
  category: z.string().min(1).max(50),
  date: z.string().datetime().optional(),
  paidById: z.string(),
  splitType: z.enum(["equal", "exact", "percentage", "shares"]),
  participants: z.array(participantSchema).min(1),
});

export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") ?? undefined;
    const from = searchParams.get("from"); // ISO date
    const to = searchParams.get("to");

    const expenses = await prisma.expense.findMany({
      where: {
        groupId: params.groupId,
        ...(category ? { category } : {}),
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        paidBy: { select: { id: true, name: true, avatarUrl: true } },
        splits: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ expenses });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = createExpenseSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;

    // Every participant (and the payer) must actually belong to the group.
    const memberIds = new Set(
      (await prisma.groupMember.findMany({ where: { groupId: params.groupId }, select: { userId: true } })).map(
        (m: { userId: string }) => m.userId
      )
    );
    const allInvolved = new Set([data.paidById, ...data.participants.map((p) => p.userId)]);
    for (const id of allInvolved) {
      if (!memberIds.has(id)) {
        throw new ApiError(400, "All participants must be members of this group.");
      }
    }

    const splits = computeSplits(data.amountCents, data.splitType as SplitMode, data.participants);

    const expense = await prisma.expense.create({
      data: {
        groupId: params.groupId,
        paidById: data.paidById,
        amountCents: data.amountCents,
        description: data.description,
        category: data.category,
        splitType: data.splitType,
        date: data.date ? new Date(data.date) : undefined,
        splits: { create: splits },
      },
      include: {
        paidBy: { select: { id: true, name: true, avatarUrl: true } },
        splits: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      },
    });

    emitToGroup(params.groupId, "expense:created", { expense });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof Error) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
