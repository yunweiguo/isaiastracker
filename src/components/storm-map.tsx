"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Snapshot } from "@/lib/domain";
import { forecastRows, knotsToMph } from "@/lib/domain";
import type { City } from "@/lib/config";
import { trackEvent } from "./analytics";

export default function StormMap({
  snapshot,
  city,
}: {
  snapshot: Snapshot;
  city?: City;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const coneRef = useRef<Leaflet.GeoJSON | null>(null);
  const positionRef = useRef<Leaflet.CircleMarker | null>(null);
  const [cone, setCone] = useState(true);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState(false);
  const points = forecastRows(snapshot.track);
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    import("leaflet")
      .then((L) => {
        if (cancelled || !element.current) return;
        const storm = snapshot.storm;
        map = L.map(element.current, {
          scrollWheelZoom: false,
          zoomControl: false,
          attributionControl: true,
        });
        mapRef.current = map;
        setIndex(0);
        setCone(true);
        L.control.zoom({ position: "topright" }).addTo(map);
        L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILE_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ||
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 15,
            className: "base-tiles",
          },
        ).addTo(map);
        const stormCoordinates: Leaflet.LatLngExpression = [
          storm.latitudeNumeric,
          storm.longitudeNumeric,
        ];
        map.setView(stormCoordinates, 5);
        if (snapshot.track) {
          coneRef.current = L.geoJSON(snapshot.track.cone, {
            style: {
              color: "#d77742",
              weight: 1.5,
              fillColor: "#efab73",
              fillOpacity: 0.21,
              dashArray: "5 5",
            },
          }).addTo(map);
          const line = L.geoJSON(snapshot.track.line, {
            style: { color: "#d7592b", weight: 3, dashArray: "7 6" },
          }).addTo(map);
          const markers = L.geoJSON(snapshot.track.points, {
            pointToLayer: (_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                color: "#b84b26",
                fillColor: "#fff",
                fillOpacity: 1,
                weight: 2,
              }),
            onEachFeature: (feature, layer) => {
              const text = document.createElement("span");
              const p = feature.properties || {};
              text.textContent = `${p.DATELBL || "Official forecast"} ${p.TIMEZONE || ""} · ${p.MAXWIND != null ? knotsToMph(Number(p.MAXWIND)) + " mph" : "Wind unavailable"}`;
              layer.bindPopup(text);
            },
          }).addTo(map);
          const bounds = line
            .getBounds()
            .extend(markers.getBounds())
            .extend(stormCoordinates);
          if (city) bounds.extend([city.lat, city.lon]);
          if (bounds.isValid())
            map.fitBounds(bounds, { padding: [65, 60], maxZoom: 7 });
        }
        const icon = L.divIcon({
          className: "storm-pin",
          html: '<span aria-hidden="true">↻</span>',
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });
        L.marker(stormCoordinates, {
          icon,
          title: `${storm.name}: last reported position`,
          keyboard: true,
        })
          .addTo(map)
          .bindTooltip(`${storm.name} · ${knotsToMph(storm.intensity)} mph`, {
            direction: "bottom",
            offset: [0, 22],
            permanent: true,
            className: "storm-label",
          });
        positionRef.current = L.circleMarker(stormCoordinates, {
          radius: 10,
          color: "#173d59",
          fillColor: "#fff",
          fillOpacity: 0.8,
          weight: 3,
        });
        if (city)
          L.circleMarker([city.lat, city.lon], {
            radius: 7,
            color: "#173d59",
            fillColor: "#fff",
            fillOpacity: 1,
            weight: 3,
          })
            .addTo(map)
            .bindTooltip(city.name, { permanent: true, direction: "top" });
        setError(false);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [snapshot, city]);
  useEffect(() => {
    const map = mapRef.current,
      layer = coneRef.current;
    if (map && layer) {
      if (cone) layer.addTo(map);
      else layer.remove();
    }
  }, [cone]);
  function move(value: number) {
    setIndex(value);
    const coordinates = points[value]?.coordinates;
    if (coordinates && positionRef.current && mapRef.current)
      positionRef.current
        .setLatLng([coordinates[1], coordinates[0]])
        .addTo(mapRef.current);
  }
  return (
    <div className="map-panel">
      <div
        ref={element}
        className="storm-map"
        role="region"
        aria-label={`Interactive ${snapshot.storm.name} forecast map`}
      />
      {error && (
        <div className="map-error">
          The interactive map could not load. Use the official advisory link for
          the forecast.
        </div>
      )}
      <div className="map-key">
        <span>
          <i className="key-line" /> Forecast track
        </span>
        <label>
          <input
            type="checkbox"
            checked={cone}
            onChange={(e) => {
              setCone(e.target.checked);
              trackEvent("Toggle cone");
            }}
          />{" "}
          Forecast cone
        </label>
      </div>
      <div className="map-timeline">
        <div>
          <strong>{points[index]?.time || "Last reported position"}</strong>
          <span>
            {points[index]?.wind != null
              ? `${points[index].wind} mph forecast wind`
              : "Official NHC forecast"}
          </span>
        </div>
        <input
          aria-label="Forecast time"
          type="range"
          min="0"
          max={Math.max(0, points.length - 1)}
          value={index}
          disabled={points.length < 2}
          onChange={(e) => move(Number(e.target.value))}
          onPointerUp={() => trackEvent("Explore forecast")}
        />
        <div className="timeline-ends">
          <span>Forecast start</span>
          <span>
            {points.length > 0
              ? `+${points.at(-1)?.hour} hours`
              : "Forecast unavailable"}
          </span>
        </div>
      </div>
    </div>
  );
}
