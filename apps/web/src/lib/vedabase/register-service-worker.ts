export const vedabaseActiveUserKey = "vedabase:activeUserId";

export async function registerVedabaseServiceWorker(
  userId?: string,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (userId) localStorage.setItem(vedabaseActiveUserKey, userId);
  return navigator.serviceWorker.register("/vedabase/sw.js", {
    scope: "/vedabase/",
  });
}

export async function clearVedabaseOfflineData(): Promise<void> {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage("CLEAR_VEDABASE_CACHE");
    const registration = await navigator.serviceWorker.getRegistration(
      "/vedabase/",
    );
    registration?.active?.postMessage("CLEAR_VEDABASE_CACHE");
    registration?.waiting?.postMessage("CLEAR_VEDABASE_CACHE");
    registration?.installing?.postMessage("CLEAR_VEDABASE_CACHE");
  }
}
