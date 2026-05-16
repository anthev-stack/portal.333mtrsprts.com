export type ProfilePhotoUser = {
  id?: string;
  name: string;
  imageUrl: string | null;
  internalEmail: string;
  role: "STAFF" | "ADMIN";
  externalEmail?: string;
  address?: string | null;
  phone?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  position?: string | null;
  department?: string | null;
  profileBlurp?: string | null;
  themePreference?: string;
  notifyEmail?: boolean;
  notifyInApp?: boolean;
  emailFooter?: string;
  awayModeEnabled?: boolean;
  awayModeTemplate?: string | null;
};

/** Upload an image file and persist its URL on the current user via PATCH /api/me. */
export async function uploadAndSaveProfilePhoto(
  file: File,
): Promise<ProfilePhotoUser> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", "profile");

  const uploadRes = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!uploadRes.ok) {
    const err = (await uploadRes.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(err?.error ?? "Upload failed");
  }
  const { url } = (await uploadRes.json()) as { url: string };

  const patchRes = await fetch("/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ imageUrl: url }),
  });
  if (!patchRes.ok) {
    const body = (await patchRes.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Could not save profile photo");
  }

  const data = (await patchRes.json()) as { user: ProfilePhotoUser };
  return data.user;
}

export async function clearProfilePhoto(): Promise<ProfilePhotoUser> {
  const res = await fetch("/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ imageUrl: null }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not remove profile photo");
  }
  const data = (await res.json()) as { user: ProfilePhotoUser };
  return data.user;
}
