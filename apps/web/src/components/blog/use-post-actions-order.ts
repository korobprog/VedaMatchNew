"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  parsePostActionsOrder,
  readPostActionsOrderRaw,
  subscribePostActionsOrder,
  type PostAction,
} from "./post-actions-order";

const serverSnapshot = () => null;

/**
 * Порядок кнопок под постом (VED-509) — общий для всех карточек страницы.
 * Снимок — сырая строка из хранилища: строки сравниваются по значению, и
 * карточки не перерисовываются, пока порядок не сменился. На сервере и до
 * гидратации — порядок по умолчанию.
 */
export function usePostActionsOrder(): PostAction[] {
  const raw = useSyncExternalStore(
    subscribePostActionsOrder,
    readPostActionsOrderRaw,
    serverSnapshot,
  );
  return useMemo(() => parsePostActionsOrder(raw), [raw]);
}
