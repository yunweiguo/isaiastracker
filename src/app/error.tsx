"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="prose">
      <h1>The forecast couldn’t load.</h1>
      <p>
        Please try again, or visit the National Hurricane Center for current
        official information.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>{" "}
      <a href="https://www.nhc.noaa.gov/">Open NHC</a>
    </div>
  );
}
