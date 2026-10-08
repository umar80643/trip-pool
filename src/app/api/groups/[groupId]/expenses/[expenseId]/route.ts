import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireUserId,
  requireGroupMember,
  ApiError,
} from "@/lib/api-guard";
import { computeSplits, SplitMode } from "@/lib/splits";
import { emitToGroup } from "@/lib/realtime-emit";

const participantSchema = z.object({
  userId: z.string(),
  value: z.number().optional(),
});

const updateExpenseSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  description: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(50).optional(),
  date: z.string().datetime().optional(),
  paidById: z.string().optional(),
  splitType: z
    .enum(["equal", "exact", "percentage", "shares"])
    .optional(),
  participants: z
    .array(participantSchema)
    .min(1)
    .optional(),
});

async function assertCanEdit(
  userId: string,
  groupId: string,
  expensePaidById: string,
) {
  const membership = await requireGroupMember(
    userId,
    groupId,
  );

  const isPayer = userId === expensePaidById;
  const isAdmin = membership.role === "admin";

  if (!isPayer && !isAdmin) {
    throw new ApiError(
      403,
      "Only the payer or a group admin can edit or delete this expense.",
    );
  }
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: {
      groupId: string;
      expenseId: string;
    };
  },
) {
  try {
    const userId = await requireUserId();

    const existing =
      await prisma.expense.findUniqueOrThrow({
        where: {
          id: params.expenseId,
        },
        include: {
          splits: true,
        },
      });

    await assertCanEdit(
      userId,
      params.groupId,
      existing.paidById,
    );

    const parsed =
      updateExpenseSchema.safeParse(
        await req.json().catch(() => null),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.flatten(),
        },
        {
          status: 400,
        },
      );
    }

    const data = parsed.data;

    const nextAmount =
      data.amountCents ??
      existing.amountCents;

    const nextSplitType = (
      data.splitType ??
      existing.splitType
    ) as SplitMode;

    const nextParticipants =
      data.participants ??
      existing.splits.map(
        (s: {
          userId: string;
          amountCents: number;
        }) => ({
          userId: s.userId,
          value: s.amountCents,
        }),
      );

    const splits = computeSplits(
      nextAmount,
      nextSplitType,
      nextParticipants,
    );

    /*
     * IMPORTANT:
     * Do not annotate tx as typeof prisma.
     * Prisma automatically infers the correct
     * transaction-scoped client type.
     */
    const expense =
      await prisma.$transaction(async (tx) => {
        await tx.expenseSplit.deleteMany({
          where: {
            expenseId: params.expenseId,
          },
        });

        return tx.expense.update({
          where: {
            id: params.expenseId,
          },

          data: {
            amountCents: nextAmount,

            description:
              data.description ??
              existing.description,

            category:
              data.category ??
              existing.category,

            paidById:
              data.paidById ??
              existing.paidById,

            splitType: nextSplitType,

            date: data.date
              ? new Date(data.date)
              : existing.date,

            splits: {
              create: splits,
            },
          },

          include: {
            paidBy: {
              select: {
                id: true,
                name: true,
                avatarUrl: true,
              },
            },

            splits: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    avatarUrl: true,
                  },
                },
              },
            },
          },
        });
      });

    emitToGroup(
      params.groupId,
      "expense:updated",
      {
        expense,
      },
    );

    return NextResponse.json({
      expense,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        {
          error: err.message,
        },
        {
          status: err.status,
        },
      );
    }

    if (err instanceof Error) {
      return NextResponse.json(
        {
          error: err.message,
        },
        {
          status: 400,
        },
      );
    }

    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: {
    params: {
      groupId: string;
      expenseId: string;
    };
  },
) {
  try {
    const userId = await requireUserId();

    const existing =
      await prisma.expense.findUniqueOrThrow({
        where: {
          id: params.expenseId,
        },
      });

    await assertCanEdit(
      userId,
      params.groupId,
      existing.paidById,
    );

    await prisma.expense.delete({
      where: {
        id: params.expenseId,
      },
    });

    emitToGroup(
      params.groupId,
      "expense:deleted",
      {
        expenseId: params.expenseId,
      },
    );

    return NextResponse.json({
      ok: true,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        {
          error: err.message,
        },
        {
          status: err.status,
        },
      );
    }

    throw err;
  }
}