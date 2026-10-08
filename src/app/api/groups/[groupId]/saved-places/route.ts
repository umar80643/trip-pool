import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

const savePlaceSchema = z.object({
  category: z.enum(["stay", "restaurant", "attraction"]),
  externalId: z.string().min(1),
  name: z.string().min(1).max(200),
  address: z.string().max(300).nullable().optional(),
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string()).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") ?? undefined;

    const savedPlaces = await prisma.savedPlace.findMany({
      where: { groupId: params.groupId, ...(category ? { category } : {}) },
      include: { savedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ savedPlaces });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = savePlaceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const data = parsed.data;

    const savedPlace = await prisma.savedPlace.upsert({
      where: {
        groupId_category_externalId: { groupId: params.groupId, category: data.category, externalId: data.externalId },
      },
      update: {},
      create: {
        groupId: params.groupId,
        category: data.category,
        externalId: data.externalId,
        name: data.name,
        address: data.address ?? null,
        lat: data.lat,
        lon: data.lon,
        tags: data.tags ?? {},
        savedById: userId,
      },
      include: { savedBy: { select: { id: true, name: true } } },
    });

    emitToGroup(params.groupId, "place:saved", { savedPlace });
    return NextResponse.json({ savedPlace }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
