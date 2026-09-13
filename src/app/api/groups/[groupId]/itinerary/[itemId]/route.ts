import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const updateItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  time: z.string().max(20).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  /** Swap sort position with the item directly above/below it, within the same day. */
  moveDirection: z.enum(["up", "down"]).optional(),
});

const include = {
  savedPlace: { select: { id: true, name: true, category: true, address: true, lat: true, lon: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

export async function PATCH(req: NextRequest, { params }: { params: { groupId: string; itemId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const item = await prisma.itineraryItem.findUnique({ where: { id: params.itemId } });
    if (!item || item.groupId !== params.groupId) {
      throw new ApiError(404, "Itinerary item not found.");
    }

    const parsed = updateItemSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const { moveDirection, ...fields } = parsed.data;

    if (moveDirection) {
      const neighbor = await prisma.itineraryItem.findFirst({
        where: {
          groupId: params.groupId,
          date: item.date,
          order: moveDirection === "up" ? { lt: item.order } : { gt: item.order },
        },
        orderBy: { order: moveDirection === "up" ? "desc" : "asc" },
      });
      if (neighbor) {
        await prisma.$transaction([
          prisma.itineraryItem.update({ where: { id: item.id }, data: { order: neighbor.order } }),
          prisma.itineraryItem.update({ where: { id: neighbor.id }, data: { order: item.order } }),
        ]);
      }
    }

    const updated = await prisma.itineraryItem.update({
      where: { id: params.itemId },
      data: fields,
      include,
    });

    emitToGroup(params.groupId, "itinerary:updated", { item: updated });
    return NextResponse.json({ item: updated });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Anyone who created the item, or a group admin, can remove it. */
export async function DELETE(_req: NextRequest, { params }: { params: { groupId: string; itemId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);

    const item = await prisma.itineraryItem.findUnique({ where: { id: params.itemId } });
    if (!item || item.groupId !== params.groupId) {
      throw new ApiError(404, "Itinerary item not found.");
    }
    if (item.createdById !== userId && membership.role !== "admin") {
      throw new ApiError(403, "Only the person who added this item, or a group admin, can remove it.");
    }

    await prisma.itineraryItem.delete({ where: { id: params.itemId } });
    emitToGroup(params.groupId, "itinerary:deleted", { itemId: params.itemId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
