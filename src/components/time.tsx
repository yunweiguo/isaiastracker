"use client";
import { useSyncExternalStore } from "react";
import { formatTime } from "@/lib/domain";

type Mode = "local" | "UTC";
let mode: Mode = "local";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getMode = () => mode;
const getServerMode = (): Mode => "UTC";
function useMode() {
  return useSyncExternalStore(subscribe, getMode, getServerMode);
}

export default function Time({ value }: { value: string }) {
  const current = useMode();
  const zone =
    current === "local"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  return <time dateTime={value}>{formatTime(value, zone)}</time>;
}

export function TimeZoneSwitch() {
  const current = useMode();
  return (
    <button
      type="button"
      className="time-zone-switch"
      aria-label={`Advisory and alert times shown in ${current === "local" ? "your local time zone" : "UTC"}. Switch time zone`}
      onClick={() => {
        mode = current === "local" ? "UTC" : "local";
        listeners.forEach((listener) => listener());
      }}
    >
      Advisory &amp; alert times: {current === "local" ? "Local" : "UTC"} ↔
    </button>
  );
}
