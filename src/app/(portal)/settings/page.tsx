"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppTheme } from "@/components/theme/app-theme-provider";
import { ThemePreference } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfilePhotoUpload } from "@/components/portal/profile-photo-upload";
import {
  clearProfilePhoto,
  uploadAndSaveProfilePhoto,
} from "@/lib/profile-photo";
import { dispatchPortalProfileUpdated } from "@/lib/portal-profile-events";

type User = {
  id: string;
  name: string;
  internalEmail: string;
  externalEmail: string;
  address: string | null;
  phone: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  position: string | null;
  department: string | null;
  profileBlurp: string | null;
  imageUrl: string | null;
  role: "STAFF" | "ADMIN";
  themePreference: ThemePreference;
  notifyEmail: boolean;
  notifyInApp: boolean;
  emailFooter: string;
  awayModeEnabled: boolean;
  awayModeTemplate: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const { setTheme } = useAppTheme();
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  function syncProfilePhoto(snapshot: { name: string; imageUrl: string | null }) {
    setUser((current) => {
      if (!current) return current;
      const next = { ...current, name: snapshot.name, imageUrl: snapshot.imageUrl };
      dispatchPortalProfileUpdated({
        name: next.name,
        imageUrl: next.imageUrl,
        internalEmail: next.internalEmail,
        role: next.role,
      });
      return next;
    });
    router.refresh();
  }

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = (await res.json()) as { user: User };
      setUser(data.user);
    })();
  }, []);

  async function saveProfile() {
    if (!user) return;
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: user.name,
        externalEmail: user.externalEmail,
        address: user.address,
        phone: user.phone,
        emergencyContact: user.emergencyContact?.trim() || null,
        emergencyPhone: user.emergencyPhone?.trim() || null,
        profileBlurp: user.profileBlurp?.trim() ? user.profileBlurp.trim() : null,
        themePreference: user.themePreference,
        notifyEmail: user.notifyEmail,
        notifyInApp: user.notifyInApp,
        emailFooter: user.emailFooter,
        awayModeEnabled: user.awayModeEnabled,
        awayModeTemplate: user.awayModeTemplate,
        ...(newPassword
          ? { currentPassword, newPassword }
          : {}),
      }),
    });
    if (!res.ok) {
      toast.error("Could not save settings");
      return;
    }
    toast.success("Profile updated");
    setCurrentPassword("");
    setNewPassword("");
    const data = (await res.json()) as { user: User };
    setUser(data.user);
    if (data.user.themePreference === ThemePreference.DARK) setTheme("dark");
    if (data.user.themePreference === ThemePreference.LIGHT) setTheme("light");
    if (data.user.themePreference === ThemePreference.SYSTEM) setTheme("system");
    router.refresh();
  }

  if (!user) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Keep your profile current. Theme preference syncs across devices when you sign in.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Internal email</Label>
            <Input value={user.internalEmail} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ext">External email</Label>
            <Input
              id="ext"
              type="email"
              value={user.externalEmail}
              onChange={(e) =>
                setUser({ ...user, externalEmail: e.target.value })
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addr">Address</Label>
            <Input
              id="addr"
              value={user.address ?? ""}
              onChange={(e) => setUser({ ...user, address: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={user.phone ?? ""}
              onChange={(e) => setUser({ ...user, phone: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept">Department</Label>
            <Input
              id="dept"
              value={user.department ?? ""}
              disabled
              className="cursor-not-allowed bg-muted/50 text-muted-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos">Position</Label>
            <Input
              id="pos"
              value={user.position ?? ""}
              disabled
              className="cursor-not-allowed bg-muted/50 text-muted-foreground"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="blurp">Team directory intro</Label>
            <Textarea
              id="blurp"
              rows={3}
              maxLength={600}
              placeholder="A short line about yourself — shown on the Team page."
              value={user.profileBlurp ?? ""}
              onChange={(e) =>
                setUser({ ...user, profileBlurp: e.target.value || null })
              }
            />
            <p className="text-xs text-muted-foreground">
              Optional. Up to 600 characters. Visible to colleagues on Team.
            </p>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ec">Emergency contact</Label>
            <Input
              id="ec"
              value={user.emergencyContact ?? ""}
              onChange={(e) =>
                setUser({ ...user, emergencyContact: e.target.value })
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ep">Emergency phone</Label>
            <Input
              id="ep"
              value={user.emergencyPhone ?? ""}
              onChange={(e) =>
                setUser({ ...user, emergencyPhone: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance & notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Profile photo</Label>
            <ProfilePhotoUpload
              name={user.name}
              imageUrl={user.imageUrl}
              busy={photoBusy}
              onPickFile={async (file) => {
                setPhotoBusy(true);
                try {
                  const snapshot = await uploadAndSaveProfilePhoto(file);
                  syncProfilePhoto(snapshot);
                  toast.success("Profile photo saved");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Upload failed",
                  );
                } finally {
                  setPhotoBusy(false);
                }
              }}
              onRemove={async () => {
                setPhotoBusy(true);
                try {
                  const snapshot = await clearProfilePhoto();
                  syncProfilePhoto(snapshot);
                  toast.success("Profile photo removed");
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Could not remove photo",
                  );
                } finally {
                  setPhotoBusy(false);
                }
              }}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={user.themePreference}
              onValueChange={(v) =>
                setUser({
                  ...user,
                  themePreference: (v ?? ThemePreference.SYSTEM) as ThemePreference,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ThemePreference.SYSTEM}>System</SelectItem>
                <SelectItem value={ThemePreference.LIGHT}>Light</SelectItem>
                <SelectItem value={ThemePreference.DARK}>Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">
                Future integration with your external inbox.
              </p>
            </div>
            <Switch
              checked={user.notifyEmail}
              onCheckedChange={(v) => setUser({ ...user, notifyEmail: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium">In-app notifications</p>
              <p className="text-xs text-muted-foreground">
                Announcements, mail, and mentions.
              </p>
            </div>
            <Switch
              checked={user.notifyInApp}
              onCheckedChange={(v) => setUser({ ...user, notifyInApp: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="footer">Default email footer</Label>
            <Textarea
              id="footer"
              rows={4}
              value={user.emailFooter}
              onChange={(e) => setUser({ ...user, emailFooter: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              This footer is automatically added to your internal emails.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Away mode</p>
              <p className="text-xs text-muted-foreground">
                Auto-replies to messages while you still receive mail.
              </p>
            </div>
            <Switch
              checked={user.awayModeEnabled}
              onCheckedChange={(v) => setUser({ ...user, awayModeEnabled: v })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="away-template">Away mode auto-reply template</Label>
            <Textarea
              id="away-template"
              rows={5}
              value={user.awayModeTemplate ?? ""}
              onChange={(e) =>
                setUser({ ...user, awayModeTemplate: e.target.value || null })
              }
              placeholder="I'm currently away. For urgent help, contact..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cp">Current password</Label>
            <Input
              id="cp"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="np">New password</Label>
            <Input
              id="np"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />
      <div className="flex justify-end">
        <Button onClick={() => void saveProfile()}>Save changes</Button>
      </div>
    </div>
  );
}
