import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { searchPlacesByName, PlacesError } from "@/lib/places";

/**
 * GET /api/groups/:groupId/explore/search?q=...[&lat=..&lon=..]
 *
 * Free-text search for a specific named place, e.g. "Pastéis de Belém" — for
 * when a member wants a particular spot rather than a nearby-search result.
 * Distance is computed against `lat`/`lon` if given (e.g. the user's current
 * location), falling back to the trip's destination, or omitted if neither
 * is available.
 */
export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ error: "Enter at least 2 characters to search." }, { status: 400 });
    }

    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    let near: { lat: number; lon: number } | undefined;

    if (latParam != null && lonParam != null) {
      const lat = parseFloat(latParam);
      const lon = parseFloat(lonParam);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) near = { lat, lon };
    }

    if (!near) {
      const group = await prisma.group.findUniqueOrThrow({
        where: { id: params.groupId },
        select: { destinationLat: true, destinationLon: true },
      });
      if (group.destinationLat != null && group.destinationLon != null) {
        near = { lat: group.destinationLat, lon: group.destinationLon };
      }
    }

    const results = await searchPlacesByName(q, near);
    return NextResponse.json({ results });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
