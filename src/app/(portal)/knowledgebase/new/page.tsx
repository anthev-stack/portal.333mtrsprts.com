"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichEditor } from "@/components/portal/rich-editor";
import { htmlHasMeaningfulBody } from "@/lib/html";

export default function NewArticlePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  async function uploadFileForInlineImage(file: File) {
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

  function addDocuments(files: FileList | null) {
    if (!files?.length) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!htmlHasMeaningfulBody(bodyHtml)) {
      toast.error("Add body text, an image, or a GIF");
      return;
    }
    setLoading(true);
    try {
      const tagNames = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/kb", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: bodyHtml,
          excerpt: excerpt.trim() || undefined,
          category: category.trim() || undefined,
          tagNames,
        }),
      });
      const data = (await res.json()) as { error?: string; article?: { id: string } };
      if (!res.ok) {
        toast.error(data.error ?? "Could not save");
        return;
      }
      const articleId = data.article!.id;

      for (const file of pendingFiles) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("articleId", articleId);
        const up = await fetch("/api/upload", {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!up.ok) {
          toast.error(`Could not attach ${file.name}`);
        }
      }

      toast.success("Article published");
      router.push(`/knowledgebase/${articleId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New article</h1>
        <p className="text-sm text-muted-foreground">
          Format with bold, italics, lists, images, and GIFs — same tools as mail. Add downloadable
          documents below the editor.
        </p>
      </div>
      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="excerpt">Excerpt</Label>
          <Input
            id="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            placeholder="Product guides, FAQs…"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tags">Tags (comma separated)</Label>
          <Input
            id="tags"
            placeholder="brakes, warranty, supplier"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Body</Label>
          <div className="min-h-[280px] rounded-md border bg-background p-2">
            <RichEditor
              content={bodyHtml}
              onChange={setBodyHtml}
              onUploadFile={uploadFileForInlineImage}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="kb-docs">Attachments (downloadable)</Label>
          <Input
            id="kb-docs"
            type="file"
            multiple
            onChange={(e) => {
              addDocuments(e.target.files);
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">
            Files are linked at the bottom of the article. Viewers can download them from the article
            page.
          </p>
          {pendingFiles.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {pendingFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => removePendingFile(i)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={loading}>
            Publish
          </Button>
        </div>
      </div>
    </div>
  );
}
