import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import {
  PhysicsMotionType,
  PhysicsShapeType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { KeyboardController } from "../KeyboardController";
import { PointerController, type RigidPlayer } from "../PointerController";

export type CharacterSetup = {
  player: RigidPlayer;
};

export const setupCharacter = (
  scene: Scene,
  _canvas: HTMLCanvasElement,
  camera: FreeCamera,
): CharacterSetup => {
  const h = 1.8;
  const r = 0.4;

  const body = MeshBuilder.CreateCapsule(
    "CharacterBody",
    { height: h, radius: r },
    scene,
  );
  body.layerMask = 1;
  body.isVisible = false;
  body.checkCollisions = true;

  body.position = new Vector3(-2, 3.0, 5.0);
  const toOrigin = Vector3.Zero().subtract(body.position);
  toOrigin.y = 0;
  const yawToOrigin =
    toOrigin.lengthSquared() > 0
      ? Math.atan2(toOrigin.x, toOrigin.z)
      : 0;
  const initialRotation = Quaternion.FromEulerAngles(0, yawToOrigin, 0);
  body.rotationQuaternion = initialRotation;

  const aggregate = new PhysicsAggregate(
    body,
    PhysicsShapeType.CAPSULE,
    { mass: 1, restitution: 0.15, friction: 0.5 },
    scene,
  );
  aggregate.body.setTargetTransform(body.position, initialRotation);
  aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
  aggregate.body.setMassProperties({
    inertia: new Vector3(0, 0, 0),
  });
  aggregate.body.setAngularDamping(500);
  aggregate.body.setLinearDamping(0.2);

  // Face inward initially (quaternion-based)

  camera.setTarget(body.position);

  const headPivot = new TransformNode("CharacterHeadPivot", scene);
  headPivot.parent = body;
  const eyeHeight = 1.65;
  headPivot.position = new Vector3(0, eyeHeight - h / 2, 0);
  headPivot.rotation = new Vector3(0, 0, 0);

  const player: RigidPlayer = { mesh: body, aggregate, headPivot };
  const pointer = new PointerController(scene, player);
  const keyboard = new KeyboardController(player, scene);
  scene.onDisposeObservable.add(() => pointer.dispose());
  scene.onDisposeObservable.add(() => keyboard.dispose());

  const lookAhead = 1.0;

  scene.onBeforeRenderObservable.add(() => {
    const headPos = headPivot.getAbsolutePosition();
    const forwardWorld = headPivot.getDirection(Axis.Z);

    camera.position.copyFrom(headPos);

    const target = headPos.add(forwardWorld.normalize().scale(lookAhead));

    camera.setTarget(target);
  });

  return { player };
};
