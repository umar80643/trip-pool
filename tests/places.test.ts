import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  mockFindUnique,
  mockUpsert,
} = vi.hoisted(() => {
  /*
   * IMPORTANT:
   * places.ts reads GEOAPIFY_API_KEY when the module is loaded.
   * Set the test key before dynamically importing places.ts.
   */
  process.env.GEOAPIFY_API_KEY =
    "test-geoapify-key";

  process.env.OSM_USER_AGENT =
    "TripPool/Test";

  return {
    mockFindUnique: vi.fn(),
    mockUpsert: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    exploreCache: {
      findUnique: mockFindUnique,
      upsert: mockUpsert,
    },
  },
}));

/*
 * Dynamic import is intentional.
 * It guarantees GEOAPIFY_API_KEY is already available
 * when places.ts is evaluated.
 */
const {
  geocode,
  haversineMeters,
  inferCategory,
  rankPlaces,
  searchNearby,
  searchPlacesByName,
} = await import("@/lib/places");

type Place = {
  externalId: string;
  name: string;
  category:
    | "stay"
    | "restaurant"
    | "attraction";
  lat: number;
  lon: number;
  address: string | null;
  distanceMeters: number;
  tags: Record<string, string>;
};

describe("places service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFindUnique.mockResolvedValue(
      null,
    );

    mockUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    /*
     * Keep the test environment isolated.
     * The Geoapify test key itself is restored below
     * because places.ts has already been imported.
     */
    process.env.GEOAPIFY_API_KEY =
      "test-geoapify-key";
  });

  // =========================================================
  // HAVERSINE
  // =========================================================

  describe("haversineMeters", () => {
    it("returns 0 for the same coordinates", () => {
      const distance =
        haversineMeters(
          28.6139,
          77.209,
          28.6139,
          77.209,
        );

      expect(distance).toBe(0);
    });

    it("calculates a reasonable distance", () => {
      const distance =
        haversineMeters(
          28.6139,
          77.209,
          28.7041,
          77.1025,
        );

      expect(distance).toBeGreaterThan(
        10000,
      );

      expect(distance).toBeLessThan(
        20000,
      );
    });
  });

  // =========================================================
  // RANK PLACES
  // =========================================================

  describe("rankPlaces", () => {
    it("sorts restaurants by distance", () => {
      const places: Place[] = [
        {
          externalId: "restaurant-2",
          name: "Far Restaurant",
          category: "restaurant",
          lat: 28.7,
          lon: 77.2,
          address: "Far Address",
          distanceMeters: 5000,
          tags: {},
        },

        {
          externalId: "restaurant-1",
          name: "Near Restaurant",
          category: "restaurant",
          lat: 28.61,
          lon: 77.21,
          address: "Near Address",
          distanceMeters: 500,
          tags: {},
        },
      ];

      const ranked =
        rankPlaces(
          places as Parameters<
            typeof rankPlaces
          >[0],
          "restaurant",
        );

      expect(ranked[0].name).toBe(
        "Near Restaurant",
      );

      expect(ranked[1].name).toBe(
        "Far Restaurant",
      );
    });

    it("prioritizes notable attractions", () => {
      const places: Place[] = [
        {
          externalId: "attraction-1",
          name: "Notable Attraction",
          category: "attraction",
          lat: 28.62,
          lon: 77.21,
          address: "Notable Address",
          distanceMeters: 3000,
          tags: {
            wikipedia:
              "en:Test_attraction",
          },
        },

        {
          externalId: "attraction-2",
          name: "Nearby Attraction",
          category: "attraction",
          lat: 28.615,
          lon: 77.21,
          address: "Nearby Address",
          distanceMeters: 500,
          tags: {},
        },
      ];

      const ranked =
        rankPlaces(
          places as Parameters<
            typeof rankPlaces
          >[0],
          "attraction",
        );

      expect(ranked).toHaveLength(2);

      expect(ranked[0].name).toBe(
        "Notable Attraction",
      );

      expect(ranked[1].name).toBe(
        "Nearby Attraction",
      );
    });

    it("does not mutate the original array", () => {
      const places: Place[] = [
        {
          externalId: "restaurant-1",
          name: "Far Restaurant",
          category: "restaurant",
          lat: 28.7,
          lon: 77.2,
          address: "Far Address",
          distanceMeters: 5000,
          tags: {},
        },

        {
          externalId: "restaurant-2",
          name: "Near Restaurant",
          category: "restaurant",
          lat: 28.61,
          lon: 77.21,
          address: "Near Address",
          distanceMeters: 500,
          tags: {},
        },
      ];

      const original = [
        ...places,
      ];

      rankPlaces(
        places as Parameters<
          typeof rankPlaces
        >[0],
        "restaurant",
      );

      expect(places).toEqual(
        original,
      );
    });
  });

  // =========================================================
  // GEOCODE
  // =========================================================

  describe("geocode", () => {
    it("returns the first Nominatim result", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => [
            {
              display_name:
                "New Delhi, India",
              lat: "28.6139",
              lon: "77.2090",
            },
          ],
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const result =
        await geocode("Delhi");

      expect(result.name).toBe(
        "New Delhi, India",
      );

      expect(result.lat).toBeCloseTo(
        28.6139,
      );

      expect(result.lon).toBeCloseTo(
        77.209,
      );

      expect(
        fetchMock,
      ).toHaveBeenCalledTimes(1);
    });

    it("throws when no location is found", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => [],
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      await expect(
        geocode(
          "Some Completely Unknown Place",
        ),
      ).rejects.toThrow(
        "Couldn't find a location",
      );
    });

    it("throws when Nominatim fails", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,

          json: async () => ({}),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      await expect(
        geocode("Delhi"),
      ).rejects.toThrow(
        "Geocoding service returned 500",
      );
    });
  });

  // =========================================================
  // CATEGORY INFERENCE
  // =========================================================

  describe("inferCategory", () => {
    it("detects hotels", () => {
      expect(
        inferCategory(
          "tourism",
          "hotel",
        ),
      ).toBe("stay");
    });

    it("detects guest houses", () => {
      expect(
        inferCategory(
          "tourism",
          "guest_house",
        ),
      ).toBe("stay");
    });

    it("detects restaurants", () => {
      expect(
        inferCategory(
          "amenity",
          "restaurant",
        ),
      ).toBe("restaurant");
    });

    it("detects cafes", () => {
      expect(
        inferCategory(
          "amenity",
          "cafe",
        ),
      ).toBe("restaurant");
    });

    it("detects attractions", () => {
      expect(
        inferCategory(
          "tourism",
          "museum",
        ),
      ).toBe("attraction");
    });

    it("detects historic places", () => {
      expect(
        inferCategory(
          "historic",
          "monument",
        ),
      ).toBe("attraction");
    });

    it("returns null for unknown categories", () => {
      expect(
        inferCategory(
          "something",
          "unknown",
        ),
      ).toBeNull();
    });
  });

  // =========================================================
  // SEARCH PLACES BY NAME
  // =========================================================

  describe("searchPlacesByName", () => {
    it("returns named places from Nominatim", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => [
            {
              place_id: 1,
              lat: "28.6139",
              lon: "77.2090",
              display_name:
                "India Gate, New Delhi, India",
              class: "tourism",
              type: "attraction",
            },

            {
              place_id: 2,
              lat: "28.6129",
              lon: "77.2295",
              display_name:
                "Connaught Place, New Delhi, India",
              class: "place",
              type: "locality",
            },
          ],
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchPlacesByName(
          "Delhi",
        );

      expect(results).toHaveLength(
        2,
      );

      expect(results[0].name).toBe(
        "India Gate",
      );

      expect(
        results[0].externalId,
      ).toBe("nominatim/1");

      expect(
        results[0].category,
      ).toBe("attraction");

      expect(
        results[0].lat,
      ).toBeCloseTo(28.6139);

      expect(
        results[0].lon,
      ).toBeCloseTo(77.209);
    });

    it("returns an empty array when there are no results", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => [],
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchPlacesByName(
          "Definitely Not A Real Place",
        );

      expect(results).toEqual([]);
    });

    it("sorts results by distance when near is supplied", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => [
            {
              place_id: 1,
              lat: "28.7000",
              lon: "77.2000",
              display_name:
                "Far Restaurant, Delhi",
              class: "amenity",
              type: "restaurant",
            },

            {
              place_id: 2,
              lat: "28.6140",
              lon: "77.2100",
              display_name:
                "Near Restaurant, Delhi",
              class: "amenity",
              type: "restaurant",
            },
          ],
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchPlacesByName(
          "restaurant",
          {
            lat: 28.6139,
            lon: 77.209,
          },
        );

      expect(results).toHaveLength(
        2,
      );

      expect(results[0].name).toBe(
        "Near Restaurant",
      );

      expect(results[1].name).toBe(
        "Far Restaurant",
      );

      expect(
        results[0].distanceMeters,
      ).toBeLessThan(
        results[1].distanceMeters,
      );
    });

    it("throws when Nominatim search fails", async () => {
      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,

          json: async () => ({}),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      await expect(
        searchPlacesByName(
          "restaurant",
        ),
      ).rejects.toThrow(
        "Places search returned 503",
      );
    });
  });

  // =========================================================
  // SEARCH NEARBY - GEoAPIFY
  // =========================================================

  describe("searchNearby", () => {
    it("returns cached places from PostgreSQL", async () => {
      const cachedPlaces: Place[] = [
        {
          externalId: "geo-1",
          name: "Cached Restaurant",
          category: "restaurant",
          lat: 28.614,
          lon: 77.21,
          address:
            "Cached Restaurant, Delhi",
          distanceMeters: 300,
          tags: {
            cuisine: "indian",
          },
        },
      ];

      /*
       * Current Geoapify cache-key format:
       *
       * geoapify:category:lat:lon:radius
       */
      mockFindUnique.mockResolvedValue({
        id: "cache-1",

        cacheKey:
          "geoapify:restaurant:28.614:77.209:5000",

        category: "restaurant",

        latitude: 28.6139,

        longitude: 77.209,

        places: cachedPlaces,

        createdAt: new Date(),

        updatedAt: new Date(),
      });

      const fetchMock =
        vi.fn();

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchNearby({
          lat: 28.6139,
          lon: 77.209,
          category: "restaurant",
          radiusMeters: 5000,
          limit: 10,
        });

      expect(results).toEqual(
        cachedPlaces,
      );

      expect(
        mockFindUnique,
      ).toHaveBeenCalledTimes(1);

      expect(
        fetchMock,
      ).not.toHaveBeenCalled();

      expect(
        mockUpsert,
      ).not.toHaveBeenCalled();
    });

    it("fetches restaurants from Geoapify when cache is empty", async () => {
      mockFindUnique.mockResolvedValue(
        null,
      );

      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,

          json: async () => ({
            features: [
              {
                type: "Feature",

                geometry: {
                  type: "Point",

                  coordinates: [
                    77.21,
                    28.614,
                  ],
                },

                properties: {
                  place_id:
                    "geo-restaurant-1",

                  name:
                    "Test Restaurant",

                  categories: [
                    "catering.restaurant",
                  ],

                  lat: 28.614,

                  lon: 77.21,

                  address_line1:
                    "Test Restaurant",

                  address_line2:
                    "New Delhi",
                },
              },

              {
                type: "Feature",

                geometry: {
                  type: "Point",

                  coordinates: [
                    77.22,
                    28.615,
                  ],
                },

                properties: {
                  place_id:
                    "geo-restaurant-2",

                  name:
                    "Another Restaurant",

                  categories: [
                    "catering.restaurant",
                  ],

                  lat: 28.615,

                  lon: 77.22,

                  address_line1:
                    "Another Restaurant",

                  address_line2:
                    "New Delhi",
                },
              },
            ],
          }),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchNearby({
          lat: 28.6139,
          lon: 77.209,
          category: "restaurant",
          radiusMeters: 5000,
          limit: 10,
        });

      expect(results).toHaveLength(
        2,
      );

      expect(results[0].name).toBe(
        "Test Restaurant",
      );

      expect(
        results[0].category,
      ).toBe("restaurant");

      expect(
        results[0].externalId,
      ).toBe(
        "geoapify/geo-restaurant-1",
      );

      expect(
        results[0].lat,
      ).toBeCloseTo(28.614);

      expect(
        results[0].lon,
      ).toBeCloseTo(77.21);

      expect(
        fetchMock,
      ).toHaveBeenCalledTimes(1);

      expect(
        mockUpsert,
      ).toHaveBeenCalledTimes(1);
    });

    it("ignores unnamed Geoapify results", async () => {
      mockFindUnique.mockResolvedValue(
        null,
      );

      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,

          json: async () => ({
            features: [
              {
                type: "Feature",

                geometry: {
                  type: "Point",

                  coordinates: [
                    77.21,
                    28.614,
                  ],
                },

                properties: {
                  place_id:
                    "geo-unnamed",

                  categories: [
                    "catering.restaurant",
                  ],

                  lat: 28.614,

                  lon: 77.21,
                },
              },

              {
                type: "Feature",

                geometry: {
                  type: "Point",

                  coordinates: [
                    77.211,
                    28.615,
                  ],
                },

                properties: {
                  place_id:
                    "geo-named",

                  name:
                    "Named Restaurant",

                  categories: [
                    "catering.restaurant",
                  ],

                  lat: 28.615,

                  lon: 77.211,

                  address_line1:
                    "Named Restaurant",

                  address_line2:
                    "Delhi",
                },
              },
            ],
          }),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchNearby({
          lat: 28.6139,
          lon: 77.209,
          category: "restaurant",
        });

      expect(results).toHaveLength(
        1,
      );

      expect(results[0].name).toBe(
        "Named Restaurant",
      );
    });

    it("fetches hotels from Geoapify", async () => {
      mockFindUnique.mockResolvedValue(
        null,
      );

      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => ({
            features: [
              {
                type: "Feature",

                geometry: {
                  type: "Point",

                  coordinates: [
                    77.215,
                    28.618,
                  ],
                },

                properties: {
                  place_id:
                    "geo-hotel-1",

                  name:
                    "Test Hotel",

                  categories: [
                    "accommodation.hotel",
                  ],

                  lat: 28.618,

                  lon: 77.215,

                  address_line1:
                    "Test Hotel",

                  address_line2:
                    "New Delhi",
                },
              },
            ],
          }),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchNearby({
          lat: 28.6139,
          lon: 77.209,
          category: "stay",
          radiusMeters: 5000,
          limit: 10,
        });

      expect(results).toHaveLength(
        1,
      );

      expect(results[0].name).toBe(
        "Test Hotel",
      );

      expect(
        results[0].category,
      ).toBe("stay");
    });

    it("fetches attractions from Geoapify", async () => {
      mockFindUnique.mockResolvedValue(
        null,
      );

      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => ({
            features: [
              {
                type: "Feature",

                geometry: {
                  type: "Point",

                  coordinates: [
                    77.218,
                    28.620,
                  ],
                },

                properties: {
                  place_id:
                    "geo-attraction-1",

                  name:
                    "Test Museum",

                  categories: [
                    "tourism",
                  ],

                  lat: 28.620,

                  lon: 77.218,

                  address_line1:
                    "Test Museum",

                  address_line2:
                    "New Delhi",

                  wiki_and_data: {
                    wikidata:
                      "Q123456",
                  },
                },
              },
            ],
          }),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      const results =
        await searchNearby({
          lat: 28.6139,
          lon: 77.209,
          category: "attraction",
          radiusMeters: 5000,
          limit: 10,
        });

      expect(results).toHaveLength(
        1,
      );

      expect(results[0].name).toBe(
        "Test Museum",
      );

      expect(
        results[0].category,
      ).toBe("attraction");
    });

    it("throws when Geoapify returns an HTTP error", async () => {
      mockFindUnique.mockResolvedValue(
        null,
      );

      const fetchMock =
        vi.fn().mockResolvedValue({
        ok: false,
        status: 503,

        text: async () =>
          "Geoapify service unavailable",
      });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      await expect(
        searchNearby({
          lat: 28.6139,
          lon: 77.209,
          category: "restaurant",
        }),
      ).rejects.toThrow(
        "Geoapify Places API returned 503",
      );

      expect(
        fetchMock,
      ).toHaveBeenCalledTimes(1);
    });

    it("sends the requested location and category to Geoapify", async () => {
      mockFindUnique.mockResolvedValue(
        null,
      );

      const fetchMock =
        vi.fn().mockResolvedValue({
          ok: true,

          json: async () => ({
            features: [],
          }),
        });

      vi.stubGlobal(
        "fetch",
        fetchMock,
      );

      await searchNearby({
        lat: 19.076,
        lon: 72.8777,
        category: "restaurant",
        radiusMeters: 3000,
        limit: 15,
      });

      expect(
        fetchMock,
      ).toHaveBeenCalledTimes(1);

      const calledUrl =
        String(
          fetchMock.mock.calls[0][0],
        );

      expect(calledUrl).toContain(
        "api.geoapify.com",
      );

      expect(calledUrl).toContain(
        "19.076",
      );

      expect(calledUrl).toContain(
        "72.8777",
      );

      expect(calledUrl).toContain(
        "catering.restaurant",
      );

      expect(calledUrl).toContain(
        "3000",
      );
    });
  });
});