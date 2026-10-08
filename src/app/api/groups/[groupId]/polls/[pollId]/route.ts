import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

/** Close a poll early. Only the poll's creator or a group admin can do this. */
export async function PATCH(_req: NextRequest, { params }: { params: { groupId: string; pollId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);

    const poll = await prisma.poll.findUnique({ where: { id: params.pollId } });
    if (!poll || poll.groupId !== params.groupId) throw new ApiError(404, "Poll not found.");
    if (poll.createdById !== userId && membership.role !== "admin") {
      throw new ApiError(403, "Only the poll's creator or a group admin can close it.");
    }

    const updated = await prisma.poll.update({ where: { id: params.pollId }, data: { closedAt: new Date() } });
    emitToGroup(params.groupId, "poll:closed", { pollId: updated.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Delete a poll entirely. Same permission as closing it. */
export async function DELETE(_req: NextRequest, { params }: { params: { groupId: string; pollId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);

    const poll = await prisma.poll.findUnique({ where: { id: params.pollId } });
    if (!poll || poll.groupId !== params.groupId) throw new ApiError(404, "Poll not found.");
    if (poll.createdById !== userId && membership.role !== "admin") {
      throw new ApiError(403, "Only the poll's creator or a group admin can delete it.");
    }

    await prisma.poll.delete({ where: { id: params.pollId } });
    emitToGroup(params.groupId, "poll:deleted", { pollId: params.pollId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
