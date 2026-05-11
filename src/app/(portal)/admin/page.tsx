"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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

type UserRow = {
  id: string;
  name: string;
  internalEmail: string;
  externalEmail: string;
  role: Role;
  department: string | null;
  imageUrl: string | null;
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
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [internalEmail, setInternalEmail] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(Role.STAFF);
  const [newUserImageUrl, setNewUserImageUrl] = useState<string | null>(null);
  const [newUserImageBusy, setNewUserImageBusy] = useState(false);
  const [photoUser, setPhotoUser] = useState<UserRow | null>(null);
  const [photoDraftUrl, setPhotoDraftUrl] = useState<string | null>(null);
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

  async function load() {
    const [uRes, aRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/audit?take=30"),
    ]);
    if (uRes.ok) {
      const data = (await uRes.json()) as { users: UserRow[] };
      setUsers(data.users);
    }
    if (aRes.ok) {
      const data = (await aRes.json()) as { logs: AuditRow[] };
      setLogs(data.logs);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser() {
    const res = await fetch("/api/admin/users", {
      method: "POST",
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

  function openPhotoDialog(u: UserRow) {
    setPhotoUser(u);
    setPhotoDraftUrl(u.imageUrl);
  }

  async function savePhoto() {
    if (!photoUser) return;
    setPhotoBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${photoUser.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageUrl: photoDraftUrl?.trim() ? photoDraftUrl.trim() : null,
        }),
      });
      if (!res.ok) {
        toast.error("Could not update photo");
        return;
      }
      toast.success("Profile photo updated");
      setPhotoUser(null);
      await load();
    } finally {
      setPhotoBusy(false);
    }
  }

  async function requestReset(id: string) {
    const res = await fetch(`/api/admin/users/${id}/password-reset`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Could not trigger reset");
      return;
    }
    toast.success("Reset email sent (check server logs in development)");
  }

  return (
    <>
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
          <p className="text-sm text-muted-foreground">
            Manage people, permissions, and security events.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Add user</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team directory</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14" />
                <TableHead>Name</TableHead>
                <TableHead>Internal</TableHead>
                <TableHead>Role</TableHead>
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
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openPhotoDialog(u)}
                    >
                      Photo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void requestReset(u.id)}
                    >
                      Email reset
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
      open={!!photoUser}
      onOpenChange={(o) => {
        if (!o) setPhotoUser(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Profile photo{photoUser ? ` — ${photoUser.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex justify-center">
            <Avatar className="size-24">
              <AvatarImage src={photoDraftUrl ?? undefined} alt="" />
              <AvatarFallback>
                {photoUser?.name.slice(0, 2).toUpperCase() ?? "—"}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="space-y-2">
            <Label>Upload image</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={photoBusy}
              className="cursor-pointer text-xs file:mr-2"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void (async () => {
                  setPhotoBusy(true);
                  try {
                    const url = await uploadProfileImage(f);
                    setPhotoDraftUrl(url);
                    toast.success("Photo uploaded — save to apply");
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo-url">Image URL (optional)</Label>
            <Input
              id="photo-url"
              value={photoDraftUrl ?? ""}
              onChange={(e) =>
                setPhotoDraftUrl(e.target.value ? e.target.value : null)
              }
              placeholder="https://… or /uploads/…"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={photoBusy}
            onClick={() => setPhotoDraftUrl(null)}
          >
            Clear photo
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPhotoUser(null)}>
            Cancel
          </Button>
          <Button disabled={photoBusy} onClick={() => void savePhoto()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
