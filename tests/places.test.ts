import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  haversineMeters,
  rankPlaces,
  geocode,
  searchNearby,
  searchPlacesByName,
  inferCategory,
  PlacesError,
  Place,
} from "@/lib/places";

describe("haversineMeters", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMeters(38.7223, -9.1393, 38.7223, -9.1393)).toBe(0);
  });

  it("returns a sane distance for two known cities (Lisbon -> Porto, ~275km)", () => {
    const meters = haversineMeters(38.7223, -9.1393, 41.1579, -8.6291);
    expect(meters).toBeGreaterThan(270_000);
    expect(meters).toBeLessThan(285_000);
  });
});

function place(overrides: Partial<Place>): Place {
  return {
    externalId: "node/1",
    name: "Test place",
    category: "attraction",
    lat: 0,
    lon: 0,
    address: null,
    distanceMeters: 100,
    tags: {},
    ...overrides,
  };
}

describe("rankPlaces", () => {
  it("sorts by distance ascending for non-attraction categories", () => {
    const places = [place({ externalId: "a", distanceMeters: 500, category: "restaurant" }),
      place({ externalId: "b", distanceMeters: 100, category: "restaurant" })];
    const ranked = rankPlaces(places, "restaurant");
    expect(ranked.map((p) => p.externalId)).toEqual(["b", "a"]);
  });

  it("for attractions, ranks wikipedia/wikidata-tagged places ahead of undocumented ones regardless of distance", () => {
    const places = [
      place({ externalId: "close-undocumented", distanceMeters: 50, tags: {} }),
      place({ externalId: "far-notable", distanceMeters: 2000, tags: { wikipedia: "en:Some Place" } }),
    ];
    const ranked = rankPlaces(places, "attraction");
    expect(ranked.map((p) => p.externalId)).toEqual(["far-notable", "close-undocumented"]);
  });

  it("breaks ties within the same notability tier by distance", () => {
    const places = [
      place({ externalId: "notable-far", distanceMeters: 900, tags: { wikidata: "Q1" } }),
      place({ externalId: "notable-near", distanceMeters: 100, tags: { wikidata: "Q2" } }),
    ];
    const ranked = rankPlaces(places, "attraction");
    expect(ranked.map((p) => p.externalId)).toEqual(["notable-near", "notable-far"]);
  });
});

describe("geocode", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the top Nominatim result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: "Lisbon, Portugal", lat: "38.7223", lon: "-9.1393" }],
    }) as unknown as typeof fetch;

    const result = await geocode("Lisbon");
    expect(result).toEqual({ name: "Lisbon, Portugal", lat: 38.7223, lon: -9.1393 });
  });

  it("throws PlacesError when nothing matches", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    await expect(geocode("Nowhereville")).rejects.toBeInstanceOf(PlacesError);
  });

  it("throws PlacesError when the service errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    await expect(geocode("Lisbon")).rejects.toBeInstanceOf(PlacesError);
  });
});

describe("inferCategory", () => {
  it("maps tourism=hotel to stay", () => {
    expect(inferCategory("tourism", "hotel")).toBe("stay");
  });
  it("maps amenity=restaurant to restaurant", () => {
    expect(inferCategory("amenity", "restaurant")).toBe("restaurant");
  });
  it("maps tourism=museum and any historic=* to attraction", () => {
    expect(inferCategory("tourism", "museum")).toBe("attraction");
    expect(inferCategory("historic", "castle")).toBe("attraction");
  });
  it("returns null for anything unrecognized (e.g. a shop or admin boundary)", () => {
    expect(inferCategory("shop", "supermarket")).toBeNull();
    expect(inferCategory("boundary", "administrative")).toBeNull();
  });
});

describe("searchPlacesByName", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("maps Nominatim results to SearchResult, inferring category and leaving distance 0 without a `near` bias", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 42,
          display_name: "Pastéis de Belém, Lisbon, Portugal",
          lat: "38.6971",
          lon: "-9.2033",
          class: "amenity",
          type: "cafe",
        },
      ],
    }) as unknown as typeof fetch;

    const results = await searchPlacesByName("Pasteis de Belem");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "nominatim/42",
      name: "Pastéis de Belém",
      category: "restaurant",
      distanceMeters: 0,
    });
  });

  it("sorts by distance from `near` when provided, and leaves category null when unrecognized", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { place_id: 1, display_name: "Far shop", lat: "39.0", lon: "-9.0", class: "shop", type: "supermarket" },
        { place_id: 2, display_name: "Near hotel", lat: "38.7225", lon: "-9.1395", class: "tourism", type: "hotel" },
      ],
    }) as unknown as typeof fetch;

    const results = await searchPlacesByName("something", { lat: 38.7223, lon: -9.1393 });
    expect(results.map((r) => r.externalId)).toEqual(["nominatim/2", "nominatim/1"]);
    expect(results[0].category).toBe("stay");
    expect(results[1].category).toBeNull();
  });

  it("throws PlacesError when the service errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    await expect(searchPlacesByName("anything")).rejects.toBeInstanceOf(PlacesError);
  });
});

describe("searchNearby", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 38.7223,
            lon: -9.1393,
            tags: { name: "Castelo de S. Jorge", tourism: "attraction", wikipedia: "en:St George Castle" },
          },
          {
            type: "way",
            id: 2,
            center: { lat: 38.73, lon: -9.15 },
            tags: { name: "Unnamed-ish spot", tourism: "attraction" },
          },
          { type: "node", id: 3, lat: 38.7, lon: -9.1, tags: {} }, // no name -> filtered out
        ],
      }),
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("filters unnamed elements, computes distance, and ranks attractions by notability", async () => {
    const places = await searchNearby({ lat: 38.7223, lon: -9.1393, category: "attraction" });
    expect(places).toHaveLength(2);
    expect(places[0].externalId).toBe("node/1"); // has wikipedia tag, ranked first
    expect(places[0].distanceMeters).toBe(0);
    expect(places[1].externalId).toBe("way/2");
  });
});
