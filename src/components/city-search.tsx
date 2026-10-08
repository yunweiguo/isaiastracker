"use client";
import { useState } from "react";
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
        onClick={() => {
          if (!navigator.geolocation) {
            setLocationError("Location is unavailable in this browser.");
            return;
          }
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
              window.location.assign(
                `https://forecast.weather.gov/MapClick.php?lat=${coords.latitude}&lon=${coords.longitude}`,
              );
            },
            () =>
              setLocationError(
                "Location unavailable. Search a city or open NWS directly.",
              ),
            { timeout: 10000 },
          );
        }}
      >
        Use my location for the official NWS forecast ↗
      </button>
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
