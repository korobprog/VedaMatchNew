"use client";

import { useEffect } from "react";
import { registerAppServiceWorker } from "@/lib/pwa/service-worker";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerAppServiceWorker();
  }, []);

  return null;
}
