import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Full-screen overlay that shows an image at its natural size for close
 * inspection (receipts, tree scans/photos). Click the backdrop, press Esc, or
 * tap the close button to dismiss. Rendered via a portal so it sits above
 * dialogs and page chrome.
 */
export function ImageLightbox({
  src,
  alt = "",
  open,
  onClose,
}: {
  src: string | null | undefined;
  alt?: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Prevent the page behind from scrolling while the overlay is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !src) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 text-white p-2 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl cursor-default"
      />
    </div>,
    document.body,
  );
}
