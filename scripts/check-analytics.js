// Run with `browse eval scripts/check-analytics.js` after opening the site.
(() => {
  const ga = document.querySelectorAll(
    'script[src*="googletagmanager.com/gtag/js"]',
  );
  const plausible = document.querySelectorAll(
    'script[src*="plausible.dialedgg.run/js/"]',
  );
  if (location.origin !== "https://isaiastracker.site") {
    if (ga.length || plausible.length)
      throw new Error("Analytics loaded outside production");
    return "Analytics suppressed outside production";
  }
  if (ga.length !== 1 || plausible.length !== 1)
    throw new Error("Expected one script per provider");
  if (
    document.querySelector(".consent") ||
    document.body.innerText.includes("Analytics preferences")
  )
    throw new Error("Obsolete consent UI is present");
  const sent = (window.dataLayer || []).some(
    (entry) =>
      entry[0] === "event" &&
      entry[1] === "page_view" &&
      entry[2]?.page_location === location.origin + location.pathname,
  );
  if (!sent) throw new Error("Automatic GA page view was not sent");
  return "Both providers loaded once; automatic page view sent without a consent prompt";
})();
