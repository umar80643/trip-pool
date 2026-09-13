import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const updateItemSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  quantity: z.number().int().min(1).max(999).optional(),
  isPacked: z.boolean().optional(),
});

const include = {
  assignedTo: { select: { id: true, name: true } },
  addedBy: { select: { id: true, name: true } },
} as const;

/** Shared items (assignedToId null) are editable by any member; personal items only by their owner or a group admin. */
async function assertCanModify(itemAssignedToId: string | null, userId: string, role: string) {
  if (itemAssignedToId === null) return; // shared — any member may edit
  if (itemAssignedToId === userId || role === "admin") return;
  throw new ApiError(403, "That's on someone else's personal packing list.");
}

export async function PATCH(req: NextRequest, { params }: { params: { groupId: string; itemId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);

    const item = await prisma.packingItem.findUnique({ where: { id: params.itemId } });
    if (!item || item.groupId !== params.groupId) {
      throw new ApiError(404, "Packing item not found.");
    }
    await assertCanModify(item.assignedToId, userId, membership.role);

    const parsed = updateItemSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const updated = await prisma.packingItem.update({ where: { id: params.itemId }, data: parsed.data, include });

    // See the POST handler in ../route.ts for why personal items are never broadcast.
    if (updated.assignedToId === null) {
      emitToGroup(params.groupId, "packing:updated", { item: updated });
    }
    return NextResponse.json({ item: updated });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { groupId: string; itemId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);

    const item = await prisma.packingItem.findUnique({ where: { id: params.itemId } });
    if (!item || item.groupId !== params.groupId) {
      throw new ApiError(404, "Packing item not found.");
    }
    await assertCanModify(item.assignedToId, userId, membership.role);

    await prisma.packingItem.delete({ where: { id: params.itemId } });
    // See the POST handler in ../route.ts for why personal items are never broadcast.
    if (item.assignedToId === null) {
      emitToGroup(params.groupId, "packing:deleted", { itemId: params.itemId });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
