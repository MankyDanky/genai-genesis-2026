"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { GeneratedMesh } from "@/lib/game-forge-context";

interface MeshesPanelProps {
  meshes: GeneratedMesh[];
  onRemoveMesh: (id: string) => void;
}

function StatusBadge({ status }: { status: GeneratedMesh["status"] }) {
  const colors = {
    pending: "text-[var(--color-accent)] border-[var(--color-accent)]",
    ready: "text-[var(--color-success,#4ade80)] border-[var(--color-success,#4ade80)]",
    error: "text-[var(--color-danger)] border-[var(--color-danger)]",
  };

  return (
    <span
      className={`text-[8px] uppercase tracking-[0.1em] font-bold border px-1 py-0.5 ${colors[status]}`}
    >
      {status}
    </span>
  );
}

function SpinnerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="animate-spin">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeDasharray="40"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function MeshPreviewModal({
  mesh,
  onClose,
}: {
  mesh: GeneratedMesh;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh.glbUrl) return;

    let cancelled = false;

    async function initViewer() {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");

      if (cancelled || !canvas) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(2, 1.5, 2);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 2;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
      dirLight.position.set(3, 5, 4);
      scene.add(dirLight);
      const fillLight = new THREE.DirectionalLight(0xaaccff, 0.4);
      fillLight.position.set(-3, 0, -2);
      scene.add(fillLight);

      const gridHelper = new THREE.GridHelper(10, 20, 0x333355, 0x222244);
      scene.add(gridHelper);

      const loader = new GLTFLoader();
      loader.load(
        mesh.glbUrl!,
        (gltf) => {
          if (cancelled) return;
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 2 / maxDim;
          model.scale.setScalar(scale);
          model.position.sub(center.multiplyScalar(scale));
          model.position.y += (size.y * scale) / 2;
          scene.add(model);
          controls.target.set(0, (size.y * scale) / 2, 0);
          controls.update();
        },
        undefined,
        (err) => console.error("GLB load error:", err),
      );

      let animId = 0;
      const animate = () => {
        if (cancelled) return;
        animId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      cleanupRef.current = () => {
        cancelAnimationFrame(animId);
        controls.dispose();
        renderer.dispose();
      };
    }

    void initViewer();
    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [mesh.glbUrl]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      style={{ animation: "fadeIn 0.15s ease-out" }}
    >
      <div className="flex flex-col items-center gap-3 max-w-[600px] w-full mx-4">
        <div className="relative w-full border border-[var(--color-border-light)] bg-[#1a1a2e]">
          <button
            onClick={onClose}
            className="absolute -top-3 -right-3 w-6 h-6 flex items-center justify-center bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-xs z-10 transition-colors"
          >
            &times;
          </button>
          <canvas
            ref={canvasRef}
            className="w-full aspect-square"
            style={{ display: "block" }}
          />
        </div>

        <div className="text-center space-y-1">
          <p className="text-[11px] text-[var(--color-text)] font-semibold">
            {mesh.name}
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed max-w-[400px]">
            {mesh.prompt}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MeshesPanel({ meshes, onRemoveMesh }: MeshesPanelProps) {
  const [selectedMesh, setSelectedMesh] = useState<GeneratedMesh | null>(null);

  const handleClose = useCallback(() => setSelectedMesh(null), []);

  if (meshes.length === 0) {
    return (
      <div className="relative flex h-full flex-col bg-[var(--color-bg)]">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border border-dashed border-[var(--color-border-light)] flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="var(--color-text-muted)"
              strokeWidth="1.2"
              opacity="0.6"
            >
              <path d="M10 2l7 4v8l-7 4-7-4V6l7-4z" />
              <path d="M10 10l7-4" />
              <path d="M10 10v8" />
              <path d="M10 10L3 6" />
            </svg>
          </div>
          <div className="text-center space-y-1">
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-[0.12em] font-semibold">
              No Meshes Yet
            </p>
            <p className="text-[10px] text-[var(--color-text-muted)] opacity-60">
              Generated 3D meshes will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--color-bg)] flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <div className="grid grid-cols-2 gap-2">
          {meshes.map((mesh) => (
            <div
              key={mesh.id}
              className="border border-[var(--color-border-light)] overflow-hidden cursor-pointer hover:border-[var(--color-accent)] transition-colors group relative"
              onClick={() => {
                if (mesh.status === "ready") setSelectedMesh(mesh);
              }}
              style={{ animation: "fadeIn 0.2s ease-out" }}
            >
              <div className="aspect-square overflow-hidden bg-black/50 flex items-center justify-center">
                {mesh.status === "pending" && <SpinnerIcon />}
                {mesh.status === "error" && (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-danger)"
                    strokeWidth="1.5"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v5M12 16v.01" />
                  </svg>
                )}
                {mesh.status === "ready" && mesh.thumbnailUrl && (
                  <img
                    src={mesh.thumbnailUrl}
                    alt={mesh.prompt}
                    className="w-full h-full object-cover"
                  />
                )}
                {mesh.status === "ready" && !mesh.thumbnailUrl && (
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-text-muted)"
                    strokeWidth="1.2"
                  >
                    <path d="M12 2l8 4.5v11L12 22l-8-4.5v-11L12 2z" />
                  </svg>
                )}
              </div>
              <div className="px-2 py-1.5 flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-[var(--color-text)] font-semibold truncate">
                    {mesh.name}
                  </p>
                  <p className="text-[9px] text-[var(--color-text-secondary)] leading-tight line-clamp-2">
                    {mesh.error || mesh.prompt}
                  </p>
                </div>
                <StatusBadge status={mesh.status} />
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMesh(mesh.id);
                }}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove mesh"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedMesh && (
        <MeshPreviewModal mesh={selectedMesh} onClose={handleClose} />
      )}
    </div>
  );
}
