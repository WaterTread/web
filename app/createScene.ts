import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import {
  Quaternion,
  Vector2,
  Vector3,
} from "@babylonjs/core/Maths/math.vector";
import { Tools } from "@babylonjs/core/Misc/tools";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";

import { SpotLight } from "@babylonjs/core/Lights/spotLight";

import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Material } from "@babylonjs/core/Materials/material";

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";

import { PostProcessRenderEffect } from "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderEffect";
import { PostProcessRenderPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipeline";
import { BlurPostProcess } from "@babylonjs/core/PostProcesses/blurPostProcess";

import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";

import HavokPhysics from "@babylonjs/havok";

// side-effects
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Physics/v2";
import "@babylonjs/loaders/glTF";

import { Color3, HemisphericLight } from "@babylonjs/core";
import { CharacterControls } from "./CharacterControls";
import { ParticleHelper } from "./ParticleHelper";
import { PointerController } from "./PointerController";
import { LoadingOverlay } from "./loadingOverlay";

type CharState = "IN_AIR" | "ON_GROUND" | "START_JUMP";

const HIDDEN_MESH_NAMES = ["Link_A", "Link_B", "CamPin", "CamFollower", "Wing"];

export default function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
): Scene {
  const scene = new Scene(engine);

  canvas.tabIndex = 1;
  canvas.style.outline = "none";

  const host = (canvas.parentElement ?? document.body) as HTMLElement;

  // Loading overlay component
  const loading = new LoadingOverlay(host);
  loading.show();
  scene.onDisposeObservable.add(() => loading.dispose());

  MeshBuilder.CreateBox(
    "backgroundCube",
    { size: 60, sideOrientation: Mesh.BACKSIDE },
    scene,
  ).layerMask = 1;

  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 5;
  scene.fogEnd = 25;
  scene.fogColor = new Color3(0.1, 0.08, 0.25);
  scene.fogDensity = 0.1;

  // --- Player camera (first-person)
  const camera = new FreeCamera("camera1", new Vector3(0, 5, -5), scene);
  camera.layerMask = 1;
  camera.minZ = 0.05;
  camera.maxZ = 500;
  scene.activeCamera = camera;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 3, 0), scene);
  hemi.intensity = 0.4;

  // ---------------------------------------------------------------------------
  // Transparent toggle helpers
  // ---------------------------------------------------------------------------
  type TransparencyBackup = {
    enabled: boolean;
    alpha: number;
    transparencyMode?: number;
    needAlphaBlending: boolean;
    needAlphaTesting: boolean;
  };

  const META_KEY = "__transparencyBackup";
  const UNIQUE_MAT_KEY = "__uniqueMaterialCloned";

  const focusCanvas = () => {
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
    const v = (mat as unknown as { transparencyMode?: number })
      .transparencyMode;
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

  const findMeshByName = (name: string): AbstractMesh | null => {
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

  // ---------------------------------------------------------------------------
  // Bottom-right buttons (created after loading completes)
  // ---------------------------------------------------------------------------
  const ensureFontAwesomeLoaded = () => {
    const id = "fa-cdn";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css";
    document.head.appendChild(link);
  };

  const createButtonsUI = () => {
    ensureFontAwesomeLoaded();

    // ensure host positioning
    if (host !== document.body) {
      const cs = window.getComputedStyle(host);
      if (cs.position === "static") host.style.position = "relative";
    }

    const ui = document.createElement("div");
    ui.style.position = "absolute";
    ui.style.right = "16px";
    ui.style.bottom = "16px";
    ui.style.zIndex = "9999";
    ui.style.display = "flex";
    ui.style.flexDirection = "column";
    ui.style.gap = "10px";
    ui.style.alignItems = "center";

    const makeRoundButton = (iconClass: string, title: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = title;

      b.style.width = "52px";
      b.style.height = "52px";
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
      i.style.fontSize = "18px";
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
      const mesh = findMeshByName("Side Panel");
      if (mesh) {
        toggleMaterialTransparency(mesh, 0.25);
        xrayEnabled = !xrayEnabled;
        setXrayIcon();
      }
      focusCanvas();
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
      focusCanvas();
    });

    ui.appendChild(playPauseBtn);
    ui.appendChild(xrayBtn);

    host.appendChild(ui);
    scene.onDisposeObservable.add(() => ui.remove());
  };

  // ---------------------------------------------------------------------------
  // Scene init
  // ---------------------------------------------------------------------------
  (async () => {
    loading.setText("Loading physics…");

    const havok = await HavokPhysics();
    const hk = new HavokPlugin(false, havok);
    scene.enablePhysics(new Vector3(0, -9.8, 0), hk);

    const pe = scene.getPhysicsEngine();
    if (pe) pe.setSubTimeStep(1000 / 60);

    // Boundary box
    const boxSize = 20;
    const wallHeight = 5;
    const wallThickness = 0.5;

    const half = boxSize / 2;
    const wallY = wallHeight / 2;

    const floor = MeshBuilder.CreateBox(
      "boundaryFloor",
      { width: boxSize, height: 1, depth: boxSize },
      scene,
    );
    floor.position.set(0, -0.5, 0);
    floor.layerMask = 1;
    floor.isVisible = false;
    new PhysicsAggregate(floor, PhysicsShapeType.BOX, { mass: 0 }, scene);

    const wallN = MeshBuilder.CreateBox(
      "boundaryWallN",
      { width: boxSize, height: wallHeight, depth: wallThickness },
      scene,
    );
    wallN.position.set(0, wallY, half);
    wallN.layerMask = 1;
    wallN.isVisible = false;
    new PhysicsAggregate(wallN, PhysicsShapeType.BOX, { mass: 0 }, scene);

    const wallS = MeshBuilder.CreateBox(
      "boundaryWallS",
      { width: boxSize, height: wallHeight, depth: wallThickness },
      scene,
    );
    wallS.position.set(0, wallY, -half);
    wallS.layerMask = 1;
    wallS.isVisible = false;
    new PhysicsAggregate(wallS, PhysicsShapeType.BOX, { mass: 0 }, scene);

    const wallE = MeshBuilder.CreateBox(
      "boundaryWallE",
      { width: wallThickness, height: wallHeight, depth: boxSize },
      scene,
    );
    wallE.position.set(half, wallY, 0);
    wallE.layerMask = 1;
    wallE.isVisible = false;
    new PhysicsAggregate(wallE, PhysicsShapeType.BOX, { mass: 0 }, scene);

    const wallW = MeshBuilder.CreateBox(
      "boundaryWallW",
      { width: wallThickness, height: wallHeight, depth: boxSize },
      scene,
    );
    wallW.position.set(-half, wallY, 0);
    wallW.layerMask = 1;
    wallW.isVisible = false;
    new PhysicsAggregate(wallW, PhysicsShapeType.BOX, { mass: 0 }, scene);

    // Slab
    const slabLength = 4.75;
    const slabWidth = 2;
    const slabHeight = 0.5;

    const slab = MeshBuilder.CreateBox(
      "concreteSlab",
      { width: slabWidth, height: slabHeight, depth: slabLength },
      scene,
    );
    slab.position.set(0, slabHeight / 2, 0);
    slab.layerMask = 1;

    const sandMat = new PBRMaterial("slabSand", scene);
    const sandTex = new Texture("textures/lined-cement.png", scene);

    sandMat.albedoTexture = sandTex;
    sandMat.metallic = 0.0;
    sandMat.roughness = 0.95;

    sandTex.uScale = 3.5;
    sandTex.vScale = 3.5;

    sandMat.albedoColor = new Color3(1.0, 0.98, 0.92);

    slab.material = sandMat;

    new PhysicsAggregate(slab, PhysicsShapeType.BOX, { mass: 0 }, scene);
    slab.isPickable = false;

    // --- Support slab: another slab on top, tilted 20 degrees as a support
    const supportLength = 3.75;
    const supportWidth = 2;
    const supportHeight = 1.5;
    const supportAngle = Tools.ToRadians(-20);

    const supportSlab = MeshBuilder.CreateBox(
      "supportSlab",
      { width: supportWidth, height: supportHeight, depth: supportLength },
      scene,
    );
    supportSlab.layerMask = 1;

    supportSlab.material = sandMat;

    // Make it static + not pickable
    supportSlab.isPickable = false;
    new PhysicsAggregate(supportSlab, PhysicsShapeType.BOX, { mass: 0 }, scene);

    // Pivot at the "bottom-back" edge so it tilts like a ramp resting on slab
    // Box local axes: width=X, height=Y, depth=Z
    supportSlab.setPivotPoint(
      new Vector3(0, -supportHeight / 2, -supportLength / 2),
    );

    // Place the pivot point on the top surface of the main slab
    supportSlab.position.set(
      slab.position.x,
      0.8,
      slab.position.z - slabLength * 0.12,
    );

    // Tilt upward (around X)
    supportSlab.rotationQuaternion = null;
    supportSlab.rotation.x = -supportAngle;

    const protoRootUrl = "/";
    const protoFile = "prototype_moving_parts.glb";

    let movingRoot: AbstractMesh | null = null;

    const matchTransform = (src: AbstractMesh, dst: AbstractMesh) => {
      src.computeWorldMatrix(true);

      dst.position.copyFrom(src.position);
      dst.scaling.copyFrom(src.scaling);

      if (src.rotationQuaternion) {
        dst.rotationQuaternion = src.rotationQuaternion.clone();
      } else {
        dst.rotationQuaternion = null;
        dst.rotation.copyFrom(src.rotation);
      }
    };

    const hideChildrenByName = (root: AbstractMesh, namesToHide: string[]) => {
      for (const m of root.getChildMeshes(true) as AbstractMesh[]) {
        if (namesToHide.includes(m.name)) {
          m.setEnabled(false);
          m.isPickable = false;
        }
      }
    };

    loading.setText("Loading moving parts…");

    // --- LOAD moving parts
    await new Promise<void>((resolve) => {
      SceneLoader.ImportMesh(
        "",
        protoRootUrl,
        protoFile,
        scene,
        (meshes, _ps, _sk, animationGroups) => {
          const root = meshes[0] as AbstractMesh | undefined;
          if (!root) {
            resolve();
            return;
          }

          movingRoot = root;

          for (const m of meshes) m.layerMask = 1;

          const greyPlastic = new PBRMaterial("greyPlastic", scene);
          greyPlastic.albedoColor = new Color3(0.45, 0.45, 0.48);
          greyPlastic.metallic = 0.0;
          greyPlastic.roughness = 0.6;

          const renderMeshes = root.getChildMeshes(true) as AbstractMesh[];
          for (const m of renderMeshes) {
            if (m.getTotalVertices && m.getTotalVertices() > 0) {
              m.material = greyPlastic;
            }
            m.layerMask = 1;
          }

          const slabTopY = slab.position.y + slabHeight / 2;

          root.computeWorldMatrix(true);
          const bi = root.getBoundingInfo();
          const minY = bi.boundingBox.minimumWorld.y;
          const deltaY = slabTopY - minY;

          root.rotationQuaternion = null;
          root.rotation.x = Tools.ToRadians(20);
          root.position.y += deltaY + 1;
          root.position.x = slab.position.x;
          root.position.z = slab.position.z;

          root.scaling.setAll(0.01);

          for (const cm of renderMeshes) {
            if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
            new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
          }

          for (const ag of animationGroups) ag.start(true);
          hideChildrenByName(root, HIDDEN_MESH_NAMES);

          resolve();
        },
      );
    });

    loading.setText("Loading static parts…");

    // --- LOAD static parts
    const staticFile = "prototype_static_parts.glb";

    await new Promise<void>((resolve) => {
      SceneLoader.ImportMesh("", protoRootUrl, staticFile, scene, (meshes) => {
        const root = meshes[0] as AbstractMesh | undefined;
        if (!root) {
          resolve();
          return;
        }

        for (const m of meshes) m.layerMask = 1;

        const whiteMat = new PBRMaterial("staticWhite", scene);
        whiteMat.albedoColor = new Color3(1, 1, 1);
        whiteMat.metallic = 0.0;
        whiteMat.roughness = 0.8;

        const renderMeshes = root.getChildMeshes(true) as AbstractMesh[];
        for (const m of renderMeshes) {
          if (m.getTotalVertices && m.getTotalVertices() > 0) {
            m.material = whiteMat;
          }
          m.layerMask = 1;
        }

        if (movingRoot) {
          matchTransform(movingRoot, root);
        } else {
          root.position.copyFrom(slab.position);
          root.scaling.setAll(0.01);
        }

        for (const cm of renderMeshes) {
          if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
          new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
        }

        resolve();
      });
    });

    loading.setText("Loading caustics…");

    // --- Caustics
    const textureCamera = new ArcRotateCamera(
      "textureCamera",
      0,
      0,
      190,
      Vector3.Zero(),
      scene,
    );
    textureCamera.layerMask = 2;
    textureCamera.mode = ArcRotateCamera.ORTHOGRAPHIC_CAMERA;
    textureCamera.orthoBottom = -7;
    textureCamera.orthoLeft = -7;
    textureCamera.orthoRight = 7;
    textureCamera.orthoTop = 7;

    const waterPlane = Mesh.CreateGround("waterPlane", 15, 15, 400, scene);
    waterPlane.layerMask = 2;

    const causticMaterial = await NodeMaterial.ParseFromSnippetAsync(
      "7X2PUH",
      scene,
    );
    causticMaterial.name = "causticMaterial";
    waterPlane.material = causticMaterial;

    const rtt = new RenderTargetTexture("RTT", 1024, scene);
    rtt.activeCamera = textureCamera;
    scene.customRenderTargets.push(rtt);
    rtt.renderList?.push(waterPlane);

    // --- LOAD flowdiverter
    loading.setText("Loading flow diverter…");

    const flowDiverterFile = "flow_diverter.glb";

    await new Promise<void>((resolve) => {
      SceneLoader.ImportMesh(
        "",
        protoRootUrl,
        flowDiverterFile,
        scene,
        (meshes) => {
          const root = meshes[0] as AbstractMesh | undefined;
          if (!root) {
            resolve();
            return;
          }

          // Root name as requested
          root.name = "flowdiverter";

          // Layer mask
          for (const m of meshes) {
            m.layerMask = 1;
          }

          // Material (optional). Poista jos haluat käyttää GLB:n omia materiaaleja.
          const diverterMat = new PBRMaterial("flowDiverterMat", scene);
          diverterMat.albedoColor = new Color3(1, 1, 1);
          diverterMat.metallic = 0.0;
          diverterMat.roughness = 0.8;

          const renderMeshes = root.getChildMeshes(true) as AbstractMesh[];
          for (const m of renderMeshes) {
            if (m.getTotalVertices && m.getTotalVertices() > 0) {
              m.material = diverterMat;
            }
            m.layerMask = 1;
          }

          if (movingRoot) {
            // copy position + scaling only
            root.position.copyFrom(movingRoot.position);
            root.scaling.copyFrom(movingRoot.scaling);

            // pieni offset: nosta hieman ja siirrä vähän eteen (säädä halutessa)
            root.position.y -= 0.3;
            root.position.z += 3.3;
          } else {
            root.position.copyFrom(slab.position);
            root.position.y += slabHeight / 2 + 0.15;
            root.scaling.setAll(0.01);
          }

          // Jos flowdiverter on mallinnettu samaan mittaan kuin proto, tämä on ok.
          // Jos mittakaava on eri, säädä tätä:
          root.scaling.setAll(0.01);

          // Colliderit (staattinen)
          for (const cm of renderMeshes) {
            if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
            new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
            cm.isPickable = false;
          }

          resolve();
        },
      );
    });

    const DEVICE_FLOW_DIR = new Vector3(0, 0, -1);

    const waterParticles = ParticleHelper.createWaterFlowParticles({
      scene,
      emitter: waterPlane,
      flowDir: DEVICE_FLOW_DIR,
      area: { x: 7.5, z: 7.5 },
      emitY: { min: 0.7, max: 1.6 },
      dustEmitRate: 520,
      dustCapacity: 12000,
      debrisChancePerSecond: 0.15,
      debrisBurstMin: 1,
      debrisBurstMax: 6,
      debrisCapacity: 1800,
    });

    scene.onDisposeObservable.add(() => {
      waterParticles.dispose();
    });

    const spot = new SpotLight(
      "spotLight",
      new Vector3(0, 30, 0),
      Vector3.Down(),
      Tools.ToRadians(90),
      8,
      scene,
    );
    spot.intensity = 1;
    spot.projectionTexture = rtt;

    // --- Blur pipeline
    const blurAmount = 70;
    const standardPipeline = new PostProcessRenderPipeline(
      engine,
      "standardPipeline",
    );

    const horizontalBlur = new BlurPostProcess(
      "horizontalBlur",
      new Vector2(1, 0),
      blurAmount,
      1,
      null,
      undefined,
      engine,
      false,
    );
    const verticalBlur = new BlurPostProcess(
      "verticalBlur",
      new Vector2(0, 1),
      blurAmount,
      1,
      null,
      undefined,
      engine,
      false,
    );

    const blurEffect = new PostProcessRenderEffect(
      engine,
      "blackAndWhiteThenBlur",
      () => [horizontalBlur, verticalBlur],
    );

    standardPipeline.addEffect(blurEffect);
    scene.postProcessRenderPipelineManager.addPipeline(standardPipeline);
    scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
      "standardPipeline",
      textureCamera,
    );

    loading.setText("Loading environment…");

    await new Promise<void>((resolve) => {
      SceneLoader.ImportMesh(
        "",
        "/",
        "underwaterground.glb",
        scene,
        async (newMeshes) => {
          for (const m of newMeshes) m.layerMask = 1;

          const groundMat = await NodeMaterial.ParseFromSnippetAsync(
            "PMHWJS",
            scene,
          );
          groundMat.name = "groundMaterial";

          const ground = scene.getMeshByName("ground") as AbstractMesh | null;
          if (ground) ground.material = groundMat;

          const root = newMeshes[0] as AbstractMesh | undefined;
          const colliders: AbstractMesh[] = root
            ? (root.getChildMeshes(false) as AbstractMesh[])
            : (newMeshes.filter(
                (x): x is AbstractMesh => x instanceof Mesh,
              ) as AbstractMesh[]);

          for (const cm of colliders) {
            if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
            new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
            cm.isPickable = false;
          }

          resolve();
        },
      );
    });

    // --- Player/Character state
    let state: CharState = "IN_AIR";
    const inAirSpeed = 8.0;
    const onGroundSpeed = 10.0;
    const jumpHeight = 1.5;

    const forwardLocalSpace = new Vector3(0, 0, 1);
    const characterOrientation = Quaternion.Identity();
    const characterGravity = new Vector3(0, -18, 0);

    const controls = new CharacterControls();
    controls.attach(scene, canvas);
    scene.onDisposeObservable.add(() => {
      controls.detach(scene);
    });

    const turnSpeed = 2.2;

    const h = 1.8;
    const r = 0.4;

    const displayCapsule = MeshBuilder.CreateCapsule(
      "CharacterDisplay",
      { height: h, radius: r },
      scene,
    );
    displayCapsule.layerMask = 1;
    displayCapsule.isVisible = false;

    const characterPosition = new Vector3(-2, 3.0, 5.0);
    const characterController = new PhysicsCharacterController(
      characterPosition,
      { capsuleHeight: h, capsuleRadius: r },
      scene,
    );

    camera.setTarget(characterPosition);

    const pointer = new PointerController(scene, characterController, controls);
    scene.onDisposeObservable.add(() => pointer.dispose());

    const getNextState = (
      supportInfo: ReturnType<PhysicsCharacterController["checkSupport"]>,
    ): CharState => {
      if (state === "IN_AIR") {
        if (supportInfo.supportedState === CharacterSupportedState.SUPPORTED) {
          return "ON_GROUND";
        }
        return "IN_AIR";
      }

      if (state === "ON_GROUND") {
        if (supportInfo.supportedState !== CharacterSupportedState.SUPPORTED) {
          return "IN_AIR";
        }
        if (controls.wantJump) return "START_JUMP";
        return "ON_GROUND";
      }

      return "IN_AIR";
    };

    const getDesiredVelocity = (
      deltaTime: number,
      supportInfo: ReturnType<PhysicsCharacterController["checkSupport"]>,
      orientation: Quaternion,
      currentVelocity: Vector3,
    ): Vector3 => {
      const nextState = getNextState(supportInfo);
      if (nextState !== state) state = nextState;

      const upWorld = characterGravity.normalizeToNew().scaleInPlace(-1.0);
      const forwardWorld =
        forwardLocalSpace.applyRotationQuaternion(orientation);

      if (state === "IN_AIR") {
        const desiredVelocity = controls.inputDirection
          .scale(inAirSpeed)
          .applyRotationQuaternion(orientation);

        const outputVelocity = characterController.calculateMovement(
          deltaTime,
          forwardWorld,
          upWorld,
          currentVelocity,
          Vector3.ZeroReadOnly,
          desiredVelocity,
          upWorld,
        );

        outputVelocity.addInPlace(upWorld.scale(-outputVelocity.dot(upWorld)));
        outputVelocity.addInPlace(upWorld.scale(currentVelocity.dot(upWorld)));
        outputVelocity.addInPlace(characterGravity.scale(deltaTime));
        return outputVelocity;
      }

      if (state === "ON_GROUND") {
        const desiredVelocity = controls.inputDirection
          .scale(onGroundSpeed)
          .applyRotationQuaternion(orientation);

        const outputVelocity = characterController.calculateMovement(
          deltaTime,
          forwardWorld,
          supportInfo.averageSurfaceNormal,
          currentVelocity,
          supportInfo.averageSurfaceVelocity,
          desiredVelocity,
          upWorld,
        );

        outputVelocity.subtractInPlace(supportInfo.averageSurfaceVelocity);

        const inv1k = 1e-3;
        if (outputVelocity.dot(upWorld) > inv1k) {
          const velLen = outputVelocity.length();
          outputVelocity.normalizeFromLength(velLen);

          const horizLen =
            velLen / supportInfo.averageSurfaceNormal.dot(upWorld);

          const c = supportInfo.averageSurfaceNormal.cross(outputVelocity);
          const reprojected = c.cross(upWorld);
          reprojected.scaleInPlace(horizLen);

          outputVelocity.copyFrom(reprojected);
        }

        outputVelocity.addInPlace(supportInfo.averageSurfaceVelocity);
        return outputVelocity;
      }

      const u = Math.sqrt(2 * characterGravity.length() * jumpHeight);
      const curRelVel = currentVelocity.dot(upWorld);
      return currentVelocity.add(upWorld.scale(u - curRelVel));
    };

    const headLocalOffset = new Vector3(0, h * 0.45, 0);
    const lookAhead = 1.0;
    const lookDownFactor = 0.2;

    scene.onBeforeRenderObservable.add(() => {
      const charPos = characterController.getPosition();
      const headPos = charPos.add(headLocalOffset);
      const forwardWorld =
        forwardLocalSpace.applyRotationQuaternion(characterOrientation);

      camera.position.copyFrom(headPos);

      const target = headPos.add(forwardWorld.scale(lookAhead));
      target.y -= lookAhead * lookDownFactor;

      camera.setTarget(target);
    });

    scene.onAfterPhysicsObservable.add(() => {
      const peNow = scene.getPhysicsEngine();
      const dt =
        peNow && peNow.getSubTimeStep() > 0
          ? peNow.getSubTimeStep() / 1000.0
          : (scene.deltaTime ?? 0) / 1000.0;

      if (dt <= 0) return;

      const down = new Vector3(0, -1, 0);
      const support = characterController.checkSupport(dt, down);

      controls.stepTurn(dt, turnSpeed);

      Quaternion.FromEulerAnglesToRef(0, controls.yaw, 0, characterOrientation);
      camera.rotation.y = controls.yaw;

      const desiredLinearVelocity = getDesiredVelocity(
        dt,
        support,
        characterOrientation,
        characterController.getVelocity(),
      );

      characterController.setVelocity(desiredLinearVelocity);
      characterController.integrate(dt, support, characterGravity);
    });

    loading.hide();
    createButtonsUI();

    canvas.focus();
    controls.yaw += Math.PI + Tools.ToRadians(-25);
  })().catch((err: unknown) => {
    console.error("Init failed:", err);
    loading.setText("Failed to load.");
    // optional: keep overlay or hide it; your call
    // loading.hide();
  });

  return scene;
}
