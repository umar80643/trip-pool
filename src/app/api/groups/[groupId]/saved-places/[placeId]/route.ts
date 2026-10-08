import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";

/** The member who saved a place, or a group admin, can remove it. */
export async function DELETE(_req: NextRequest, { params }: { params: { groupId: string; placeId: string } }) {
  try {
    const userId = await requireUserId();
    const membership = await requireGroupMember(userId, params.groupId);

    const savedPlace = await prisma.savedPlace.findUnique({ where: { id: params.placeId } });
    if (!savedPlace || savedPlace.groupId !== params.groupId) {
      throw new ApiError(404, "Saved place not found.");
    }
    if (savedPlace.savedById !== userId && membership.role !== "admin") {
      throw new ApiError(403, "Only the person who saved this place, or a group admin, can remove it.");
    }

    await prisma.savedPlace.delete({ where: { id: params.placeId } });
    emitToGroup(params.groupId, "place:removed", { placeId: params.placeId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
