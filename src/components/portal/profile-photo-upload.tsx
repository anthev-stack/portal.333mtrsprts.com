"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ProfilePhotoUploadProps = {
  name: string;
  imageUrl: string | null;
  disabled?: boolean;
  busy?: boolean;
  avatarClassName?: string;
  onPickFile: (file: File) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
};

export function ProfilePhotoUpload({
  name,
  imageUrl,
  disabled = false,
  busy = false,
  avatarClassName = "size-20",
  onPickFile,
  onRemove,
}: ProfilePhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPhoto = Boolean(imageUrl?.trim());

  const initials = name.trim()
    ? name.slice(0, 2).toUpperCase()
    : "—";

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <Avatar className={`${avatarClassName} shrink-0`}>
        <AvatarImage
          key={imageUrl ?? "no-avatar"}
          src={imageUrl ?? undefined}
          alt=""
        />
        <AvatarFallback className="text-lg">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={disabled || busy}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void onPickFile(f);
          }}
        />
        {hasPhoto ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              Change profile photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              disabled={disabled || busy}
              onClick={() => void onRemove()}
            >
              Remove profile photo
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            Upload profile photo
          </Button>
        )}
      </div>
    </div>
  );
}
