"use client";

import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GeneratedMesh } from "@/lib/game-forge-context";

function MeshViewer({
  mesh,
  onClose,
}: {
  mesh: GeneratedMesh;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh.glbUrl) {
      if (!mesh.glbUrl) setLoadError("No GLB URL available for this mesh");
      setLoading(false);
      return;
    }

    setLoadError(null);
    setLoading(true);
    let cancelled = false;
    let animId = 0;

    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width) || 400;
    const height = Math.round(rect.height) || 400;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setLoadError("Failed to create WebGL context");
      setLoading(false);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(dpr);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(3, 5, 4);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xaaccff, 0.6);
    fillLight.position.set(-3, 0, -2);
    scene.add(fillLight);
    const backLight = new THREE.DirectionalLight(0xffddaa, 0.4);
    backLight.position.set(0, -2, -4);
    scene.add(backLight);

    const gridHelper = new THREE.GridHelper(10, 20, 0x333355, 0x222244);
    scene.add(gridHelper);

    const loader = new GLTFLoader();
    loader.load(
      mesh.glbUrl,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2 / maxDim : 1;
        model.scale.setScalar(scale);
        model.position.sub(center.clone().multiplyScalar(scale));
        model.position.y += (size.y * scale) / 2;
        scene.add(model);
        controls.target.set(0, (size.y * scale) / 2, 0);
        controls.update();
        setLoading(false);
      },
      undefined,
      (err) => {
        if (!cancelled) {
          console.error("GLB load error:", err);
          setLoadError("Failed to load 3D model");
          setLoading(false);
        }
      },
    );

    const animate = () => {
      if (cancelled) return;
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
    };
  }, [mesh.glbUrl]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
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
          {loadError ? (
            <div className="w-full aspect-square flex items-center justify-center">
              <div className="text-center space-y-2 px-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-danger)"
                  strokeWidth="1.5"
                  className="mx-auto"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v5M12 16v.01" />
                </svg>
                <p className="text-[10px] text-[var(--color-danger)]">
                  {loadError}
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="w-full aspect-square block"
              />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" className="animate-spin">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="40" strokeLinecap="round" opacity="0.5" />
                  </svg>
                </div>
              )}
            </div>
          )}
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

export default function MeshPreviewModal({
  mesh,
  onClose,
}: {
  mesh: GeneratedMesh;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <MeshViewer mesh={mesh} onClose={onClose} />,
    document.body,
  );
}
