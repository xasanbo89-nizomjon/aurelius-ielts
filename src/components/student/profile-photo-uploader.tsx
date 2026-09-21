"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { uploadProfilePhotoAction } from "@/actions/profile.actions";
import { IMAGE_INPUT_ACCEPT, MAX_IMAGE_FILE_SIZE_LABEL, validateImageFile } from "@/lib/uploads/image-constraints";
import { getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function ProfilePhotoUploader({ name, email, image }: { name: string | null; email: string; image: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(image);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateImageFile({ name: file.name, size: file.size, type: file.type });
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);

    const formData = new FormData();
    formData.set("file", file);
    const result = await uploadProfilePhotoAction(formData);
    setUploading(false);

    if (!result.success) {
      setPreview(image);
      toast.error(result.error);
      return;
    }
    toast.success("Profile photo updated.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="size-20">
          <AvatarImage src={preview ?? undefined} alt={name ?? "Profile photo"} />
          <AvatarFallback className="text-lg">{getInitials(name, email)}</AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Change profile photo"
          className="bg-accent text-accent-foreground border-background absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full border-2 shadow-soft transition-transform hover:scale-105 disabled:pointer-events-none disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
        </button>
        <input ref={inputRef} type="file" accept={IMAGE_INPUT_ACCEPT} className="hidden" onChange={handleFileChange} />
      </div>
      <div className="space-y-0.5">
        <p className="font-display text-lg font-medium">{name ?? "Student"}</p>
        <p className="text-muted-foreground text-sm">{email}</p>
        <p className="text-muted-foreground text-xs">JPG, PNG or WEBP, up to {MAX_IMAGE_FILE_SIZE_LABEL}.</p>
      </div>
    </div>
  );
}
