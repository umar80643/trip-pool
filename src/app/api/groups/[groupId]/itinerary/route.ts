import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";
import { dateKey, nextOrder } from "@/lib/itinerary";

const createItemSchema = z.object({
  date: z.string().datetime().or(z.string().date()),
  time: z.string().max(20).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(1000).nullable().optional(),
  savedPlaceId: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const items = await prisma.itineraryItem.findMany({
      where: { groupId: params.groupId },
      include: {
        savedPlace: { select: { id: true, name: true, category: true, address: true, lat: true, lon: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { order: "asc" }],
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

    if (data.savedPlaceId) {
      const place = await prisma.savedPlace.findUnique({ where: { id: data.savedPlaceId } });
      if (!place || place.groupId !== params.groupId) {
        return NextResponse.json({ error: "That saved place doesn't belong to this trip." }, { status: 400 });
      }
    }

    const date = new Date(dateKey(new Date(data.date)) + "T00:00:00.000Z");

    // Compute the next sort position by looking at existing items on the same day.
    const siblings = await prisma.itineraryItem.findMany({
      where: { groupId: params.groupId, date },
      select: { order: true },
    });

    const item = await prisma.itineraryItem.create({
      data: {
        groupId: params.groupId,
        date,
        time: data.time ?? null,
        title: data.title,
        notes: data.notes ?? null,
        savedPlaceId: data.savedPlaceId ?? null,
        order: nextOrder(siblings.map((s: { order: number }) => s.order)),
        createdById: userId,
      },
      include: {
        savedPlace: { select: { id: true, name: true, category: true, address: true, lat: true, lon: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    emitToGroup(params.groupId, "itinerary:created", { item });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
