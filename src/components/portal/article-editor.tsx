"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichEditor } from "@/components/portal/rich-editor";
import { htmlHasMeaningfulBody } from "@/lib/html";

function articleBodyToEditorHtml(raw: string): string {
  const t = raw.trim();
  if (!t) return "<p></p>";
  if (t.startsWith("<")) return raw;
  const esc = t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paras = esc.split(/\n+/).filter(Boolean);
  return paras.length ? paras.map((p) => `<p>${p}</p>`).join("") : "<p></p>";
}

export function ArticleEditor({
  articleId,
  initialTitle,
  initialContent,
  initialExcerpt,
  initialCategory,
  initialTags,
  initialPublished,
  isAdmin,
}: {
  articleId: string;
  initialTitle: string;
  initialContent: string;
  initialExcerpt: string;
  initialCategory: string;
  initialTags: string;
  initialPublished: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [bodyHtml, setBodyHtml] = useState(() =>
    articleBodyToEditorHtml(initialContent),
  );
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [category, setCategory] = useState(initialCategory);
  const [tags, setTags] = useState(initialTags);
  const [published, setPublished] = useState(initialPublished);

  useEffect(() => {
    if (editOpen) {
      setTitle(initialTitle);
      setBodyHtml(articleBodyToEditorHtml(initialContent));
      setExcerpt(initialExcerpt);
      setCategory(initialCategory);
      setTags(initialTags);
      setPublished(initialPublished);
    }
  }, [
    editOpen,
    initialTitle,
    initialContent,
    initialExcerpt,
    initialCategory,
    initialTags,
    initialPublished,
  ]);

  async function uploadInlineImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      throw new Error("Upload failed");
    }
    const data = (await res.json()) as { url: string };
    return { url: data.url };
  }

  async function saveEdits() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!htmlHasMeaningfulBody(bodyHtml)) {
      toast.error("Body cannot be empty");
      return;
    }
    const tagNames = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = {
      title: title.trim(),
      content: bodyHtml,
      excerpt: excerpt.trim() || null,
      category: category.trim() || null,
      tagNames,
    };
    if (isAdmin) body.published = published;

    const res = await fetch(`/api/kb/${articleId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg =
        (await res.json().catch(() => null) as { error?: string } | null)
          ?.error ?? "Could not save changes";
      toast.error(msg);
      return;
    }
    toast.success("Saved");
    setEditOpen(false);
    router.refresh();
  }

  async function removeArticle() {
    const res = await fetch(`/api/kb/${articleId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Could not delete article");
      return;
    }
    toast.success("Article deleted");
    setDeleteOpen(false);
    router.push("/knowledgebase");
    router.refresh();
  }

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("articleId", articleId);
    const res = await fetch("/api/upload", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!res.ok) {
      toast.error("Upload failed");
      return;
    }
    toast.success("File attached");
    setFile(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        Edit article
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
      >
        Delete
      </Button>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent
          className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl"
          showCloseButton
        >
          <DialogHeader>
            <DialogTitle>Edit article</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "You can update any field and visibility."
                : "Update your article. Only admins can unpublish or change pinned visibility."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="et">Title</Label>
              <Input id="et" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ee">Excerpt</Label>
              <Input id="ee" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ecat">Category</Label>
              <Input id="ecat" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="etag">Tags (comma separated)</Label>
              <Input id="etag" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <div className="min-h-[220px] rounded-md border bg-background p-2">
                <RichEditor
                  content={bodyHtml}
                  onChange={setBodyHtml}
                  onUploadFile={uploadInlineImage}
                />
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Published</p>
                  <p className="text-xs text-muted-foreground">
                    Unpublished articles are hidden from the knowledge base.
                  </p>
                </div>
                <Switch checked={published} onCheckedChange={setPublished} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdits()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete article?</DialogTitle>
            <DialogDescription>
              This permanently removes the article and its tag links. Attachments stay in storage but are unlinked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void removeArticle()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex w-full min-w-[200px] flex-1 basis-full items-center gap-2 sm:basis-auto">
        <Input
          type="file"
          className="max-w-xs"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button size="sm" variant="secondary" onClick={() => void upload()}>
          Upload
        </Button>
      </div>
    </div>
  );
}
