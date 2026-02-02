import { Color3, HemisphericLight } from "@babylonjs/core";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

export type SceneBasics = {
  camera: FreeCamera;
};

export const setupSceneBasics = (
  scene: Scene,
  canvas: HTMLCanvasElement,
): SceneBasics => {
  canvas.tabIndex = 1;
  canvas.style.outline = "none";

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

  const camera = new FreeCamera("camera1", new Vector3(0, 5, -5), scene);
  camera.layerMask = 1;
  camera.minZ = 0.05;
  camera.maxZ = 500;
  scene.activeCamera = camera;

  const hemi = new HemisphericLight("hemi", new Vector3(0, 3, 0), scene);
  hemi.intensity = 0.4;

  return { camera };
};
