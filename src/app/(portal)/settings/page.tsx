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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  async function uploadProfileImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", "profile");
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "Upload failed");
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  }

  async function persistProfilePhotoUrl(url: string | null) {
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ imageUrl: url }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "Could not save profile photo");
    }
    return (await res.json()) as { user: User };
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
        emergencyContact: user.emergencyContact,
        emergencyPhone: user.emergencyPhone,
        position: user.position,
        department: user.department,
        profileBlurp: user.profileBlurp?.trim() ? user.profileBlurp.trim() : null,
        imageUrl: user.imageUrl,
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
              onChange={(e) =>
                setUser({ ...user, department: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos">Position</Label>
            <Input
              id="pos"
              value={user.position ?? ""}
              onChange={(e) =>
                setUser({ ...user, position: e.target.value })
              }
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Avatar className="size-20 shrink-0">
                <AvatarImage src={user.imageUrl ?? undefined} alt="" />
                <AvatarFallback className="text-lg">
                  {user.name.trim()
                    ? user.name.slice(0, 2).toUpperCase()
                    : "—"}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={photoBusy}
                  className="cursor-pointer text-sm file:mr-2"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    void (async () => {
                      setPhotoBusy(true);
                      try {
                        const url = await uploadProfileImage(f);
                        const { user: updated } = await persistProfilePhotoUrl(url);
                        setUser(updated);
                        toast.success("Profile photo saved");
                        router.refresh();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Upload failed",
                        );
                      } finally {
                        setPhotoBusy(false);
                      }
                    })();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={photoBusy || !user.imageUrl}
                  onClick={() => {
                    void (async () => {
                      setPhotoBusy(true);
                      try {
                        const { user: updated } = await persistProfilePhotoUrl(null);
                        setUser(updated);
                        toast.success("Profile photo removed");
                        router.refresh();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Could not remove photo",
                        );
                      } finally {
                        setPhotoBusy(false);
                      }
                    })();
                  }}
                >
                  Remove profile photo
                </Button>
              </div>
            </div>
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
