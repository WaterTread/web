import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { PostProcessRenderEffect } from "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderEffect";
import { PostProcessRenderPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipeline";
import { BlurPostProcess } from "@babylonjs/core/PostProcesses/blurPostProcess";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Tools } from "@babylonjs/core/Misc/tools";

export type CausticsSetup = {
  waterPlane: Mesh;
  textureCamera: ArcRotateCamera;
  rtt: RenderTargetTexture;
};

export const setupCaustics = async (
  scene: Scene,
  engine: Engine,
): Promise<CausticsSetup> => {
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

  return { waterPlane, textureCamera, rtt };
};
