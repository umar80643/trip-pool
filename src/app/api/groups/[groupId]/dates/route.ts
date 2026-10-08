import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { emitToGroup } from "@/lib/realtime-emit";
import { tripDays, InvalidDateRangeError } from "@/lib/itinerary";

const setDatesSchema = z.object({
  startDate: z.string().datetime().or(z.string().date()),
  endDate: z.string().datetime().or(z.string().date()),
});

/** Any member can set the trip's dates, same as the destination. */
export async function PATCH(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const parsed = setDatesSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const startDate = new Date(parsed.data.startDate);
    const endDate = new Date(parsed.data.endDate);

    try {
      tripDays(startDate, endDate); // validates the range; throws on bad input
    } catch (err) {
      if (err instanceof InvalidDateRangeError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const group = await prisma.group.update({
      where: { id: params.groupId },
      data: { startDate, endDate },
    });

    emitToGroup(group.id, "group:updated", { group });
    return NextResponse.json({ group });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
