"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormFieldType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

type DraftField = {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  options: string;
};

const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "SHORT_TEXT", label: "Short text" },
  { value: "LONG_TEXT", label: "Paragraph" },
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTI_CHOICE", label: "Multiple choice" },
  { value: "DATE", label: "Date" },
  { value: "NUMBER", label: "Number" },
  { value: "EMAIL_FIELD", label: "Email" },
];

function SortableField({
  field,
  onChange,
  onRemove,
}: {
  field: DraftField;
  onChange: (f: DraftField) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card ref={setNodeRef} style={style} className="shadow-sm">
      <CardContent className="flex gap-3 p-4">
        <button
          type="button"
          className="mt-1 text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Label</Label>
            <Input
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={field.type}
              onValueChange={(v) =>
                onChange({
                  ...field,
                  type: (v ?? field.type) as FormFieldType,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(field.type === "SINGLE_CHOICE" || field.type === "MULTI_CHOICE") && (
            <div className="space-y-2 md:col-span-2">
              <Label>Options (comma separated)</Label>
              <Input
                value={field.options}
                onChange={(e) => onChange({ ...field, options: e.target.value })}
              />
            </div>
          )}
          <div className="flex items-center justify-between md:col-span-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={field.required}
                onCheckedChange={(v) => onChange({ ...field, required: v })}
              />
              <span className="text-sm">Required</span>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NewFormPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Staff feedback");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [fields, setFields] = useState<DraftField[]>([
    {
      id: crypto.randomUUID(),
      type: "SHORT_TEXT",
      label: "Full name",
      required: true,
      options: "",
    },
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    setFields((items) => arrayMove(items, oldIndex, newIndex));
  }

  function addField() {
    setFields((f) => [
      ...f,
      {
        id: crypto.randomUUID(),
        type: "LONG_TEXT",
        label: "New question",
        required: false,
        options: "",
      },
    ]);
  }

  async function save() {
    const payload = {
      title,
      description: description || undefined,
      isPublic,
      fields: fields.map((f) => ({
        type: f.type,
        label: f.label,
        required: f.required,
        options: f.options
          .split(",")
          .map((o) => o.trim())
          .filter(Boolean),
      })),
    };

    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      toast.error("Could not create form");
      return;
    }
    const data = (await res.json()) as { form: { id: string } };
    toast.success("Form created");
    router.push(`/forms/${data.form.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New form</h1>
        <p className="text-sm text-muted-foreground">
          Drag fields to reorder. Share the generated link with your audience.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="ft">Title</Label>
            <Input id="ft" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="fd">Description</Label>
            <Textarea
              id="fd"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 md:col-span-2">
            <div>
              <p className="text-sm font-medium">Public link</p>
              <p className="text-xs text-muted-foreground">
                Anyone with the link can submit (still useful for RSVPs).
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Questions</h2>
          <Button type="button" size="sm" variant="outline" onClick={addField}>
            <Plus className="mr-1 size-4" />
            Add field
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {fields.map((field) => (
                <SortableField
                  key={field.id}
                  field={field}
                  onChange={(f) =>
                    setFields((prev) => prev.map((x) => (x.id === f.id ? f : x)))
                  }
                  onRemove={() =>
                    setFields((prev) => prev.filter((x) => x.id !== field.id))
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={() => void save()}>Create form</Button>
      </div>
    </div>
  );
}
