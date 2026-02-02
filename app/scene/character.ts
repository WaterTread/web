import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController";
import type { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { CharacterControls } from "../CharacterControls";
import { PointerController } from "../PointerController";

export type CharacterSetup = {
  controls: CharacterControls;
  controller: PhysicsCharacterController;
};

type CharState = "IN_AIR" | "ON_GROUND" | "START_JUMP";

export const setupCharacter = (
  scene: Scene,
  canvas: HTMLCanvasElement,
  camera: FreeCamera,
): CharacterSetup => {
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

        const horizLen = velLen / supportInfo.averageSurfaceNormal.dot(upWorld);

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

  return { controls, controller: characterController };
};
