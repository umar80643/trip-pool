/**
 * TripPool Places Service
 *
 * Nominatim:
 *   - destination geocoding
 *   - named place search
 *
 * Geoapify:
 *   - dynamic nearby restaurants
 *   - hotels/accommodation
 *   - attractions
 *
 * PostgreSQL:
 *   - persistent ExploreCache
 */

import { prisma } from "@/lib/prisma";

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const GEOAPIFY_PLACES_URL =
  "https://api.geoapify.com/v2/places";

const GEOAPIFY_API_KEY =
  process.env.GEOAPIFY_API_KEY;

const USER_AGENT =
  process.env.OSM_USER_AGENT ||
  "TripPool/1.0 (local development)";

export type PlaceCategory =
  | "stay"
  | "restaurant"
  | "attraction";

export type GeocodeResult = {
  name: string;
  lat: number;
  lon: number;
};

export type Place = {
  externalId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string | null;
  distanceMeters: number;
  tags: Record<string, string>;
};

export type SearchResult =
  Omit<Place, "category"> & {
    category: PlaceCategory | null;
  };

export class PlacesError extends Error {}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

function getGeoapifyApiKey(): string {
  if (!GEOAPIFY_API_KEY) {
    throw new PlacesError(
      "GEOAPIFY_API_KEY is missing from .env",
    );
  }

  return GEOAPIFY_API_KEY;
}

/* -------------------------------------------------------------------------- */
/* Geocoding                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Converts a destination such as:
 *
 *   Mumbai
 *   New Delhi
 *   London
 *   Dubai
 *
 * into coordinates.
 *
 * Uses Nominatim because your existing destination flow
 * already depends on it and it has a simple response shape.
 */
export async function geocode(
  query: string,
): Promise<GeocodeResult> {
  const url = new URL(
    NOMINATIM_URL,
  );

  url.searchParams.set(
    "q",
    query,
  );

  url.searchParams.set(
    "format",
    "jsonv2",
  );

  url.searchParams.set(
    "limit",
    "1",
  );

  const res = await fetch(
    url.toString(),
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },

      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new PlacesError(
      `Geocoding service returned ${res.status}`,
    );
  }

  const results =
    (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

  if (results.length === 0) {
    throw new PlacesError(
      `Couldn't find a location matching "${query}".`,
    );
  }

  const [top] = results;

  return {
    name: top.display_name,
    lat: parseFloat(top.lat),
    lon: parseFloat(top.lon),
  };
}

/* -------------------------------------------------------------------------- */
/* Distance                                                                    */
/* -------------------------------------------------------------------------- */

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;

  const toRad = (d: number) =>
    (d * Math.PI) / 180;

  const dLat = toRad(
    lat2 - lat1,
  );

  const dLon = toRad(
    lon2 - lon1,
  );

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    R *
    Math.asin(Math.sqrt(a))
  );
}

/* -------------------------------------------------------------------------- */
/* Category inference                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Supports both:
 *
 * Old/test style:
 *   inferCategory("tourism", "hotel")
 *
 * New Geoapify style:
 *   inferCategory(["accommodation.hotel"])
 */
export function inferCategory(
  categories: string[],
): PlaceCategory | null;

export function inferCategory(
  osmClass: string,
  osmType: string,
): PlaceCategory | null;

export function inferCategory(
  first: string | string[],
  second?: string,
): PlaceCategory | null {
  let categories: string[];

  if (Array.isArray(first)) {
    categories = first;
  } else {
    categories = [
      `${first}.${second ?? ""}`,
      first,
      second ?? "",
    ];
  }

  /* ------------------------------------------------------------------------ */
  /* Hotels / accommodation                                                   */
  /* ------------------------------------------------------------------------ */

  if (
    categories.some(
      (category) =>
        category.startsWith(
          "accommodation",
        ) ||
        category ===
          "tourism.hotel" ||
        category ===
          "tourism.guest_house" ||
        category ===
          "tourism.hostel" ||
        category ===
          "tourism.motel" ||
        category ===
          "tourism.apartment",
    )
  ) {
    return "stay";
  }

  /* ------------------------------------------------------------------------ */
  /* Restaurants / food                                                       */
  /* ------------------------------------------------------------------------ */

  if (
    categories.some(
      (category) =>
        category.startsWith(
          "catering.restaurant",
        ) ||
        category.startsWith(
          "catering.cafe",
        ) ||
        category.startsWith(
          "catering.fast_food",
        ) ||
        category.startsWith(
          "catering.bar",
        ) ||
        category.startsWith(
          "catering.pub",
        ) ||
        category ===
          "amenity.restaurant" ||
        category ===
          "amenity.cafe" ||
        category ===
          "amenity.fast_food" ||
        category ===
          "amenity.bar" ||
        category ===
          "amenity.pub",
    )
  ) {
    return "restaurant";
  }

  /* ------------------------------------------------------------------------ */
  /* Attractions                                                               */
  /* ------------------------------------------------------------------------ */

  if (
    categories.some(
      (category) =>
        category.startsWith(
          "tourism",
        ) ||
        category.startsWith(
          "entertainment",
        ) ||
        category ===
          "historic.castle" ||
        category ===
          "historic.monument" ||
        category ===
          "historic.memorial" ||
        category ===
          "historic.archaeological_site" ||
        category ===
          "historic.fort" ||
        category ===
          "historic.tomb" ||
        category ===
          "historic.ruins" ||
        category ===
          "historic.city_gate" ||
        category ===
          "historic.palace",
    )
  ) {
    return "attraction";
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Search specific place by name                                              */
/* -------------------------------------------------------------------------- */

/**
 * Example:
 *
 *   searchPlacesByName("Eiffel Tower")
 *   searchPlacesByName("Taj Mahal")
 *   searchPlacesByName("Taj Mahal", {lat, lon})
 */
export async function searchPlacesByName(
  query: string,
  near?: {
    lat: number;
    lon: number;
  },
): Promise<SearchResult[]> {
  const url = new URL(
    NOMINATIM_URL,
  );

  url.searchParams.set(
    "q",
    query,
  );

  url.searchParams.set(
    "format",
    "jsonv2",
  );

  url.searchParams.set(
    "limit",
    "8",
  );

  url.searchParams.set(
    "addressdetails",
    "1",
  );

  const res = await fetch(
    url.toString(),
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },

      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new PlacesError(
      `Places search returned ${res.status}`,
    );
  }

  const results =
    (await res.json()) as Array<{
      place_id: number;
      display_name: string;
      lat: string;
      lon: string;
      class: string;
      type: string;
    }>;

  const places: SearchResult[] =
    results.map((result) => {
      const lat =
        parseFloat(result.lat);

      const lon =
        parseFloat(result.lon);

      const category =
        inferCategory(
          result.class,
          result.type,
        );

      return {
        externalId:
          `nominatim/${result.place_id}`,

        name:
          result.display_name.split(
            ",",
          )[0],

        category,

        lat,

        lon,

        address:
          result.display_name,

        distanceMeters: near
          ? Math.round(
              haversineMeters(
                near.lat,
                near.lon,
                lat,
                lon,
              ),
            )
          : 0,

        tags: {},
      };
    });

  if (!near) {
    return places;
  }

  return [...places].sort(
    (a, b) =>
      a.distanceMeters -
      b.distanceMeters,
  );
}

/* -------------------------------------------------------------------------- */
/* Geoapify categories                                                        */
/* -------------------------------------------------------------------------- */

const GEOAPIFY_CATEGORIES: Record<
  PlaceCategory,
  string[]
> = {
  /*
   * Hotels, hostels, guest houses,
   * motels, apartments and other
   * accommodation-related places.
   */
  stay: [
    "accommodation",
  ],

  /*
   * Restaurants, cafes and fast food.
   */
  restaurant: [
    "catering.restaurant",
    "catering.cafe",
    "catering.fast_food",
  ],

  /*
   * Tourist attractions plus
   * entertainment destinations.
   */
  attraction: [
    "tourism",
    "entertainment",
  ],
};

/* -------------------------------------------------------------------------- */
/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

/**
 * Prevent duplicate requests when the same
 * location/category is requested simultaneously.
 */
const inFlightRequests =
  new Map<
    string,
    Promise<Place[]>
  >();

function createCacheKey(
  lat: number,
  lon: number,
  category: PlaceCategory,
  radiusMeters: number,
): string {
  return [
    "geoapify",
    category,
    lat.toFixed(3),
    lon.toFixed(3),
    radiusMeters,
  ].join(":");
}

/* -------------------------------------------------------------------------- */
/* Geoapify API                                                               */
/* -------------------------------------------------------------------------- */

async function fetchGeoapifyPlaces(
  lat: number,
  lon: number,
  category: PlaceCategory,
  radiusMeters: number,
  limit: number,
): Promise<Place[]> {
  const apiKey =
    getGeoapifyApiKey();

  const url = new URL(
    GEOAPIFY_PLACES_URL,
  );

  url.searchParams.set(
    "categories",
    GEOAPIFY_CATEGORIES[
      category
    ].join(","),
  );

  /*
   * circle format:
   *
   * circle:longitude,latitude,radius
   */
  url.searchParams.set(
    "filter",
    `circle:${lon},${lat},${radiusMeters}`,
  );

  /*
   * Ask provider to prioritize
   * locations near the destination.
   */
  url.searchParams.set(
    "bias",
    `proximity:${lon},${lat}`,
  );

  /*
   * Geoapify supports up to 500.
   */
  url.searchParams.set(
    "limit",
    String(
      Math.min(
        Math.max(limit, 1),
        500,
      ),
    ),
  );

  url.searchParams.set(
    "lang",
    "en",
  );

  url.searchParams.set(
    "apiKey",
    apiKey,
  );

  const res = await fetch(
    url.toString(),
    {
      headers: {
        Accept:
          "application/json",
      },

      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body =
      await res.text();

    throw new PlacesError(
      `Geoapify Places API returned ${res.status}: ${body.slice(
        0,
        300,
      )}`,
    );
  }

  const data =
    (await res.json()) as {
      features?: Array<{
        type: "Feature";

        properties: {
          place_id?: string;

          name?: string;

          formatted?: string;

          address_line1?: string;

          lat: number;

          lon: number;

          distance?: number;

          categories?: string[];

          website?: string;

          phone?: string;

          opening_hours?: string;
        };
      }>;
    };

  const features =
    data.features ?? [];

  /*
   * Remove unnamed places.
   */
  return features
    .filter(
      (feature) =>
        Boolean(
          feature.properties.name ??
            feature.properties
              .address_line1 ??
            feature.properties
              .formatted,
        ),
    )
    .map(
      (feature): Place => {
        const p =
          feature.properties;

        const categories =
          p.categories ?? [];

        const placeLat =
          Number(p.lat);

        const placeLon =
          Number(p.lon);

        const distance =
          p.distance ??
          haversineMeters(
            lat,
            lon,
            placeLat,
            placeLon,
          );

        return {
          externalId:
            `geoapify/${
              p.place_id ??
              `${placeLat}:${placeLon}`
            }`,

          name:
            p.name ??
            p.address_line1 ??
            p.formatted ??
            "Unnamed place",

          category,

          lat: placeLat,

          lon: placeLon,

          address:
            p.formatted ??
            null,

          distanceMeters:
            Math.round(distance),

          tags: {
            categories:
              categories.join(","),

            ...(p.website
              ? {
                  website:
                    p.website,
                }
              : {}),

            ...(p.phone
              ? {
                  phone:
                    p.phone,
                }
              : {}),

            ...(p.opening_hours
              ? {
                  opening_hours:
                    p.opening_hours,
                }
              : {}),
          },
        };
      },
    );
}

/* -------------------------------------------------------------------------- */
/* Nearby search                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Dynamic worldwide nearby search.
 *
 * Works for:
 *
 *   Mumbai
 *   Delhi
 *   London
 *   Paris
 *   Dubai
 *   New York
 *   Tokyo
 *   etc.
 *
 * PostgreSQL is used as a persistent cache.
 */
export async function searchNearby(
  opts: {
    lat: number;
    lon: number;

    category: PlaceCategory;

    radiusMeters?: number;

    limit?: number;
  },
): Promise<Place[]> {
  const {
    lat,
    lon,
    category,

    radiusMeters = 5000,

    limit = 100,
  } = opts;

  const cacheKey =
    createCacheKey(
      lat,
      lon,
      category,
      radiusMeters,
    );

  /* ------------------------------------------------------------------------ */
  /* 1. PostgreSQL cache                                                     */
  /* ------------------------------------------------------------------------ */

  const cached =
    await prisma.exploreCache.findUnique(
      {
        where: {
          cacheKey,
        },
      },
    );

  if (cached) {
    const age =
      Date.now() -
      cached.updatedAt.getTime();

    /*
     * Return fresh cached results.
     */
    if (
      age < CACHE_TTL_MS
    ) {
      const places =
        cached.places as unknown as Place[];

      return rankPlaces(
        places,
        category,
      ).slice(
        0,
        limit,
      );
    }
  }

  /* ------------------------------------------------------------------------ */
  /* 2. Prevent duplicate requests                                            */
  /* ------------------------------------------------------------------------ */

  const existing =
    inFlightRequests.get(
      cacheKey,
    );

  if (existing) {
    return existing;
  }

  /* ------------------------------------------------------------------------ */
  /* 3. Dynamic Geoapify search                                               */
  /* ------------------------------------------------------------------------ */

  const requestPromise =
    (async () => {
      const places =
        await fetchGeoapifyPlaces(
          lat,
          lon,
          category,
          radiusMeters,
          Math.min(
            limit,
            500,
          ),
        );

      /*
       * Save in PostgreSQL.
       */
      await prisma.exploreCache.upsert(
        {
          where: {
            cacheKey,
          },

          create: {
            cacheKey,

            category,

            latitude: lat,

            longitude: lon,

            places,
          },

          update: {
            category,

            latitude: lat,

            longitude: lon,

            places,
          },
        },
      );

      return rankPlaces(
        places,
        category,
      ).slice(
        0,
        limit,
      );
    })();

  inFlightRequests.set(
    cacheKey,
    requestPromise,
  );

  try {
    return await requestPromise;
  } finally {
    inFlightRequests.delete(
      cacheKey,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Attractions:
 *   1. Wikipedia/Wikidata tagged places
 *   2. distance
 *
 * Restaurants/hotels:
 *   1. distance
 */
export function rankPlaces(
  places: Place[],
  category: PlaceCategory,
): Place[] {
  const notable = (
    place: Place,
  ): number =>
    place.tags.wikipedia ||
    place.tags.wikidata
      ? 0
      : 1;

  return [...places].sort(
    (a, b) => {
      if (
        category ===
        "attraction"
      ) {
        const notabilityDiff =
          notable(a) -
          notable(b);

        if (
          notabilityDiff !== 0
        ) {
          return notabilityDiff;
        }
      }

      return (
        a.distanceMeters -
        b.distanceMeters
      );
    },
  );
}