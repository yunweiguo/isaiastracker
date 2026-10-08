"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { analyticsConfig, siteUrl, isPublicSite } from "@/lib/config";

type Plausible = ((event: string, options?: object) => void) & {
  q?: unknown[];
  o?: object;
  init?: (options?: object) => void;
};
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    plausible?: Plausible;
  }
}
export function trackEvent(
  event: string,
  properties: Record<string, string> = {},
) {
  window.plausible?.(event, { props: properties });
  try {
    window.gtag?.("event", event, properties);
  } catch {
    /* Analytics must not interrupt the tool. */
  }
}
export default function Analytics() {
  const pathname = usePathname();
  const sent = useRef("");
  const enabled =
    isPublicSite &&
    typeof window !== "undefined" &&
    window.location.origin === siteUrl &&
    process.env.NODE_ENV === "production";
  const gaId = /^G-[A-Z0-9]+$/.test(analyticsConfig.gaId)
    ? analyticsConfig.gaId
    : "";
  useEffect(() => {
    if (
      !enabled ||
      !analyticsConfig.plausibleSrc ||
      document.getElementById("plausible-script")
    )
      return;
    let url: URL;
    try {
      url = new URL(analyticsConfig.plausibleSrc);
    } catch {
      return;
    }
    if (url.protocol !== "https:") return;
    const p: Plausible =
      window.plausible ||
      Object.assign(function (...args: unknown[]) {
        (p.q ||= []).push(args);
      }, {});
    p.init ||= (options) => {
      p.o = options || {};
    };
    window.plausible = p;
    p.init();
    const script = document.createElement("script");
    script.id = "plausible-script";
    script.src = url.href;
    script.defer = true;
    if (analyticsConfig.plausibleDomain)
      script.dataset.domain = analyticsConfig.plausibleDomain;
    document.head.appendChild(script);
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !gaId) return;
    if (!document.getElementById("ga-script")) {
      window.dataLayer ||= [];
      window.gtag = function () {
        window.dataLayer!.push(arguments);
      };
      window.gtag("consent", "default", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      window.gtag("js", new Date());
      window.gtag("config", gaId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      const script = document.createElement("script");
      script.id = "ga-script";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(script);
    }
    if (sent.current !== pathname) {
      window.gtag?.("event", "page_view", {
        page_location: `${siteUrl}${pathname}`,
        page_title: document.title,
      });
      sent.current = pathname;
    }
  }, [enabled, gaId, pathname]);
  return null;
}
