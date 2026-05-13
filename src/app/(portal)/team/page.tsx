"use client";

import { useCallback, useEffect, useState, startTransition } from "react";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Role } from "@prisma/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type TeamContact = {
  phone: string | null;
  address: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
} | null;

type TeamMember = {
  id: string;
  name: string;
  internalEmail: string;
  department: string | null;
  position: string | null;
  profileBlurp: string | null;
  imageUrl: string | null;
  role: Role;
  contact: TeamContact;
};

function MemberCardInner({ member }: { member: TeamMember }) {
  const c = member.contact;
  const hasContactDetail =
    c &&
    Boolean(
      c.phone?.trim() ||
        c.address?.trim() ||
        c.emergencyContact?.trim() ||
        c.emergencyPhone?.trim(),
    );
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate font-semibold leading-tight">{member.name}</p>
        <Badge variant={member.role === Role.ADMIN ? "default" : "secondary"} className="shrink-0 text-[10px]">
          {member.role}
        </Badge>
      </div>
      <p className="truncate text-xs text-muted-foreground">{member.internalEmail}</p>
      {(member.department || member.position) && (
        <p className="text-xs text-muted-foreground">
          {[member.position, member.department].filter(Boolean).join(" · ")}
        </p>
      )}
      {member.profileBlurp?.trim() ? (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
          {member.profileBlurp.trim()}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground">No intro yet</p>
      )}
      {hasContactDetail && (
        <div className="space-y-1 border-t pt-2 text-xs">
          <p className="font-medium text-foreground">Contact</p>
          {c.phone?.trim() ? <p>Phone: {c.phone}</p> : null}
          {c.address?.trim() ? (
            <p className="whitespace-pre-wrap text-muted-foreground">Address: {c.address}</p>
          ) : null}
          {c.emergencyContact?.trim() || c.emergencyPhone?.trim() ? (
            <p className="text-muted-foreground">
              Emergency: {[c.emergencyContact, c.emergencyPhone].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SortableMemberCard({ member, admin }: { member: TeamMember; admin: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
    disabled: !admin,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "overflow-hidden shadow-sm",
        isDragging && "z-20 opacity-90 ring-2 ring-primary",
      )}
    >
      <CardContent className="flex gap-3 p-4">
        {admin ? (
          <button
            type="button"
            className="mt-1 shrink-0 cursor-grab touch-none rounded-md border border-transparent p-0.5 text-muted-foreground hover:border-border hover:text-foreground active:cursor-grabbing"
            aria-label="Drag to reorder team directory"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-5" />
          </button>
        ) : null}
        <Avatar className="size-14 shrink-0">
          <AvatarImage src={member.imageUrl ?? undefined} alt="" />
          <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <MemberCardInner member={member} />
      </CardContent>
    </Card>
  );
}

function StaticMemberCard({ member }: { member: TeamMember }) {
  return (
    <Card className="overflow-hidden shadow-sm">
      <CardContent className="flex gap-3 p-4">
        <Avatar className="size-14 shrink-0">
          <AvatarImage src={member.imageUrl ?? undefined} alt="" />
          <AvatarFallback>{member.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <MemberCardInner member={member} />
      </CardContent>
    </Card>
  );
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team", { credentials: "include" });
      if (!res.ok) {
        setMembers([]);
        return;
      }
      const data = (await res.json()) as {
        members: TeamMember[];
        viewerIsAdmin: boolean;
      };
      setMembers(data.members);
      setViewerIsAdmin(data.viewerIsAdmin);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistOrder(orderedIds: string[]) {
    const res = await fetch("/api/admin/team-order", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error ?? "Could not save order");
      await load();
      return;
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!viewerIsAdmin) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = members.findIndex((m) => m.id === active.id);
    const newIndex = members.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(members, oldIndex, newIndex);
    setMembers(next);
    void persistOrder(next.map((m) => m.id));
  }

  const gridClass =
    "grid gap-4 max-sm:grid-cols-1 sm:auto-cols-fr sm:grid-flow-col sm:grid-rows-4";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Active staff directory. Cards fill four rows in a column, then continue to the next column.
          {viewerIsAdmin
            ? " Drag the handle to change display order for everyone."
            : " Edit your intro under Settings."}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active team members yet.</p>
      ) : viewerIsAdmin ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={members.map((m) => m.id)} strategy={rectSortingStrategy}>
            <div className={gridClass} style={{ gridTemplateRows: "repeat(4, minmax(0, auto))" }}>
              {members.map((m) => (
                <SortableMemberCard key={m.id} member={m} admin />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className={gridClass} style={{ gridTemplateRows: "repeat(4, minmax(0, auto))" }}>
          {members.map((m) => (
            <StaticMemberCard key={m.id} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}
