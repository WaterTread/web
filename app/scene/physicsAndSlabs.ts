import { Color3 } from "@babylonjs/core";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Tools } from "@babylonjs/core/Misc/tools";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";
import HavokPhysics from "@babylonjs/havok";

export type SlabInfo = {
  slab: AbstractMesh;
  slabHeight: number;
  slabLength: number;
};

export const initPhysicsAndSlabs = async (scene: Scene): Promise<SlabInfo> => {
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

  return { slab, slabHeight, slabLength };
};
