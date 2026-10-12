import { useState } from "react";
import { GiftIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Product photos are usually shot on white, so they sit on a white tile in both themes.
// Items without a photo keep the same footprint so rows stay aligned.
export function ItemThumbnail({
  src,
  className,
}: {
  src?: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const showImage = src && failedSrc !== src;

  return (
    <div
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md",
        showImage ? "bg-white p-1" : "bg-muted",
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          // Shops don't need to know which list (or share link) the image was viewed from
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
          className="size-full object-contain"
        />
      ) : (
        <GiftIcon className="size-5 text-muted-foreground" />
      )}
    </div>
  );
}
