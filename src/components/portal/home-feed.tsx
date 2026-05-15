"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle, Pencil, Pin, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RichEditor } from "@/components/portal/rich-editor";
import { htmlHasMeaningfulBody } from "@/lib/html";

/** Plain-text legacy posts → editor HTML */
function feedPostToEditorHtml(raw: string): string {
  const t = raw.trim();
  if (!t) return "<p></p>";
  if (/<[a-z]/i.test(t)) return raw;
  const esc = t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paras = esc.split(/\n+/).filter(Boolean);
  return paras.length ? paras.map((p) => `<p>${p}</p>`).join("") : "<p></p>";
}

/** Plain-text legacy posts → safe HTML for reading */
function feedPostDisplayHtml(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/<[a-z]/i.test(t)) return raw;
  const esc = t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<p>${esc.replace(/\n/g, "<br />")}</p>`;
}

type FeedComment = {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; imageUrl: string | null };
};

type Post = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; name: string; imageUrl: string | null };
  comments: FeedComment[];
  _count: { comments: number; reactions: number };
};

type Me = { id: string; role: "STAFF" | "ADMIN" };

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function HomeFeed() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [pinned, setPinned] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [commentEditorKey, setCommentEditorKey] = useState<
    Record<string, number>
  >({});
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [deletePostTarget, setDeletePostTarget] = useState<Post | null>(null);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [pRes, mRes] = await Promise.all([
        fetch("/api/posts", { credentials: "include" }),
        fetch("/api/auth/me", { credentials: "include" }),
      ]);
      if (pRes.ok) {
        const data = (await pRes.json()) as { posts: Post[] };
        setPosts(
          data.posts.map((p) => ({
            ...p,
            comments: p.comments ?? [],
          })),
        );
      } else if (pRes.status === 401) {
        toast.error("Session expired — refresh the page or sign in again");
      } else {
        toast.error("Could not load team feed");
      }
      if (mRes.ok) {
        const data = (await mRes.json()) as { user: Me };
        setMe(data.user);
      }
    })();
  }, []);

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

  async function refresh() {
    const pRes = await fetch("/api/posts", { credentials: "include" });
    if (pRes.ok) {
      const data = (await pRes.json()) as { posts: Post[] };
      setPosts(
        data.posts.map((p) => ({
          ...p,
          comments: p.comments ?? [],
        })),
      );
    } else if (!pRes.ok && pRes.status !== 401) {
      toast.error("Could not refresh feed");
    }
    router.refresh();
  }

  async function createPost() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!htmlHasMeaningfulBody(bodyHtml)) {
      toast.error("Add post body text, an image, or a GIF");
      return;
    }
    const res = await fetch("/api/posts", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: bodyHtml, pinned }),
    });
    if (!res.ok) {
      const msg =
        res.status === 401
          ? "Not signed in"
          : (await res.json().catch(() => null) as { error?: string } | null)
              ?.error ?? "Could not publish";
      toast.error(msg);
      return;
    }
    toast.success("Published");
    setOpen(false);
    setTitle("");
    setBodyHtml("<p></p>");
    setPinned(false);
    await refresh();
  }

  async function addComment(postId: string) {
    const html = commentDrafts[postId] ?? "<p></p>";
    if (!htmlHasMeaningfulBody(html)) {
      toast.error("Write something, add a list item, an image, or a GIF");
      return;
    }
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: html }),
    });
    if (!res.ok) {
      const msg =
        (await res.json().catch(() => null) as { error?: string } | null)
          ?.error ?? "Could not add comment";
      toast.error(msg);
      return;
    }
    setCommentDrafts((d) => ({ ...d, [postId]: "<p></p>" }));
    setCommentEditorKey((k) => ({ ...k, [postId]: (k[postId] ?? 0) + 1 }));
    toast.success("Comment added");
    await refresh();
  }

  async function toggleReaction(postId: string) {
    const emoji = "👍";
    const res = await fetch(`/api/posts/${postId}/reactions`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) {
      toast.error("Could not react");
      return;
    }
    await refresh();
  }

  function openEditPost(post: Post) {
    setEditPost(post);
    setEditTitle(post.title);
    setEditContent(feedPostToEditorHtml(post.content));
    setEditPinned(post.pinned);
  }

  async function submitEditPost() {
    if (!editPost || !editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!htmlHasMeaningfulBody(editContent)) {
      toast.error("Post body cannot be empty");
      return;
    }
    const body: { title: string; content: string; pinned?: boolean } = {
      title: editTitle.trim(),
      content: editContent,
    };
    if (me?.role === "ADMIN") body.pinned = editPinned;
    const res = await fetch(`/api/posts/${editPost.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg =
        (await res.json().catch(() => null) as { error?: string } | null)
          ?.error ?? "Could not update post";
      toast.error(msg);
      return;
    }
    setEditPost(null);
    toast.success("Post updated");
    await refresh();
  }

  async function confirmDeletePost() {
    if (!deletePostTarget) return;
    const res = await fetch(`/api/posts/${deletePostTarget.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Could not delete post");
      return;
    }
    setDeletePostTarget(null);
    toast.success("Post deleted");
    await refresh();
  }

  async function confirmDeleteComment() {
    if (!deleteCommentId) return;
    const res = await fetch(`/api/post-comments/${deleteCommentId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Could not delete comment");
      return;
    }
    setDeleteCommentId(null);
    toast.success("Comment deleted");
    await refresh();
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4" />
            Team feed
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            New post
          </Button>
        </div>

        <div className="space-y-4">
        {posts.map((post, i) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
          >
            <Card className="overflow-hidden shadow-sm">
              <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-3">
                <Avatar className="size-10">
                  <AvatarImage src={post.author.imageUrl ?? undefined} />
                  <AvatarFallback>
                    {post.author.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{post.author.name}</p>
                    {post.pinned && (
                      <Badge variant="secondary" className="gap-1 text-[10px]">
                        <Pin className="size-3" />
                        Pinned
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(post.createdAt)}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold leading-snug">
                    {post.title}
                  </h2>
                </div>
                {me &&
                  (me.role === "ADMIN" || me.id === post.author.id) && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Edit post"
                        onClick={() => openEditPost(post)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        title="Delete post"
                        onClick={() => setDeletePostTarget(post)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="text-sm text-muted-foreground [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:font-semibold [&_img]:max-h-[min(70vh,36rem)] [&_img]:max-w-full [&_img]:rounded-md [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_strong]:text-foreground"
                  dangerouslySetInnerHTML={{
                    __html: feedPostDisplayHtml(post.content),
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => void toggleReaction(post.id)}
                  >
                    👍 {post._count.reactions}
                  </Button>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageCircle className="size-3.5" />
                    {post._count.comments} comments
                  </div>
                </div>
                <Separator />
                {post.comments.length > 0 && (
                  <ul className="space-y-4">
                    {post.comments.map((c) => (
                      <li key={c.id} className="flex gap-3">
                        <Avatar className="size-8 shrink-0">
                          <AvatarImage src={c.author.imageUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {c.author.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-sm font-medium">
                              {c.author.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(c.createdAt)}
                            </span>
                          </div>
                          <div
                            className="text-sm text-muted-foreground [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_img]:max-h-48 [&_img]:max-w-full [&_img]:rounded-md [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_p:empty]:min-h-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-foreground"
                            dangerouslySetInnerHTML={{ __html: c.content }}
                          />
                        </div>
                        {me &&
                          (me.role === "ADMIN" || me.id === c.author.id) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-destructive hover:text-destructive"
                              title="Delete comment"
                              onClick={() => setDeleteCommentId(c.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Add a comment
                  </Label>
                  <RichEditor
                    key={`comment-${post.id}-${commentEditorKey[post.id] ?? 0}`}
                    compact
                    feedCommentMode
                    content={commentDrafts[post.id] ?? "<p></p>"}
                    onChange={(html) =>
                      setCommentDrafts((d) => ({ ...d, [post.id]: html }))
                    }
                    onUploadFile={uploadInlineImage}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void addComment(post.id)}
                  >
                    Comment
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {posts.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No posts yet. Share an update to kick things off.
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>New post</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="pt">Title</Label>
              <Input
                id="pt"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-post-body">Content</Label>
              <div className="min-h-[220px] rounded-md border bg-background p-2">
                <RichEditor
                  content={bodyHtml}
                  onChange={setBodyHtml}
                  onUploadFile={uploadInlineImage}
                />
              </div>
            </div>
            {me?.role === "ADMIN" && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Pin for everyone</p>
                  <p className="text-xs text-muted-foreground">
                    Sends an in-app notification to staff.
                  </p>
                </div>
                <Switch checked={pinned} onCheckedChange={setPinned} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void createPost()}>Publish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editPost}
        onOpenChange={(o) => {
          if (!o) setEditPost(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>Edit post</DialogTitle>
            <DialogDescription>
              {me?.role === "ADMIN"
                ? "Update this post for everyone. You can change pinned status."
                : "Update your post."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-pt">Title</Label>
              <Input
                id="edit-pt"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-edit-body">Content</Label>
              <div className="min-h-[220px] rounded-md border bg-background p-2">
                <RichEditor
                  content={editContent}
                  onChange={setEditContent}
                  onUploadFile={uploadInlineImage}
                />
              </div>
            </div>
            {me?.role === "ADMIN" && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Pin for everyone</p>
                  <p className="text-xs text-muted-foreground">
                    Pinned posts appear at the top.
                  </p>
                </div>
                <Switch checked={editPinned} onCheckedChange={setEditPinned} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPost(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitEditPost()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletePostTarget}
        onOpenChange={(o) => !o && setDeletePostTarget(null)}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete post?</DialogTitle>
            <DialogDescription>
              This removes the post and all of its comments. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePostTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeletePost()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteCommentId !== null}
        onOpenChange={(o) => !o && setDeleteCommentId(null)}
      >
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Delete comment?</DialogTitle>
            <DialogDescription>
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCommentId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDeleteComment()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
