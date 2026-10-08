import Link from "next/link";
export default function NotFound() {
  return (
    <div className="prose">
      <h1>We couldn’t find that forecast.</h1>
      <p>
        The storm or city may not be in our records. Return to the tracker to
        see available forecasts.
      </p>
      <Link href="/" className="button">
        Back to storm tracker
      </Link>
    </div>
  );
}
