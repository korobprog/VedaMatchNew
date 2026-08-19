import { redirect } from "next/navigation";
import { requireUser } from "@/lib/require-user";
import { getUnionProfileState } from "@/lib/union-api";
import { hasCompleteUnionLocation } from "@/lib/union-location";

/**
 * Точка входа в Union из портала. Сохранённый профиль (фильтр подбора) означает,
 * что человеку сразу нужен поиск знакомств, а не форма анкеты.
 */
export default async function UnionPage() {
  const user = await requireUser();
  if (!hasCompleteUnionLocation(user)) redirect("/union/location");

  const state = await getUnionProfileState();
  redirect(state?.profile ? "/union/recommendations" : "/union/profile");
}
