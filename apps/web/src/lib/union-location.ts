import type { UserProfile } from "@vedamatch/shared";

export function hasCompleteUnionLocation(
  user: Pick<UserProfile, "homeLocation">,
): boolean {
  const location = user.homeLocation;
  return Boolean(
    location?.city?.trim() &&
      location.country?.trim() &&
      Number.isFinite(location.lat) &&
      Number.isFinite(location.lon),
  );
}
