"use client";

import { useEffect } from "react";
import { syncPushSubscription } from "@/lib/pwa/enable-push";

/** Чинит подписку вошедшего человека при каждой загрузке портала: без этого
 *  тот, кто выдал разрешение до появления VAPID-ключей, остаётся без пушей
 *  навсегда — окно ему уже не показывается, а подписки не существует. */
export function PushSubscriptionSync() {
  useEffect(() => {
    void syncPushSubscription();
  }, []);

  return null;
}
