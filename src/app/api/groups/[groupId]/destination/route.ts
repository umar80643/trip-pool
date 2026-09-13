import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";
import { geocode, PlacesError } from "@/lib/places";

const setDestinationSchema = z.object({
  destinationName: z.string().min(1).max(200),
});

/** Any member can set the trip's destination — not admin-gated, same as adding an expense. */
export async function PATCH(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = setDestinationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const geo = await geocode(parsed.data.destinationName);

    const group = await prisma.group.update({
      where: { id: params.groupId },
      data: { destinationName: geo.name, destinationLat: geo.lat, destinationLon: geo.lon },
    });

    emitToGroup(group.id, "group:updated", { group });
    return NextResponse.json({ group });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
