import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, requireAdmin, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().length(3).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const group = await prisma.group.findUniqueOrThrow({
      where: { id: params.groupId },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } } },
      },
    });
    return NextResponse.json({ group });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);
    requireAdmin(membership);

    const parsed = updateGroupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const group = await prisma.group.update({ where: { id: params.groupId }, data: parsed.data });
    emitToGroup(group.id, "group:updated", { group });
    return NextResponse.json({ group });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);
    requireAdmin(membership);

    await prisma.group.delete({ where: { id: params.groupId } });
    emitToGroup(params.groupId, "group:deleted", { groupId: params.groupId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
