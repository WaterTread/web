import type { Engine } from "@babylonjs/core/Engines/engine";
import { Tools } from "@babylonjs/core/Misc/tools";
import { Scene } from "@babylonjs/core/scene";

// side-effects
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Physics/v2";
import "@babylonjs/loaders/glTF";

import { LoadingOverlay } from "./loadingOverlay";
import { setupCaustics } from "./scene/caustics";
import { setupCharacter } from "./scene/character";
import {
  loadEnvironment,
  loadFlowDiverter,
  loadMovingParts,
  loadStaticParts,
} from "./scene/loaders";
import { setupWaterParticles } from "./scene/particles";
import { initPhysicsAndSlabs } from "./scene/physicsAndSlabs";
import { setupSceneBasics } from "./scene/sceneBasics";
import { createButtonsUI } from "./scene/sceneUI";

const HIDDEN_MESH_NAMES = ["Link_A", "Link_B", "CamPin", "CamFollower", "Wing"];

export default function createScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
): Scene {
  const scene = new Scene(engine);

  const host = (canvas.parentElement ?? document.body) as HTMLElement;

  // Loading overlay component
  const loading = new LoadingOverlay(host);
  loading.show();
  scene.onDisposeObservable.add(() => loading.dispose());

  const { camera } = setupSceneBasics(scene, canvas);

  // ---------------------------------------------------------------------------
  // Scene init
  // ---------------------------------------------------------------------------
  (async () => {
    loading.setText("Loading physics…");

    const { slab, slabHeight } = await initPhysicsAndSlabs(scene);

    loading.setText("Loading moving parts…");
    const movingRoot = await loadMovingParts({
      scene,
      slab,
      slabHeight,
      hiddenMeshNames: HIDDEN_MESH_NAMES,
    });

    loading.setText("Loading static parts…");
    await loadStaticParts({ scene, slab, movingRoot });

    loading.setText("Loading caustics…");
    const { waterPlane } = await setupCaustics(scene, engine);

    // --- LOAD flowdiverter
    loading.setText("Loading flow diverter…");
    await loadFlowDiverter({ scene, slab, slabHeight, movingRoot });

    const waterParticles = setupWaterParticles(scene, waterPlane);
    scene.onDisposeObservable.add(() => {
      waterParticles.dispose();
    });

    loading.setText("Loading environment…");
    await loadEnvironment(scene);

    const { controls } = setupCharacter(scene, canvas, camera);

    loading.hide();
    createButtonsUI({ scene, host, canvas });

    canvas.focus();
    controls.yaw += Math.PI + Tools.ToRadians(-25);
  })().catch((err: unknown) => {
    console.error("Init failed:", err);
    loading.setText("Failed to load.");
  });

  return scene;
}
