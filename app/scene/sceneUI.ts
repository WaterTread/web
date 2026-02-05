import type { Material } from "@babylonjs/core/Materials/material";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

type TransparencyBackup = {
  enabled: boolean;
  alpha: number;
  transparencyMode?: number;
  needAlphaBlending: boolean;
  needAlphaTesting: boolean;
};

const META_KEY = "__transparencyBackup";
const UNIQUE_MAT_KEY = "__uniqueMaterialCloned";

const focusCanvas = (canvas: HTMLCanvasElement) => {
  window.setTimeout(() => {
    canvas.focus();
  }, 0);
};

const getAlpha = (mat: Material): number => {
  const a = (mat as unknown as { alpha?: number }).alpha;
  return typeof a === "number" ? a : 1;
};

const setAlpha = (mat: Material, alpha: number) => {
  (mat as unknown as { alpha: number }).alpha = alpha;
};

const getTransparencyMode = (mat: Material): number | undefined => {
  const v = (mat as unknown as { transparencyMode?: number }).transparencyMode;
  return typeof v === "number" ? v : undefined;
};

const setTransparencyMode = (mat: Material, mode: number) => {
  (mat as unknown as { transparencyMode: number }).transparencyMode = mode;
};

const ensureMetadata = (mesh: AbstractMesh): Record<string, unknown> => {
  const md = mesh.metadata;
  if (md && typeof md === "object") return md as Record<string, unknown>;
  const fresh: Record<string, unknown> = {};
  mesh.metadata = fresh;
  return fresh;
};

const ensureUniqueMaterial = (mesh: AbstractMesh) => {
  if (!mesh.material) return;
  const md = ensureMetadata(mesh);
  if (md[UNIQUE_MAT_KEY] === true) return;

  const original = mesh.material as Material;
  const cloned = original.clone(
    `${original.name || "mat"}__${mesh.name}`,
  ) as Material;
  mesh.material = cloned;
  md[UNIQUE_MAT_KEY] = true;
};

const toggleMaterialTransparency = (mesh: AbstractMesh, alphaOn = 0.25) => {
  if (!mesh.material) return;

  ensureUniqueMaterial(mesh);

  const mat = mesh.material as Material;
  const md = ensureMetadata(mesh);

  let backup = md[META_KEY] as TransparencyBackup | undefined;
  if (!backup) {
    backup = {
      enabled: false,
      alpha: getAlpha(mat),
      transparencyMode: getTransparencyMode(mat),
      needAlphaBlending: mat.needAlphaBlending(),
      needAlphaTesting: mat.needAlphaTesting(),
    };
    md[META_KEY] = backup;
  }

  backup.enabled = !backup.enabled;

  if (backup.enabled) {
    setAlpha(mat, alphaOn);
    mat.needAlphaBlending = () => true;
    mat.needAlphaTesting = () => false;

    if (getTransparencyMode(mat) !== undefined) {
      setTransparencyMode(mat, 2); // ALPHABLEND
    }
  } else {
    setAlpha(mat, backup.alpha);
    mat.needAlphaBlending = () => backup!.needAlphaBlending;
    mat.needAlphaTesting = () => backup!.needAlphaTesting;

    if (backup.transparencyMode !== undefined) {
      setTransparencyMode(mat, backup.transparencyMode);
    }
  }
};

const findMeshByName = (scene: Scene, name: string): AbstractMesh | null => {
  const exact = scene.getMeshByName(name);
  if (exact) return exact as AbstractMesh;

  const lower = name.toLowerCase();
  const all = scene.meshes as AbstractMesh[];

  return (
    all.find((m) => m.name.toLowerCase() === lower) ??
    all.find((m) => m.name.toLowerCase().includes(lower)) ??
    null
  );
};

export const createButtonsUI = (options: {
  scene: Scene;
  host: HTMLElement;
  canvas: HTMLCanvasElement;
}) => {
  const { scene, host, canvas } = options;

  // ensure host positioning
  if (host !== document.body) {
    const cs = window.getComputedStyle(host);
    if (cs.position === "static") host.style.position = "relative";
  }

  const ui = document.createElement("div");
  ui.style.position = "fixed";
  ui.style.right = "16px";
  ui.style.bottom = "calc(16px + env(safe-area-inset-bottom, 0px) + 0px)";
  ui.style.top = "auto";
  ui.style.transform = "none";
  ui.style.zIndex = "9999";
  ui.style.display = "flex";
  ui.style.flexDirection = "column";
  ui.style.gap = "6px";
  ui.style.alignItems = "center";

  const makeRoundButton = (iconClass: string, title: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = title;

    b.style.width = "38px";
    b.style.height = "38px";
    b.style.borderRadius = "999px";
    b.style.border = "1px solid rgba(255,255,255,0.14)";
    b.style.background = "rgba(0,0,0,0.70)";
    b.style.backdropFilter = "blur(8px)";
    b.style.display = "grid";
    b.style.placeItems = "center";
    b.style.cursor = "pointer";
    b.style.userSelect = "none";
    b.style.outline = "none";

    // prevent button from stealing focus
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    b.addEventListener("mouseenter", () => {
      b.style.background = "rgba(0,0,0,0.82)";
    });
    b.addEventListener("mouseleave", () => {
      b.style.background = "rgba(0,0,0,0.70)";
    });

    const i = document.createElement("i");
    i.className = iconClass;
    i.style.color = "white";
    i.style.fontSize = "14px";
    i.style.lineHeight = "1";

    b.appendChild(i);
    return { button: b, icon: i };
  };

  // X-ray
  let xrayEnabled = false;

  const { button: xrayBtn, icon: xrayIcon } = makeRoundButton(
    "fa-solid fa-eye", // default when OFF
    "Enable Side Panel X-ray",
  );

  const setXrayIcon = () => {
    if (xrayEnabled) {
      xrayIcon.className = "fa-solid fa-eye";
      xrayBtn.title = "Disable Side Panel X-ray";
    } else {
      xrayIcon.className = "fa-solid fa-eye-low-vision";
      xrayBtn.title = "Enable Side Panel X-ray";
    }
  };

  xrayBtn.addEventListener("click", () => {
    const mesh = findMeshByName(scene, "Side Panel");
    if (mesh) {
      toggleMaterialTransparency(mesh, 0.25);
      xrayEnabled = !xrayEnabled;
      setXrayIcon();
    }
    focusCanvas(canvas);
  });

  // initial
  setXrayIcon();

  // Play/Pause
  let animationsPaused = false;
  const { button: playPauseBtn, icon: playPauseIcon } = makeRoundButton(
    "fa-solid fa-pause",
    "Pause animations",
  );

  const setPlayPauseIcon = () => {
    if (animationsPaused) {
      playPauseIcon.className = "fa-solid fa-play";
      playPauseBtn.title = "Play animations";
    } else {
      playPauseIcon.className = "fa-solid fa-pause";
      playPauseBtn.title = "Pause animations";
    }
  };

  playPauseBtn.addEventListener("click", () => {
    animationsPaused = !animationsPaused;
    for (const ag of scene.animationGroups) {
      if (animationsPaused) ag.pause();
      else ag.play(true);
    }
    setPlayPauseIcon();
    focusCanvas(canvas);
  });

  ui.appendChild(playPauseBtn);
  ui.appendChild(xrayBtn);

  host.appendChild(ui);
  scene.onDisposeObservable.add(() => ui.remove());
};
