/**
 * "Explore" data source: OpenStreetMap via Nominatim (geocoding) + Overpass
 * (POI search). No API key required, unlike Google Places — see the project
 * brief's decision to avoid a paid/keyed provider.
 *
 * Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
 * requires a descriptive User-Agent and caps usage at ~1 req/sec, which is
 * fine for this app's on-demand, per-user-click search pattern. If this ever
 * needs to scale up, swap the fetch calls below for a hosted Nominatim/Overpass
 * instance or a keyed provider — everything downstream consumes the same
 * `Place` shape, so no other code needs to change.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "TripPool/1.0 (https://github.com/trippool; contact@example.com)";

export type PlaceCategory = "stay" | "restaurant" | "attraction";

export type GeocodeResult = {
  name: string;
  lat: number;
  lon: number;
};

export type Place = {
  /** OSM element reference, e.g. "node/123456" or "way/98765". Stable, used as the save key. */
  externalId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string | null;
  distanceMeters: number;
  /** Free-form OSM tags worth surfacing: cuisine, stars, phone, website, opening_hours, wikipedia. */
  tags: Record<string, string>;
};

export class PlacesError extends Error {}

/** Turns a free-text location ("Lisbon, Portugal") into coordinates. */
export async function geocode(query: string): Promise<GeocodeResult> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new PlacesError(`Geocoding service returned ${res.status}`);

  const results = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  if (results.length === 0) throw new PlacesError(`Couldn't find a location matching "${query}".`);

  const [top] = results;
  return { name: top.display_name, lat: parseFloat(top.lat), lon: parseFloat(top.lon) };
}

/** Great-circle distance in meters between two lat/lon points. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Best-effort mapping from an OSM class/type pair to one of our categories, for free-text search results. */
export function inferCategory(osmClass: string, osmType: string): PlaceCategory | null {
  if (osmClass === "tourism" && ["hotel", "guest_house", "hostel", "motel", "apartment"].includes(osmType)) {
    return "stay";
  }
  if (osmClass === "amenity" && ["restaurant", "cafe", "fast_food", "pub", "bar"].includes(osmType)) {
    return "restaurant";
  }
  if (
    osmClass === "historic" ||
    (osmClass === "tourism" &&
      ["attraction", "museum", "gallery", "viewpoint", "zoo", "theme_park", "artwork"].includes(osmType))
  ) {
    return "attraction";
  }
  return null;
}

export type SearchResult = Omit<Place, "category"> & {
  /** null when the place doesn't map cleanly onto stay/restaurant/attraction — the UI lets the user pick a category before saving. */
  category: PlaceCategory | null;
};

/**
 * Free-text search for a specific named place ("Pastéis de Belém", "Eiffel Tower") —
 * for when someone wants a particular spot rather than a nearby-search result.
 * If `near` is given, results are sorted by distance from it; otherwise they're
 * left in Nominatim's own relevance order.
 */
export async function searchPlacesByName(query: string, near?: { lat: number; lon: number }): Promise<SearchResult[]> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new PlacesError(`Places search returned ${res.status}`);

  const results = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    class: string;
    type: string;
    address?: Record<string, string>;
  }>;

  const places: SearchResult[] = results.map((r) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    const category = inferCategory(r.class, r.type);
    return {
      externalId: `nominatim/${r.place_id}`,
      name: r.display_name.split(",")[0],
      category,
      lat,
      lon,
      address: r.display_name,
      distanceMeters: near ? Math.round(haversineMeters(near.lat, near.lon, lat, lon)) : 0,
      tags: {},
    };
  });

  return near ? [...places].sort((a, b) => a.distanceMeters - b.distanceMeters) : places;
}

/** The Overpass tag filter for each category we support. */
const CATEGORY_FILTERS: Record<PlaceCategory, string[]> = {
  stay: ['["tourism"~"^(hotel|guest_house|hostel|motel|apartment)$"]'],
  restaurant: ['["amenity"~"^(restaurant|cafe|fast_food|pub|bar)$"]'],
  attraction: [
    '["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park|artwork)$"]',
    '["historic"]',
  ],
};

function buildOverpassQuery(lat: number, lon: number, radiusMeters: number, category: PlaceCategory): string {
  const filters = CATEGORY_FILTERS[category];
  const clauses = filters
    .map(
      (filter) => `
      node${filter}(around:${radiusMeters},${lat},${lon});
      way${filter}(around:${radiusMeters},${lat},${lon});
    `
    )
    .join("\n");

  return `[out:json][timeout:25];(${clauses});out center tags;`;
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function addressFromTags(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:housenumber"] && tags["addr:street"] ? `${tags["addr:housenumber"]} ${tags["addr:street"]}` : tags["addr:street"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Searches OpenStreetMap for POIs of the given category near (lat, lon).
 * Results are sorted nearest-first, except for "attraction" where places
 * with a `wikipedia`/`wikidata` tag (a decent proxy for "notable enough to
 * have a Wikipedia entry") are ranked ahead of undocumented ones before the
 * distance sort — Overpass has no popularity/rating signal of its own.
 */
export async function searchNearby(opts: {
  lat: number;
  lon: number;
  category: PlaceCategory;
  radiusMeters?: number;
  limit?: number;
}): Promise<Place[]> {
  const { lat, lon, category, radiusMeters = 4000, limit = category === "attraction" ? 10 : 20 } = opts;

  const query = buildOverpassQuery(lat, lon, radiusMeters, category);
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "text/plain" },
    body: query,
  });
  if (!res.ok) throw new PlacesError(`Places search returned ${res.status}`);

  const data = (await res.json()) as { elements: OverpassElement[] };

  const places: Place[] = data.elements
    .filter((el) => el.tags?.name) // unnamed POIs aren't useful to show
    .map((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      const tags = el.tags ?? {};
      return elLat != null && elLon != null
        ? {
            externalId: `${el.type}/${el.id}`,
            name: tags.name,
            category,
            lat: elLat,
            lon: elLon,
            address: addressFromTags(tags),
            distanceMeters: Math.round(haversineMeters(lat, lon, elLat, elLon)),
            tags,
          }
        : null;
    })
    .filter((p): p is Place => p !== null);

  const ranked = rankPlaces(places, category);
  return ranked.slice(0, limit);
}

/** Sort helper, exported separately so it's unit-testable without network access. */
export function rankPlaces(places: Place[], category: PlaceCategory): Place[] {
  const notable = (p: Place) => (p.tags.wikipedia || p.tags.wikidata ? 0 : 1);
  return [...places].sort((a, b) => {
    if (category === "attraction") {
      const notabilityDiff = notable(a) - notable(b);
      if (notabilityDiff !== 0) return notabilityDiff;
    }
    return a.distanceMeters - b.distanceMeters;
  });
}
