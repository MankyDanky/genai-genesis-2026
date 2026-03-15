"use client";

import { useState, useCallback, useRef, useEffect, type FormEvent, type KeyboardEvent } from "react";
import type { GeneratedImage } from "@/lib/game-forge-context";

interface ImagesPanelProps {
  images: GeneratedImage[];
  onAddImage: (image: GeneratedImage) => void;
}

function ImportButton({ onAddImage }: { onAddImage: (image: GeneratedImage) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/images/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        onAddImage({ url: data.url, prompt: file.name });
      }
    } catch {
      console.error("Upload failed");
    }
    e.target.value = "";
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="gf-btn-chip w-6 h-6 flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] text-sm font-bold"
        title="Import image"
      >
        +
      </button>
    </>
  );
}

function EditPopup({
  image,
  onClose,
  onAddImage,
}: {
  image: GeneratedImage;
  onClose: () => void;
  onAddImage: (image: GeneratedImage) => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [input]);

  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, loading]);

  const imageId = image.url.split("/api/images/")[1];
  const doSubmit = async () => {
    const text = input.trim();
    if (!text || loading || !imageId) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/images/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId, prompt: text }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Edit failed");
      }

      onAddImage({ url: data.url, prompt: text });
      setInput("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSubmit();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && !loading) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      style={{ animation: "fadeIn 0.15s ease-out" }}
    >
      <div className="flex flex-col items-center gap-4 max-w-[520px] w-full mx-4">
        <div className="relative border border-[var(--color-border-light)] bg-black">
          <button
            onClick={() => {
              const a = document.createElement("a");
              a.href = image.url;
              a.download = `${image.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, "-")}.png`;
              a.click();
            }}
            className="absolute -top-3 -right-12 w-6 h-6 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-glow)] text-xs z-10 transition-all duration-150"
            title="Download image"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button
            onClick={() => !loading && onClose()}
            className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs z-10 transition-colors"
          >
            &times;
          </button>
          <img
            src={image.url}
            alt={image.prompt}
            className="max-h-[50vh] w-auto object-contain"
          />
        </div>

        <p className="text-[10px] text-[var(--color-text-muted)] text-center max-w-[400px] leading-relaxed">
          {image.prompt}
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2 w-full">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe how to edit this image..."
            disabled={loading}
            rows={1}
            className="gf-input flex-1 min-w-0 bg-[var(--color-surface)] text-[var(--color-text)] text-[12px] leading-relaxed px-3 py-2 border border-[var(--color-border-light)] outline-none placeholder:text-[var(--color-text-muted)] disabled:opacity-50 resize-none overflow-hidden"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="gf-btn-chip shrink-0 w-[34px] self-stretch flex items-center justify-center border border-[var(--color-border-light)] bg-[var(--color-surface)] text-[var(--color-text-muted)] disabled:opacity-20 disabled:cursor-default"
            aria-label="Send"
          >
            {loading ? (
              <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin">
                <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <path d="M1 1l10 5-10 5z" />
              </svg>
            )}
          </button>
        </form>

        {error && (
          <p className="text-[10px] text-[var(--color-danger)] uppercase tracking-wider">
            {error}
          </p>
        )}

        {loading && (
          <p className="text-[10px] text-[var(--color-accent)] uppercase tracking-[0.15em] font-bold">
            Editing image...
          </p>
        )}
      </div>
    </div>
  );
}

export function ImagesPanel({ images, onAddImage }: ImagesPanelProps) {
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  const handleClose = useCallback(() => setSelectedImage(null), []);

  if (images.length === 0) {
    return (
      <div className="relative flex h-full flex-col bg-[var(--color-bg)]">
        <div className="absolute top-2 right-2 z-10">
          <ImportButton onAddImage={onAddImage} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2" opacity="0.6">
              <rect x="1" y="3" width="18" height="14" rx="1" />
              <circle cx="7" cy="8" r="2" />
              <path d="M1 15l5-5 3 3 5-6 5 5" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Images Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated images will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--color-bg)] flex flex-col overflow-hidden">
      <div className="shrink-0 px-2 py-2 flex justify-end">
        <ImportButton onAddImage={onAddImage} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {images.map((image, i) => (
            <div
              key={`${image.url}-${i}`}
              className="border border-[var(--color-border-light)] overflow-hidden cursor-pointer hover:border-[var(--color-accent)] transition-colors"
              onClick={() => setSelectedImage(image)}
              style={{ animation: "fadeIn 0.2s ease-out" }}
            >
              <div className="group/img relative aspect-square overflow-hidden bg-black">
                <img
                  src={image.url}
                  alt={image.prompt}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  title="Download image"
                  onClick={(e) => {
                    e.stopPropagation();
                    const a = document.createElement("a");
                    a.href = image.url;
                    a.download = `${image.prompt.slice(0, 40).replace(/[^a-zA-Z0-9]+/g, "-")}.png`;
                    a.click();
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-black/70 border border-[var(--color-border-light)] text-[var(--color-text-muted)] opacity-0 group-hover/img:opacity-100 hover:!border-[var(--color-accent)] hover:!text-[var(--color-accent)] hover:!bg-[var(--color-accent-glow)] transition-all duration-150"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] text-[var(--color-text-secondary)] leading-tight line-clamp-2">
                  {image.prompt}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedImage && (
        <EditPopup
          image={selectedImage}
          onClose={handleClose}
          onAddImage={onAddImage}
        />
      )}
    </div>
  );
}
