import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";
import { isPollClosed } from "@/lib/polls";

const voteSchema = z.object({ optionId: z.string().min(1) });

const include = {
  createdBy: { select: { id: true, name: true } },
  options: {
    include: { votes: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { order: "asc" as const },
  },
};

/**
 * Toggles the current user's vote on an option:
 *  - not voted yet -> casts it (and, for single-choice polls, removes any
 *    other vote this user has elsewhere in the same poll first)
 *  - already voted -> removes it
 */
export async function POST(req: NextRequest, { params }: { params: { groupId: string; pollId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = voteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    const poll = await prisma.poll.findUnique({
      where: { id: params.pollId },
      include: { options: true },
    });
    if (!poll || poll.groupId !== params.groupId) throw new ApiError(404, "Poll not found.");
    if (isPollClosed(poll)) return NextResponse.json({ error: "This poll is closed." }, { status: 409 });

    const option = poll.options.find((o: { id: string }) => o.id === parsed.data.optionId);
    if (!option) throw new ApiError(404, "That option doesn't belong to this poll.");

    const existingVote = await prisma.pollVote.findUnique({
      where: { optionId_userId: { optionId: option.id, userId } },
    });

    if (existingVote) {
      await prisma.pollVote.delete({ where: { id: existingVote.id } });
    } else {
      await prisma.$transaction([
        ...(poll.allowMultiple
          ? []
          : [
              prisma.pollVote.deleteMany({
                where: { userId, optionId: { in: poll.options.map((o: { id: string }) => o.id) } },
              }),
            ]),
        prisma.pollVote.create({ data: { optionId: option.id, userId } }),
      ]);
    }

    const updated = await prisma.poll.findUniqueOrThrow({ where: { id: params.pollId }, include });
    const pollWithStatus = { ...updated, isClosed: isPollClosed(updated) };
    emitToGroup(params.groupId, "poll:voted", { poll: pollWithStatus });
    return NextResponse.json({ poll: pollWithStatus });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
