import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUserId, requireGroupMember, ApiError } from "@/lib/api-guard";
import { searchNearby, PlacesError, PlaceCategory } from "@/lib/places";

const categorySchema = z.enum(["stay", "restaurant", "attraction"]);

/**
 * GET /api/groups/:groupId/explore?category=stay|restaurant|attraction[&radius=meters][&lat=..&lon=..]
 *
 * Centers the search on the group's destination by default. Pass `lat`/`lon`
 * (e.g. from the browser's geolocation API) to search near the user's current
 * location instead — coordinates are used for this one request only and are
 * never persisted server-side.
 *
 * Live search, not persisted. Members save results they like via POST /saved-places.
 */
export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  try {
    const userId = await requireUserId();
    await requireGroupMember(userId, params.groupId);

    const { searchParams } = new URL(req.url);
    const parsedCategory = categorySchema.safeParse(searchParams.get("category"));
    if (!parsedCategory.success) {
      return NextResponse.json({ error: "category must be one of: stay, restaurant, attraction" }, { status: 400 });
    }
    const category = parsedCategory.data as PlaceCategory;

    const radiusParam = searchParams.get("radius");
    const radiusMeters = radiusParam ? Math.min(Math.max(parseInt(radiusParam, 10) || 4000, 500), 20000) : undefined;

    const latParam = searchParams.get("lat");
    const lonParam = searchParams.get("lon");
    const hasCoordOverride = latParam != null && lonParam != null;

    let lat: number;
    let lon: number;
    let locationLabel: string | null;

    if (hasCoordOverride) {
      lat = parseFloat(latParam);
      lon = parseFloat(lonParam);
      if (Number.isNaN(lat) || Number.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return NextResponse.json({ error: "Invalid lat/lon." }, { status: 400 });
      }
      locationLabel = "your current location";
    } else {
      const group = await prisma.group.findUniqueOrThrow({
        where: { id: params.groupId },
        select: { destinationLat: true, destinationLon: true, destinationName: true },
      });
      if (group.destinationLat == null || group.destinationLon == null) {
        return NextResponse.json(
          { error: "This trip doesn't have a destination set yet. Set one, or search near your current location." },
          { status: 400 }
        );
      }
      lat = group.destinationLat;
      lon = group.destinationLon;
      locationLabel = group.destinationName;
    }

    const places = await searchNearby({ lat, lon, category, radiusMeters });

    return NextResponse.json({ locationLabel, places });
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof PlacesError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
}
