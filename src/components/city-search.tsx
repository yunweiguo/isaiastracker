"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { cities } from "@/lib/config";
import { trackEvent } from "./analytics";
export default function CitySearch({
  path,
  selected,
}: {
  path: string;
  selected?: string;
}) {
  const [query, setQuery] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locating, setLocating] = useState(false);
  const locationPending = useRef(false);
  const matches = cities.filter((city) =>
    `${city.name} ${city.state} ${city.code}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  return (
    <div className="city-search">
      <label htmlFor="city-search">Find your city</label>
      <div className="search-field">
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <input
          id="city-search"
          type="search"
          placeholder="City or state"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>
      <button
        type="button"
        className="location-link"
        disabled={locating}
        onClick={() => {
          if (locationPending.current) return;
          if (!window.isSecureContext) {
            setLocationError(
              "Location requires a secure connection. Search on NWS instead.",
            );
            return;
          }
          if (!navigator.geolocation) {
            setLocationError(
              "This browser cannot find your location. Search on NWS instead.",
            );
            return;
          }
          locationPending.current = true;
          setLocating(true);
          setLocationError("");
          let finished = false;
          const fail = (message: string) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            locationPending.current = false;
            setLocating(false);
            setLocationError(message);
          };
          const timer = setTimeout(
            () => fail("Location timed out. Try again or search on NWS."),
            11_000,
          );
          try {
            navigator.geolocation.getCurrentPosition(
              ({ coords }) => {
                if (finished) return;
                const { latitude, longitude } = coords;
                if (
                  !Number.isFinite(latitude) ||
                  !Number.isFinite(longitude) ||
                  Math.abs(latitude) > 90 ||
                  Math.abs(longitude) > 180
                ) {
                  fail("Location is unavailable. Search on NWS instead.");
                  return;
                }
                finished = true;
                clearTimeout(timer);
                const url = new URL("https://forecast.weather.gov/MapClick.php");
                url.searchParams.set("lat", latitude.toFixed(4));
                url.searchParams.set("lon", longitude.toFixed(4));
                try {
                  window.location.assign(url.toString());
                } catch {
                  locationPending.current = false;
                  setLocating(false);
                  setLocationError("NWS could not open. Use its search link below.");
                }
              },
              (error) =>
                fail(
                  error.code === 1
                    ? "Location permission was denied. Search on NWS instead."
                    : error.code === 3
                      ? "Location timed out. Try again or search on NWS."
                      : "Your location is unavailable. Try again or search on NWS.",
                ),
              { timeout: 10_000, maximumAge: 0 },
            );
          } catch {
            fail("Location is unavailable. Search on NWS instead.");
          }
        }}
      >
        {locating ? "Getting your location..." : "Use my location at NWS ↗"}
      </button>
      <p className="muted small">
        Your location will be shared with the official National Weather Service
        to open your local forecast. NWS forecasts are only available in areas it
        serves. <a href="https://www.weather.gov/">Search locations on NWS.</a>
      </p>
      {locationError && (
        <p role="status" className="muted small">
          {locationError}
        </p>
      )}
      <div className="city-results">
        {matches.map((city) => (
          <Link
            key={city.slug}
            href={`${path}/${city.slug}`}
            className={selected === city.slug ? "selected" : ""}
            onClick={() => {
              if (selected !== city.slug)
                trackEvent("select_city", { city: city.slug });
            }}
          >
            <span>
              {city.name}
              <small>{city.state}</small>
            </span>
            <span aria-hidden="true">↗</span>
          </Link>
        ))}
        {!matches.length && (
          <p className="muted">
            We currently cover five Gulf Coast cities.{" "}
            <a href="https://www.weather.gov/">Find other locations at NWS.</a>
          </p>
        )}
      </div>
    </div>
  );
}
