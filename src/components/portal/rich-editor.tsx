"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type GifResult = {
  id: string;
  title: string;
  previewUrl: string;
  url: string;
};

const commentStarterKit = StarterKit.configure({
  bulletList: false,
  orderedList: false,
  listItem: false,
  listKeymap: false,
  blockquote: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  link: false,
});

/** Team-feed comments: bold, italic, lists, images, GIF — no headings / alignment. */
const feedCommentStarterKit = StarterKit.configure({
  blockquote: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  strike: false,
  underline: false,
  link: false,
});

/** Absolute URL so images load reliably (e.g. TipTap / SSR edge cases); GIFs from Giphy stay https. */
function resolvePublicMediaSrc(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return base ? `${base}${path}` : path;
}

function buildExtensions(commentMode: boolean, feedCommentMode: boolean) {
  const image = Image.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: {
      class: "max-w-full h-auto rounded-md align-middle",
    },
  });

  if (feedCommentMode) {
    return [feedCommentStarterKit, image];
  }

  if (commentMode) {
    return [commentStarterKit, image];
  }

  return [
    StarterKit.configure({
      heading: {
        levels: [2, 3, 4],
      },
    }),
    TextAlign.configure({
      types: ["heading", "paragraph"],
      alignments: ["left", "center", "right"],
    }),
    image,
  ];
}

export function RichEditor({
  content,
  onChange,
  className,
  onUploadFile,
  compact = false,
  /** Ultra-minimal composer (bold, italic, image, GIF only). Prefer `feedCommentMode` for team feed. */
  commentMode = false,
  /** Team-feed comments: adds bullet/numbered lists; still compact-friendly. */
  feedCommentMode = false,
}: {
  content: string;
  onChange: (html: string) => void;
  className?: string;
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  /** Shorter editor + GIF picker for inline comment composers. */
  compact?: boolean;
  commentMode?: boolean;
  feedCommentMode?: boolean;
}) {
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifLoading, setGifLoading] = useState(false);
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor(
    {
      extensions: buildExtensions(commentMode, feedCommentMode),
      content,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            "prose-mirror-editor rounded-md border bg-background px-3 py-2 text-sm focus:outline-none",
            compact ? "min-h-[100px]" : "min-h-[180px]",
          ),
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
    },
    [commentMode, feedCommentMode],
  );

  const fullDocToolbar = !commentMode && !feedCommentMode;

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content && content !== current) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  async function insertImage(file: File) {
    if (!editor || !onUploadFile) return;
    const lower = file.name.toLowerCase();
    if (file.type === "image/heic" || lower.endsWith(".heic") || lower.endsWith(".heif")) {
      toast.error("HEIC/HEIF isn’t supported in browsers. Please use JPG, PNG, GIF, or WebP.");
      return;
    }
    try {
      const uploaded = await onUploadFile(file);
      const src = resolvePublicMediaSrc(uploaded.url);
      editor.chain().focus().setImage({ src }).run();
    } catch {
      toast.error("Could not upload image. Try JPG or PNG under a few MB.");
    }
  }

  async function loadGifs(query: string) {
    setGifLoading(true);
    try {
      const res = await fetch(
        `/api/giphy/search${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { gifs: GifResult[] };
      setGifResults(data.gifs);
    } finally {
      setGifLoading(false);
    }
  }

  if (!editor) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          className="size-8"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          className="size-8"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </Button>
        {feedCommentMode && (
          <>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
              className="size-8"
              title="Bullet list"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
              className="size-8"
              title="Numbered list"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-4" />
            </Button>
          </>
        )}
        {fullDocToolbar && (
          <>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("paragraph") ? "secondary" : "ghost"}
              className="size-8"
              title="Body text"
              onClick={() => editor.chain().focus().setParagraph().run()}
            >
              <Pilcrow className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
              className="size-8"
              title="Large section title"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
              className="size-8"
              title="Medium section title"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("heading", { level: 4 }) ? "secondary" : "ghost"}
              className="size-8"
              title="Small section title"
              onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            >
              <Heading4 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive({ textAlign: "left" }) ? "secondary" : "ghost"}
              className="size-8"
              title="Align left"
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            >
              <AlignLeft className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive({ textAlign: "center" }) ? "secondary" : "ghost"}
              className="size-8"
              title="Align center"
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            >
              <AlignCenter className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive({ textAlign: "right" }) ? "secondary" : "ghost"}
              className="size-8"
              title="Align right"
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            >
              <AlignRight className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
              className="size-8"
              title="Bullet list"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
              className="size-8"
              title="Numbered list"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-4" />
            </Button>
          </>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,.jpg,.jpeg,.png,.gif,.webp,.svg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void insertImage(file);
              e.currentTarget.value = "";
            }
          }}
        />
        {onUploadFile && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => imageInputRef.current?.click()}
            title="Insert image (JPG, PNG, GIF, WebP)"
          >
            <ImagePlus className="size-4" />
          </Button>
        )}
        <Button
          type="button"
          size="icon"
          variant={gifOpen ? "secondary" : "ghost"}
          className="size-8"
          onClick={() => {
            const next = !gifOpen;
            setGifOpen(next);
            if (next) void loadGifs(gifQuery);
          }}
          title="Insert GIF"
        >
          <Smile className="size-4" />
        </Button>
      </div>
      {gifOpen && (
        <div className="space-y-2 rounded-md border p-2">
          <div className="flex gap-2">
            <Input
              placeholder="Search Giphy…"
              value={gifQuery}
              onChange={(e) => setGifQuery(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadGifs(gifQuery)}
            >
              Search
            </Button>
          </div>
          <div
            className={cn(
              "grid gap-2 overflow-y-auto",
              compact ? "max-h-32 grid-cols-3" : "max-h-44 grid-cols-4",
            )}
          >
            {gifResults.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className="overflow-hidden rounded border hover:opacity-90"
                onClick={() => {
                  editor.chain().focus().setImage({ src: gif.url }).run();
                  setGifOpen(false);
                }}
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className={cn("w-full object-cover", compact ? "h-14" : "h-20")}
                />
              </button>
            ))}
          </div>
          {gifLoading && (
            <p className="text-xs text-muted-foreground">Loading GIFs…</p>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
