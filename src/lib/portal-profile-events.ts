export const PORTAL_PROFILE_UPDATED_EVENT = "portal-profile-updated";

export type PortalProfileSnapshot = {
  name: string;
  imageUrl: string | null;
  internalEmail?: string;
  role?: "STAFF" | "ADMIN";
};

export function dispatchPortalProfileUpdated(detail: PortalProfileSnapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PORTAL_PROFILE_UPDATED_EVENT, { detail }),
  );
}
