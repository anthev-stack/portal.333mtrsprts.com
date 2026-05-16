"use client";

import { useEffect, useState, startTransition } from "react";
import { toast } from "sonner";
import { AccountStatus, Role, ThemePreference } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ProfilePhotoUpload } from "@/components/portal/profile-photo-upload";

type UserRow = {
  id: string;
  name: string;
  internalEmail: string;
  externalEmail: string;
  role: Role;
  department: string | null;
  position: string | null;
  imageUrl: string | null;
  accountStatus: AccountStatus;
  canViewTeamStaffContacts: boolean;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  address: string | null;
  phone: string | null;
  profileBlurp: string | null;
  themePreference: ThemePreference;
  notifyEmail: boolean;
  notifyInApp: boolean;
  emailFooter: string;
  awayModeEnabled: boolean;
  awayModeTemplate: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  actor: { name: string; internalEmail: string };
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [internalEmail, setInternalEmail] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(Role.STAFF);
  const [newUserImageUrl, setNewUserImageUrl] = useState<string | null>(null);
  const [newUserImageBusy, setNewUserImageBusy] = useState(false);

  const [editDraft, setEditDraft] = useState<UserRow | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editPhotoBusy, setEditPhotoBusy] = useState(false);

  async function uploadProfileImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("purpose", "profile");
    const res = await fetch("/api/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? "Upload failed");
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  }

  async function load(): Promise<UserRow[]> {
    let nextUsers: UserRow[] = [];
    const [meRes, uRes, aRes] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include" }),
      fetch("/api/admin/users", { credentials: "include" }),
      fetch("/api/admin/audit?take=30", { credentials: "include" }),
    ]);
    if (meRes.ok) {
      const data = (await meRes.json()) as { user: { id: string } };
      setMeId(data.user.id);
    }
    if (uRes.ok) {
      const data = (await uRes.json()) as { users: UserRow[] };
      nextUsers = data.users;
      setUsers(data.users);
    }
    if (aRes.ok) {
      const data = (await aRes.json()) as { logs: AuditRow[] };
      setLogs(data.logs);
    }
    return nextUsers;
  }

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, []);

  async function createUser() {
    const res = await fetch("/api/admin/users", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        internalEmail,
        externalEmail,
        password,
        role,
        ...(newUserImageUrl ? { imageUrl: newUserImageUrl } : {}),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      toast.error(body?.error ?? "Could not create user");
      return;
    }
    toast.success("User created");
    setOpen(false);
    setName("");
    setInternalEmail("");
    setExternalEmail("");
    setPassword("");
    setRole(Role.STAFF);
    setNewUserImageUrl(null);
    await load();
  }

  async function saveEdit() {
    if (!editDraft) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editDraft.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          externalEmail: editDraft.externalEmail.trim().toLowerCase(),
          role: editDraft.role,
          department: editDraft.department?.trim() || null,
          position: editDraft.position?.trim() || null,
          address: editDraft.address?.trim() || null,
          phone: editDraft.phone?.trim() || null,
          emergencyContact: editDraft.emergencyContact?.trim() || null,
          emergencyPhone: editDraft.emergencyPhone?.trim() || null,
          profileBlurp: editDraft.profileBlurp?.trim() || null,
          imageUrl: editDraft.imageUrl,
          canViewTeamStaffContacts: editDraft.canViewTeamStaffContacts,
          themePreference: editDraft.themePreference,
          notifyEmail: editDraft.notifyEmail,
          notifyInApp: editDraft.notifyInApp,
          emailFooter: editDraft.emailFooter,
          awayModeEnabled: editDraft.awayModeEnabled,
          awayModeTemplate: editDraft.awayModeTemplate?.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(body?.error ?? "Could not save user");
        return;
      }
      toast.success("User updated");
      setEditDraft(null);
      await load();
    } finally {
      setEditSaving(false);
    }
  }

  async function requestReset(id: string) {
    const res = await fetch(`/api/admin/users/${id}/password-reset`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Could not trigger reset");
      return;
    }
    toast.success("Reset email sent (check server logs in development)");
  }

  async function accountAction(
    id: string,
    action: "pause" | "unpause" | "delete",
  ) {
    if (
      action === "delete" &&
      !window.confirm(
        "Permanently delete this account? This cannot be undone. The user, their profile, and related portal data will be removed.\n\nUse Pause if you only need to block sign-in temporarily.",
      )
    ) {
      return;
    }
    const res = await fetch(`/api/admin/users/${id}/account`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error ?? "Could not update account");
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { deleted?: boolean };
    if (data.deleted) {
      toast.success("Account permanently deleted");
    } else {
      toast.success("Account updated");
    }
    const fresh = await load();
    setEditDraft((d) => {
      if (!d) return null;
      if (action === "delete" && d.id === id) return null;
      if (d.id === id) return fresh.find((x) => x.id === id) ?? null;
      return d;
    });
  }

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
            <p className="text-sm text-muted-foreground">
              Manage people, permissions, and security events. Pause blocks sign-in without removing data;
              delete permanently removes an account (no restore).
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Add user</Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team directory</CardTitle>
            <p className="text-xs text-muted-foreground">
              Open <span className="font-medium text-foreground">Edit</span> to change profile, org fields,
              portal settings for a user, profile photo, Team contact visibility, password reset email, or account status.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14" />
                  <TableHead>Name</TableHead>
                  <TableHead>Internal</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Avatar className="size-9">
                        <AvatarImage src={u.imageUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-xs">
                          {u.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.internalEmail}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.accountStatus === AccountStatus.ACTIVE && (
                        <Badge variant="outline" className="font-normal">
                          Active
                        </Badge>
                      )}
                      {u.accountStatus === AccountStatus.PAUSED && (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => setEditDraft({ ...u })}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 pr-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {new Date(l.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">{l.actor.name}</TableCell>
                      <TableCell className="text-xs">
                        {l.action} · {l.entityType}
                        {l.entityId ? ` · ${l.entityId}` : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setNewUserImageUrl(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New staff account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="an">Name</Label>
              <Input id="an" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai">Internal email</Label>
              <Input
                id="ai"
                type="email"
                value={internalEmail}
                onChange={(e) => setInternalEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ae">External email</Label>
              <Input
                id="ae"
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ap">Temporary password (min 12)</Label>
              <Input
                id="ap"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole((v ?? Role.STAFF) as Role)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.STAFF}>Staff</SelectItem>
                  <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profile photo</Label>
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarImage src={newUserImageUrl ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {name.trim() ? name.slice(0, 2).toUpperCase() : "—"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={newUserImageBusy}
                    className="cursor-pointer text-xs file:mr-2"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      void (async () => {
                        setNewUserImageBusy(true);
                        try {
                          const url = await uploadProfileImage(f);
                          setNewUserImageUrl(url);
                          toast.success("Photo uploaded");
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Upload failed",
                          );
                        } finally {
                          setNewUserImageBusy(false);
                        }
                      })();
                    }}
                  />
                  {newUserImageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 self-start px-2 text-xs"
                      onClick={() => setNewUserImageUrl(null)}
                    >
                      Remove photo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createUser()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editDraft}
        onOpenChange={(o) => {
          if (!o) setEditDraft(null);
        }}
      >
        <DialogContent className="!flex max-h-[min(90vh,840px)] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
            <DialogTitle>Edit user{editDraft ? ` — ${editDraft.name}` : ""}</DialogTitle>
            <DialogDescription>
              Internal email cannot be changed here. Save applies profile, directory fields, and portal preferences.
            </DialogDescription>
          </DialogHeader>

          {editDraft ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="space-y-6 px-6 py-4 pb-6">
                  <div className="space-y-3">
                    <Label>Profile photo</Label>
                    <ProfilePhotoUpload
                      name={editDraft.name}
                      imageUrl={editDraft.imageUrl}
                      busy={editPhotoBusy}
                      disabled={editSaving}
                      onPickFile={async (file) => {
                        setEditPhotoBusy(true);
                        try {
                          const url = await uploadProfileImage(file);
                          setEditDraft((d) => (d ? { ...d, imageUrl: url } : null));
                          toast.success("Photo uploaded — click Save changes to apply");
                        } catch (err) {
                          toast.error(
                            err instanceof Error ? err.message : "Upload failed",
                          );
                        } finally {
                          setEditPhotoBusy(false);
                        }
                      }}
                      onRemove={() => {
                        setEditDraft((d) => (d ? { ...d, imageUrl: null } : null));
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-name">Full name</Label>
                      <Input
                        id="eu-name"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, name: e.target.value } : null))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Internal email</Label>
                      <Input value={editDraft.internalEmail} disabled />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-ext">External email</Label>
                      <Input
                        id="eu-ext"
                        type="email"
                        value={editDraft.externalEmail}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, externalEmail: e.target.value } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={editDraft.role}
                        onValueChange={(v) =>
                          setEditDraft((d) =>
                            d ? { ...d, role: (v ?? Role.STAFF) as Role } : null,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={Role.STAFF}>Staff</SelectItem>
                          <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="eu-dept">Department</Label>
                      <Input
                        id="eu-dept"
                        value={editDraft.department ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, department: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="eu-pos">Position</Label>
                      <Input
                        id="eu-pos"
                        value={editDraft.position ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, position: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-addr">Address</Label>
                      <Input
                        id="eu-addr"
                        value={editDraft.address ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, address: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-phone">Phone</Label>
                      <Input
                        id="eu-phone"
                        value={editDraft.phone ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, phone: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="eu-ec">Emergency contact</Label>
                      <Input
                        id="eu-ec"
                        value={editDraft.emergencyContact ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, emergencyContact: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="eu-ep">Emergency phone</Label>
                      <Input
                        id="eu-ep"
                        value={editDraft.emergencyPhone ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, emergencyPhone: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-blurp">Team directory intro</Label>
                      <Textarea
                        id="eu-blurp"
                        rows={3}
                        maxLength={600}
                        value={editDraft.profileBlurp ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, profileBlurp: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div className="pr-3">
                      <p className="text-sm font-medium">View all staff contacts on Team</p>
                      <p className="text-xs text-muted-foreground">
                        User sees everyone&apos;s phone, address, and emergency details on Team.
                      </p>
                    </div>
                    <Switch
                      checked={editDraft.canViewTeamStaffContacts}
                      disabled={editDraft.accountStatus !== AccountStatus.ACTIVE}
                      onCheckedChange={(v) =>
                        setEditDraft((d) =>
                          d ? { ...d, canViewTeamStaffContacts: v === true } : null,
                        )
                      }
                    />
                  </div>

                  <Separator />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Theme</Label>
                      <Select
                        value={editDraft.themePreference}
                        onValueChange={(v) =>
                          setEditDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  themePreference: (v ??
                                    ThemePreference.SYSTEM) as ThemePreference,
                                }
                              : null,
                          )
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
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                      <span className="text-sm font-medium">Email notifications</span>
                      <Switch
                        checked={editDraft.notifyEmail}
                        onCheckedChange={(v) =>
                          setEditDraft((d) => (d ? { ...d, notifyEmail: v } : null))
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                      <span className="text-sm font-medium">In-app notifications</span>
                      <Switch
                        checked={editDraft.notifyInApp}
                        onCheckedChange={(v) =>
                          setEditDraft((d) => (d ? { ...d, notifyInApp: v } : null))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-footer">Default email footer</Label>
                      <Textarea
                        id="eu-footer"
                        rows={4}
                        value={editDraft.emailFooter}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, emailFooter: e.target.value } : null,
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                      <span className="text-sm font-medium">Away mode</span>
                      <Switch
                        checked={editDraft.awayModeEnabled}
                        onCheckedChange={(v) =>
                          setEditDraft((d) =>
                            d ? { ...d, awayModeEnabled: v } : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="eu-away">Away mode template</Label>
                      <Textarea
                        id="eu-away"
                        rows={4}
                        value={editDraft.awayModeTemplate ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, awayModeTemplate: e.target.value || null } : null,
                          )
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm font-medium text-destructive">Account & security</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void requestReset(editDraft.id)}
                      >
                        Email password reset
                      </Button>
                      {editDraft.id !== meId &&
                        editDraft.accountStatus === AccountStatus.ACTIVE && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void accountAction(editDraft.id, "pause")}
                          >
                            Pause account
                          </Button>
                        )}
                      {editDraft.id !== meId &&
                        editDraft.accountStatus === AccountStatus.PAUSED && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void accountAction(editDraft.id, "unpause")}
                          >
                            Unpause account
                          </Button>
                        )}
                      {editDraft.id !== meId && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void accountAction(editDraft.id, "delete")}
                        >
                          Delete account
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="!mx-0 !mb-0 shrink-0 gap-2 rounded-none border-t bg-background px-6 py-4 sm:justify-end">
                <Button variant="outline" onClick={() => setEditDraft(null)}>
                  Cancel
                </Button>
                <Button disabled={editSaving || editPhotoBusy} onClick={() => void saveEdit()}>
                  Save changes
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
