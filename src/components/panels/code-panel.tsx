"use client";

import { useMemo, useState } from "react";
import { useGameForge } from "@/lib/game-forge-context";
import { isCodeFile } from "@/lib/project-files";

function isThreeMeshFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (lower.includes("/meshes/") || lower.includes("mesh")) && (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".ts"));
}

function buildMeshPreviewHtml(source: string): string {
  const sourceLiteral = JSON.stringify(source);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0f0f23; }
    #app { width: 100%; height: 100%; }
    #err { position: absolute; left: 8px; right: 8px; bottom: 8px; color: #ffb4b4; font: 11px monospace; white-space: pre-wrap; pointer-events: none; }
  </style>
</head>
<body>
  <div id="app"></div>
  <div id="err"></div>
  <script type="module">
    import * as THREE from 'https://unpkg.com/three@0.167.1/build/three.module.js';
    import { OrbitControls } from 'https://unpkg.com/three@0.167.1/examples/jsm/controls/OrbitControls.js';

    const app = document.getElementById('app');
    const errEl = document.getElementById('err');

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(app.clientWidth, app.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    app.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f0f23');

    const camera = new THREE.PerspectiveCamera(55, app.clientWidth / app.clientHeight, 0.1, 1000);
    camera.position.set(3, 2, 4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(4, 6, 4);
    scene.add(key);

    scene.add(new THREE.GridHelper(10, 10, 0x345, 0x234));

    const source = ${sourceLiteral};
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));

    let meshObj;
    try {
      const mod = await import(url);
      const builders = [mod.createMesh, mod.createObject3D, mod.default];
      for (const fn of builders) {
        if (typeof fn === 'function') {
          const candidate = await fn({ THREE, scene, camera, renderer });
          if (candidate && candidate.isObject3D) {
            meshObj = candidate;
            break;
          }
        }
      }
    } catch (error) {
      errEl.textContent = String(error);
    } finally {
      URL.revokeObjectURL(url);
    }

    if (!meshObj) {
      meshObj = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ color: 0x4fd1c5, metalness: 0.2, roughness: 0.45 })
      );
    }

    scene.add(meshObj);

    const box = new THREE.Box3().setFromObject(meshObj);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    const center = box.getCenter(new THREE.Vector3());
    meshObj.position.sub(center);
    camera.near = Math.max(0.01, size / 100);
    camera.far = Math.max(100, size * 50);
    camera.position.set(size * 1.4, size * 1.1, size * 1.6);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    function onResize() {
      const w = app.clientWidth;
      const h = app.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }

    window.addEventListener('resize', onResize);

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    animate();
  </script>
</body>
</html>`;
}

export function CodePanel() {
  const { projectFiles, updateProjectFile } = useGameForge();
  const codeFiles = useMemo(() => projectFiles.filter(isCodeFile), [projectFiles]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const effectiveSelectedPath =
    selectedPath && codeFiles.some((file) => file.path === selectedPath)
      ? selectedPath
      : (codeFiles[0]?.path ?? null);
  const selectedFile = codeFiles.find((file) => file.path === effectiveSelectedPath) ?? null;

  const showMeshPreview = !!selectedFile && isThreeMeshFile(selectedFile.path);

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      <div className="w-44 border-r border-[var(--color-border)] overflow-y-auto">
        {codeFiles.length === 0 ? (
          <p className="text-[10px] text-[var(--color-text-muted)] p-3 uppercase">No code files</p>
        ) : (
          codeFiles.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              className={`w-full text-left px-3 py-2 text-[10px] uppercase tracking-wider border-b border-[var(--color-border)] ${
                file.path === effectiveSelectedPath
                  ? "bg-[var(--color-accent-glow)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {file.path}
            </button>
          ))
        )}
      </div>

      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className="px-3 py-1.5 border-b border-[var(--color-border)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] flex items-center justify-between">
              <span>{selectedFile.path}</span>
              {showMeshPreview ? <span className="text-[var(--color-accent)]">3D preview enabled</span> : null}
            </div>

            <div className={`flex-1 min-h-0 ${showMeshPreview ? "grid grid-cols-2" : "grid grid-cols-1"}`}>
              <textarea
                value={selectedFile.content}
                onChange={(e) => updateProjectFile(selectedFile.path, e.target.value)}
                className="w-full h-full bg-[var(--color-bg)] text-[11px] text-[var(--color-text-secondary)] p-3 font-[var(--font-mono)] outline-none resize-none border-r border-[var(--color-border)]"
              />

              {showMeshPreview ? (
                <iframe
                  key={`${selectedFile.path}:${selectedFile.content.length}`}
                  srcDoc={buildMeshPreviewHtml(selectedFile.content)}
                  sandbox="allow-scripts"
                  title="Mesh Preview"
                  className="h-full w-full border-none bg-black"
                />
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--color-text-muted)] uppercase">
            No code selected
          </div>
        )}
      </div>
    </div>
  );
}
