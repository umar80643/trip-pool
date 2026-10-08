import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const createItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(999).default(1),
  isShared: z.boolean().default(false),
});

const include = {
  assignedTo: { select: { id: true, name: true } },
  addedBy: { select: { id: true, name: true } },
} as const;

/** Shared items, plus only the requesting member's own personal items — never anyone else's. */
export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const items = await prisma.packingItem.findMany({
      where: { groupId: params.groupId, OR: [{ assignedToId: null }, { assignedToId: userId }] },
      include,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = createItemSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;

    const item = await prisma.packingItem.create({
      data: {
        groupId: params.groupId,
        name: data.name,
        quantity: data.quantity,
        // Personal items always belong to whoever's adding them — this
        // endpoint has no way to assign an item onto someone else's list.
        assignedToId: data.isShared ? null : userId,
        addedById: userId,
      },
      include,
    });

    // Only shared items are broadcast — a personal item's name/quantity is
    // private to its owner, and every other member's browser is a live
    // socket subscriber to this room. Broadcasting it regardless (relying on
    // the UI to just not render it) would still leak the raw payload to
    // anyone inspecting their WebSocket frames. The item is still returned
    // directly to the requester below, so their own UI updates immediately.
    if (item.assignedToId === null) {
      emitToGroup(params.groupId, "packing:created", { item });
    }
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
