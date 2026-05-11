"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bold, ImagePlus, Italic, List, ListOrdered, Smile } from "lucide-react";
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

export function RichEditor({
  content,
  onChange,
  className,
  onUploadFile,
  compact = false,
  /** Team-feed comments: bold, italic, GIF only (no lists, headings, etc.). */
  commentMode = false,
}: {
  content: string;
  onChange: (html: string) => void;
  className?: string;
  onUploadFile?: (file: File) => Promise<{ url: string }>;
  /** Shorter editor + GIF picker for inline comment composers. */
  compact?: boolean;
  commentMode?: boolean;
}) {
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifLoading, setGifLoading] = useState(false);
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const editor = useEditor(
    {
      extensions: [commentMode ? commentStarterKit : StarterKit, Image],
      content,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class: cn(
            "rounded-md border bg-background px-3 py-2 text-sm focus:outline-none",
            compact ? "min-h-[100px]" : "min-h-[180px]",
          ),
        },
      },
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML());
      },
    },
    [commentMode],
  );

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (content && content !== current) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  async function insertImage(file: File) {
    if (!editor || !onUploadFile) return;
    const uploaded = await onUploadFile(file);
    editor.chain().focus().setImage({ src: uploaded.url }).run();
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
        {!commentMode && (
          <>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
              className="size-8"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
              className="size-8"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="size-4" />
            </Button>
          </>
        )}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
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
            title="Insert image"
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
