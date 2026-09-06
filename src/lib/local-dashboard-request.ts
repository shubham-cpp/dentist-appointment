import { isLoopbackHttpUrl } from "./loopback-url";

type RequestHeaders = {
  get(name: string): string | null;
};

export function isLocalDashboardRequestHeaders(headers: RequestHeaders) {
  const host = headers.get("host");
  const origin = headers.get("origin");
  if (!host || !origin) return false;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (!isLoopbackHttpUrl(originUrl) || originUrl.host !== host) return false;

  const forwardedHost = headers.get("x-forwarded-host");
  if (forwardedHost && forwardedHost !== originUrl.host) return false;
  const forwardedProtocol = headers.get("x-forwarded-proto");
  if (forwardedProtocol && forwardedProtocol !== "http") return false;
  const fetchSite = headers.get("sec-fetch-site");
  return !fetchSite || fetchSite === "same-origin";
}
