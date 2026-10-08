"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useGroupRealtime } from "@/lib/socket-client";

type PlaceCategory = "stay" | "restaurant" | "attraction";

type Place = {
  externalId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  address: string | null;
  distanceMeters: number;
  tags: Record<string, string>;
};

type SearchResult = Omit<Place, "category"> & { category: PlaceCategory | null };

type SavedPlace = Place & {
  id: string;
  savedBy: { id: string; name: string };
};

type LocationMode = "destination" | "me";

const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  stay: "Places to stay",
  restaurant: "Restaurants",
  attraction: "Top places to visit",
};

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

function PlaceTagLine({ place }: { place: Place | SearchResult }) {
  const bits: string[] = [];
  if (place.tags.cuisine) bits.push(place.tags.cuisine.replace(/_/g, " "));
  if (place.tags.stars) bits.push(`${place.tags.stars}★ hotel`);
  if (place.tags.tourism && place.category === "attraction") bits.push(place.tags.tourism.replace(/_/g, " "));
  if (place.tags.historic) bits.push(place.tags.historic.replace(/_/g, " "));
  if (place.distanceMeters > 0) bits.push(formatDistance(place.distanceMeters));
  return bits.length > 0 ? <p className="text-sm text-ink/60 capitalize">{bits.join(" · ")}</p> : null;
}

export function ExploreView({
  groupId,
  destinationName,
  onDestinationChanged,
}: {
  groupId: string;
  destinationName: string | null;
  onDestinationChanged: () => void;
}) {
  const [category, setCategory] = useState<PlaceCategory | "saved">("attraction");
  const [places, setPlaces] = useState<Place[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destinationInput, setDestinationInput] = useState("");
  const [settingDestination, setSettingDestination] = useState(false);

  // "Near me" — the browser's geolocation coords, used for this session only
  // and never sent anywhere except as one-off query params on /explore and
  // /explore/search. Nothing about the user's location is stored server-side.
  const [locationMode, setLocationMode] = useState<LocationMode>("destination");
  const [myCoords, setMyCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Free-text "search for a specific place" box.
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pickedCategory, setPickedCategory] = useState<Record<string, PlaceCategory>>({});

  const loadSavedPlaces = useCallback(async () => {
    const res = await fetch(`/api/groups/${groupId}/saved-places`);
    if (res.ok) setSavedPlaces((await res.json()).savedPlaces);
  }, [groupId]);

  const loadPlaces = useCallback(
    async (cat: PlaceCategory) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ category: cat });
      if (locationMode === "me" && myCoords) {
        params.set("lat", String(myCoords.lat));
        params.set("lon", String(myCoords.lon));
      }
      const res = await fetch(`/api/groups/${groupId}/explore?${params}`);
      const body = await res.json();
      if (res.ok) {
        setPlaces(body.places);
      } else {
        setPlaces([]);
        setError(body.error ?? "Couldn't load places.");
      }
      setLoading(false);
    },
    [groupId, locationMode, myCoords]
  );

  useEffect(() => {
    if (!destinationName && locationMode === "destination") return;
    if (locationMode === "me" && !myCoords) return;
    if (category === "saved") {
      loadSavedPlaces();
    } else {
      loadPlaces(category);
    }
  }, [category, destinationName, locationMode, myCoords, loadPlaces, loadSavedPlaces]);

  useGroupRealtime(groupId, {
    "place:saved": () => loadSavedPlaces(),
    "place:removed": () => loadSavedPlaces(),
  });

  function requestMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location access.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setLocationMode("me");
        setLocating(false);
      },
      (err) => {
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. Allow it in your browser settings to search near you."
            : "Couldn't get your location. Try again."
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  async function submitDestination(e: FormEvent) {
    e.preventDefault();
    if (!destinationInput.trim()) return;
    setSettingDestination(true);
    setError(null);
    const res = await fetch(`/api/groups/${groupId}/destination`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationName: destinationInput.trim() }),
    });
    const body = await res.json();
    setSettingDestination(false);
    if (res.ok) {
      setDestinationInput("");
      onDestinationChanged();
    } else {
      setError(body.error ?? "Couldn't set that destination.");
    }
  }

  async function submitSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    const params = new URLSearchParams({ q: searchQuery.trim() });
    if (locationMode === "me" && myCoords) {
      params.set("lat", String(myCoords.lat));
      params.set("lon", String(myCoords.lon));
    }
    const res = await fetch(`/api/groups/${groupId}/explore/search?${params}`);
    const body = await res.json();
    setSearching(false);
    if (res.ok) {
      setSearchResults(body.results);
      const defaults: Record<string, PlaceCategory> = {};
      for (const r of body.results as SearchResult[]) {
        defaults[r.externalId] = r.category ?? "attraction";
      }
      setPickedCategory(defaults);
    } else {
      setSearchResults(null);
      setSearchError(body.error ?? "Search failed.");
    }
  }

  async function savePlace(place: Place | SearchResult, categoryOverride?: PlaceCategory) {
    const cat = categoryOverride ?? (place.category as PlaceCategory);
    await fetch(`/api/groups/${groupId}/saved-places`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...place, category: cat }),
    });
  }

  async function removeSavedPlace(id: string) {
    await fetch(`/api/groups/${groupId}/saved-places/${id}`, { method: "DELETE" });
  }

  const isSaved = (externalId: string, cat: PlaceCategory) =>
    savedPlaces.some((p) => p.externalId === externalId && p.category === cat);

  const locationToggle = (
    <div className="flex items-center gap-2 text-sm">
      <button
        className={`px-2 py-1 rounded-sm border ${
          locationMode === "destination" ? "bg-moss text-paper border-moss" : "border-line text-ink/70"
        }`}
        onClick={() => setLocationMode("destination")}
      >
        Near destination
      </button>
      <button
        className={`px-2 py-1 rounded-sm border ${
          locationMode === "me" ? "bg-moss text-paper border-moss" : "border-line text-ink/70"
        }`}
        onClick={() => (myCoords ? setLocationMode("me") : requestMyLocation())}
        disabled={locating}
      >
        {locating ? "Locating…" : "Near me"}
      </button>
    </div>
  );

  if (!destinationName && locationMode === "destination" && !myCoords) {
    return (
      <div className="space-y-4">
        <div className="card p-6 max-w-md space-y-3">
          <h3 className="font-display text-lg font-semibold">Where&apos;s this trip headed?</h3>
          <p className="text-sm text-ink/60">
            Set a destination to search nearby stays, restaurants, and top places to visit — or search near your
            current location instead.
          </p>
          <form onSubmit={submitDestination} className="flex gap-2">
            <input
              className="input"
              placeholder="e.g. Lisbon, Portugal"
              value={destinationInput}
              onChange={(e) => setDestinationInput(e.target.value)}
            />
            <button className="btn-primary shrink-0" disabled={settingDestination}>
              {settingDestination ? "Finding…" : "Set"}
            </button>
          </form>
          <div className="pt-1">
            <button className="btn-secondary text-sm" onClick={requestMyLocation} disabled={locating}>
              {locating ? "Locating…" : "Use my current location instead"}
            </button>
          </div>
          {error && <p className="tag-negative text-sm">{error}</p>}
          {locationError && <p className="tag-negative text-sm">{locationError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <p className="text-sm text-ink/60">
            Exploring near{" "}
            <strong className="text-ink">{locationMode === "me" ? "your location" : destinationName}</strong>
          </p>
          {locationToggle}
        </div>
        {locationMode === "destination" && (
          <form onSubmit={submitDestination} className="flex gap-2">
            <input
              className="input text-sm"
              placeholder="Change destination…"
              value={destinationInput}
              onChange={(e) => setDestinationInput(e.target.value)}
            />
            <button className="btn-secondary text-sm shrink-0" disabled={settingDestination}>
              {settingDestination ? "…" : "Update"}
            </button>
          </form>
        )}
      </div>
      {locationError && <p className="tag-negative text-sm">{locationError}</p>}

      {/* Search for a specific named place, e.g. "Pastéis de Belém" */}
      <form onSubmit={submitSearch} className="flex gap-2">
        <input
          className="input"
          placeholder="Search for a specific place by name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="btn-secondary shrink-0" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>
      {searchError && <p className="tag-negative text-sm">{searchError}</p>}
      {searchResults && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink/60">
              {searchResults.length === 0 ? "No matches." : `${searchResults.length} result(s)`}
            </p>
            <button className="text-sm text-ink/50 hover:underline" onClick={() => setSearchResults(null)}>
              Clear
            </button>
          </div>
          {searchResults.map((r) => (
            <div key={r.externalId} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium">{r.name}</p>
                {r.address && <p className="text-sm text-ink/60">{r.address}</p>}
                <PlaceTagLine place={r} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  className="input text-sm w-auto"
                  value={pickedCategory[r.externalId] ?? "attraction"}
                  onChange={(e) =>
                    setPickedCategory((prev) => ({ ...prev, [r.externalId]: e.target.value as PlaceCategory }))
                  }
                >
                  <option value="attraction">Attraction</option>
                  <option value="stay">Stay</option>
                  <option value="restaurant">Restaurant</option>
                </select>
                <button
                  className="btn-primary text-sm"
                  onClick={() => savePlace(r, pickedCategory[r.externalId])}
                  disabled={isSaved(r.externalId, pickedCategory[r.externalId] ?? "attraction")}
                >
                  {isSaved(r.externalId, pickedCategory[r.externalId] ?? "attraction") ? "Saved" : "Save"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-b border-line flex gap-6 overflow-x-auto">
        {(["attraction", "stay", "restaurant", "saved"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`pb-2 whitespace-nowrap font-medium ${
              category === c ? "border-b-2 border-moss text-moss" : "text-ink/50"
            }`}
          >
            {c === "saved" ? "Saved" : CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {category === "saved" ? (
        <div className="space-y-2">
          {savedPlaces.length === 0 && (
            <p className="text-ink/60">Nothing saved yet — bookmark places from the other tabs.</p>
          )}
          {savedPlaces.map((p) => (
            <div key={p.id} className="card p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {p.name} <span className="text-xs text-ink/50 capitalize">· {CATEGORY_LABEL[p.category]}</span>
                </p>
                {p.address && <p className="text-sm text-ink/60">{p.address}</p>}
                <p className="text-xs text-ink/50">Saved by {p.savedBy.name}</p>
              </div>
              <button className="text-sm text-clay hover:underline" onClick={() => removeSavedPlace(p.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {loading && <p className="text-ink/60">Searching…</p>}
          {error && <p className="tag-negative">{error}</p>}
          {!loading && !error && places.length === 0 && (
            <p className="text-ink/60">Nothing found nearby. Try a wider search once more places are mapped here.</p>
          )}
          {!loading &&
            places.map((p) => (
              <div key={p.externalId} className="card p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{p.name}</p>
                  {p.address && <p className="text-sm text-ink/60">{p.address}</p>}
                  <PlaceTagLine place={p} />
                </div>
                <button
                  className={isSaved(p.externalId, category) ? "btn-secondary text-sm shrink-0" : "btn-primary text-sm shrink-0"}
                  disabled={isSaved(p.externalId, category)}
                  onClick={() => savePlace(p)}
                >
                  {isSaved(p.externalId, category) ? "Saved" : "Save"}
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
