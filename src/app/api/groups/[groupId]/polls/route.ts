import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";
import { isPollClosed } from "@/lib/polls";

const createPollSchema = z.object({
  question: z.string().trim().min(1).max(300),
  allowMultiple: z.boolean().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(200),
        savedPlaceId: z.string().nullable().optional(),
      })
    )
    .min(2, "A poll needs at least 2 options")
    .max(10, "A poll can have at most 10 options"),
});

const include = {
  createdBy: { select: { id: true, name: true } },
  options: {
    include: { votes: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { order: "asc" as const },
  },
};

export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const polls = await prisma.poll.findMany({
      where: { groupId: params.groupId },
      include,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      polls: polls.map((p: { closedAt: Date | null; closesAt: Date | null } & Record<string, unknown>) => ({
        ...p,
        isClosed: isPollClosed(p),
      })),
    });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = createPollSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;

    // Any savedPlaceId referenced must actually belong to this group.
    const placeIds = data.options.map((o) => o.savedPlaceId).filter((id): id is string => !!id);
    if (placeIds.length > 0) {
      const places = await prisma.savedPlace.findMany({ where: { id: { in: placeIds }, groupId: params.groupId } });
      if (places.length !== new Set(placeIds).size) {
        return NextResponse.json({ error: "One or more linked places don't belong to this trip." }, { status: 400 });
      }
    }

    const poll = await prisma.poll.create({
      data: {
        groupId: params.groupId,
        question: data.question,
        allowMultiple: data.allowMultiple ?? false,
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
        createdById: userId,
        options: {
          create: data.options.map((o, idx) => ({
            label: o.label,
            savedPlaceId: o.savedPlaceId ?? null,
            order: idx,
          })),
        },
      },
      include,
    });

    const pollWithStatus = { ...poll, isClosed: isPollClosed(poll) };
    emitToGroup(params.groupId, "poll:created", { poll: pollWithStatus });
    return NextResponse.json({ poll: pollWithStatus }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
