import {
  AbstractMesh,
  PointerEventTypes,
  Quaternion,
  Scene,
  Vector3,
  type Nullable,
  type PickingInfo,
} from "@babylonjs/core";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import {
  KeyboardEventTypes,
  type KeyboardInfo,
} from "@babylonjs/core/Events/keyboardEvents";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";

export type RigidPlayer = {
  mesh: AbstractMesh;
  aggregate: PhysicsAggregate;
};

type Vec2 = { x: number; y: number };

export class PointerController {
  private readonly scene: Scene;
  private readonly player: RigidPlayer;
  private readonly canvas: Nullable<HTMLCanvasElement>;

  private readonly dragThreshold = 1;
  private readonly dragRotationSpeed = 0.2;
  private readonly moveRotationSpeed = 1;
  private readonly angularDamping = 500;
  private readonly rotationThreshold = 0.01;
  private readonly stuckThreshold = 0.25;
  private readonly multiplierFactor = 5;
  private readonly pinchDeadzonePx = 2;
  private readonly pinchSpeed = 4;

  private isDragging = false;
  private isPointerDown = false;
  private prevPointerDownPosition: { x: number; y: number } = { x: 0, y: 0 };
  private pointerDownPosition: { x: number; y: number } = { x: 0, y: 0 };
  private targetPosition: Vector3 | null = null;
  private movementStartTime = 0;
  private lastPlayerPosition: Vector3 | null = null;
  private activeTouches = new Map<number, Vec2>();
  private pinchLastDistance: number | null = null;

  private pointerObserver: Observer<PointerInfo> | null = null;
  private keyboardObserver: Observer<KeyboardInfo> | null = null;
  private wheelHandler: ((e: WheelEvent) => void) | null = null;

  constructor(scene: Scene, player: RigidPlayer) {
    this.scene = scene;
    this.player = player;
    this.canvas = scene.getEngine().getRenderingCanvas();
    this.registerPointerEvents();
    this.registerKeyboardEvents();
    this.registerWheelEvents();
    this.initializeUpdateLoop();
  }

  dispose(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.keyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }
    if (this.wheelHandler && this.canvas) {
      this.canvas.removeEventListener("wheel", this.wheelHandler);
      this.wheelHandler = null;
    }
  }

  public isClickMoving(): boolean {
    return this.targetPosition !== null;
  }

  public isDraggingPointer(): boolean {
    return this.isDragging;
  }

  private registerPointerEvents(): void {
    this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          this.onPointerDown(pointerInfo.event as PointerEvent);
          break;
        case PointerEventTypes.POINTERMOVE:
          this.onPointerMove(pointerInfo.event as PointerEvent);
          break;
        case PointerEventTypes.POINTERUP:
          this.onPointerUp(pointerInfo.event as PointerEvent);
          break;
      }
    });
  }

  private registerKeyboardEvents(): void {
    this.keyboardObserver = this.scene.onKeyboardObservable.add((kbInfo) => {
      if (kbInfo.type !== KeyboardEventTypes.KEYDOWN) return;
      if (!this.targetPosition) return;

      const k = kbInfo.event.key;
      const isMovementKey =
        k === "w" ||
        k === "a" ||
        k === "s" ||
        k === "d" ||
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === " " ||
        k === "Shift";

      if (isMovementKey) this.cancelClickMove();
    });
  }

  private registerWheelEvents(): void {
    if (!this.canvas) return;
    this.wheelHandler = (event: WheelEvent) => {
      if (!event.ctrlKey) return;

      const dirSign = event.deltaY < 0 ? 1 : -1;
      const forward = this.player.mesh.getDirection(Axis.Z);
      const desired = forward.scale(this.pinchSpeed * dirSign);
      const currentY = this.player.aggregate.body.getLinearVelocity().y;
      this.player.aggregate.body.setLinearVelocity(
        new Vector3(desired.x, currentY, desired.z),
      );
      this.cancelClickMove();
      event.preventDefault();
    };

    this.canvas.addEventListener("wheel", this.wheelHandler, { passive: false });
  }

  private onPointerDown(event: PointerEvent): void {
    this.isPointerDown = true;
    this.isDragging = false;

    this.prevPointerDownPosition = { x: event.clientX, y: event.clientY };
    this.pointerDownPosition = { x: event.clientX, y: event.clientY };

    this.setCursor("cursor-pointer");

    if (event.pointerType === "touch") {
      this.activeTouches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (this.activeTouches.size >= 2) {
        this.pinchLastDistance = this.getPinchDistance();
      }
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (event.pointerType === "touch" && this.activeTouches.has(event.pointerId)) {
      this.activeTouches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (this.activeTouches.size >= 2) {
        this.handlePinch();
        event.preventDefault();
        return;
      }
    }

    if (this.isPointerDown) {
      const deltaX = event.clientX - this.prevPointerDownPosition.x;
      const angularVelocityY = -deltaX * this.dragRotationSpeed;
      const angularVelocity = new Vector3(0, angularVelocityY, 0);
      this.player.aggregate.body.setAngularVelocity(angularVelocity);

      this.pointerDownCursorHandling(event);

      this.prevPointerDownPosition = { x: event.clientX, y: event.clientY };
    } else {
      const pickResult = this.scene.pick(event.clientX, event.clientY);
      this.pointerHoverCursorHandling(pickResult);
    }
  }

  private onPointerUp(event: PointerEvent): void {
    this.isPointerDown = false;
    this.isDragging = false;
    this.setCursor();

    if (event.pointerType === "touch" && this.activeTouches.has(event.pointerId)) {
      this.activeTouches.delete(event.pointerId);
      if (this.activeTouches.size < 2) {
        this.pinchLastDistance = null;
        const currentVel = this.player.aggregate.body.getLinearVelocity();
        this.player.aggregate.body.setLinearVelocity(
          new Vector3(0, currentVel.y, 0),
        );
      }
    }

    const dragDistance = Math.hypot(
      event.clientX - this.pointerDownPosition.x,
      event.clientY - this.pointerDownPosition.y,
    );

    if (dragDistance < this.dragThreshold) {
      const pickResult = this.scene.pick(event.clientX, event.clientY);
      this.pointerSelectActionHandling(pickResult);
    }

    this.stopPlayerMovement();
  }

  private initializeUpdateLoop(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      this.movePlayerToPointerTarget();
    });
  }

  private stopPlayerMovement(): void {
    this.player.aggregate.body.setLinearVelocity(Vector3.Zero());
    this.player.aggregate.body.setAngularVelocity(Vector3.Zero());
  }

  private movePlayerToPointerTarget(): void {
    const now = performance.now();
    if (!this.movementStartTime) {
      this.movementStartTime = now;
    }

    const directionToTarget = this.calculateDirectionToTarget(now);
    if (!directionToTarget) return;

    this.applyMovement(directionToTarget);
  }

  private calculateDirectionToTarget(now: number): Vector3 | null {
    if (!this.targetPosition) return null;

    const direction = this.targetPosition.subtract(this.player.mesh.position);
    direction.y = 0;

    const distance = direction.length();

    if (this.isStuckOrReachedTarget(distance, now)) {
      this.resetMovement();
      return null;
    }

    direction.normalize();
    return direction;
  }

  private isStuckOrReachedTarget(distance: number, now: number): boolean {
    if (distance < 0.25) {
      return true;
    }

    const elapsedTime = (now - this.movementStartTime) / 1000;
    if (elapsedTime <= 1) {
      return false;
    }

    const hasMovedSignificantly = this.hasPlayerMovedSignificantly();
    if (hasMovedSignificantly) {
      this.movementStartTime = now;
      this.lastPlayerPosition = this.player.mesh.position.clone();
      return false;
    }

    return true;
  }

  private hasPlayerMovedSignificantly(): boolean {
    if (!this.lastPlayerPosition) return true;
    return (
      this.lastPlayerPosition.subtract(this.player.mesh.position).length() >
      this.stuckThreshold
    );
  }

  private resetMovement(): void {
    this.targetPosition = null;
    this.movementStartTime = 0;
    this.lastPlayerPosition = null;
    this.stopPlayerMovement();
  }

  private cancelClickMove(): void {
    if (!this.targetPosition) return;
    this.targetPosition = null;
    this.movementStartTime = 0;
    this.lastPlayerPosition = null;
    this.stopPlayerMovement();
  }

  private applyMovement(direction: Vector3): void {
    const currentVelocity = this.player.aggregate.body.getLinearVelocity().y;
    const newVelocity = direction
      .scale(this.multiplierFactor)
      .add(new Vector3(0, currentVelocity, 0));
    this.player.aggregate.body.setLinearVelocity(newVelocity);

    // Rotate toward movement direction (example-style)
    const yaw = Math.atan2(direction.x, direction.z);
    const currentQ = this.player.mesh.rotationQuaternion;
    if (!currentQ) {
      this.player.mesh.rotationQuaternion = Quaternion.FromEulerAngles(
        0,
        yaw,
        0,
      );
      return;
    }

    const targetQ = Quaternion.FromEulerAngles(0, yaw, 0);
    const rotationDifference = targetQ.multiply(Quaternion.Inverse(currentQ));
    let angle = rotationDifference.toEulerAngles().y;

    if (angle > Math.PI) angle -= 2 * Math.PI;
    if (angle < -Math.PI) angle += 2 * Math.PI;

    if (Math.abs(angle) < this.rotationThreshold) {
      this.player.mesh.rotationQuaternion = targetQ;
      return;
    }

    const angularVelocity = new Vector3(
      0,
      this.moveRotationSpeed * (angle > 0 ? 1 : -1),
      0,
    );
    this.player.aggregate.body.setAngularDamping(this.angularDamping);
    this.player.aggregate.body.setAngularVelocity(angularVelocity);
  }

  private handlePinch(): void {
    const distance = this.getPinchDistance();
    if (this.pinchLastDistance === null) {
      this.pinchLastDistance = distance;
      return;
    }

    const delta = distance - this.pinchLastDistance;
    if (Math.abs(delta) < this.pinchDeadzonePx) return;

    // pinch in => forward, pinch out => backward
    const dirSign = delta < 0 ? 1 : -1;
    const forward = this.player.mesh.getDirection(Axis.Z);
    const desired = forward.scale(this.pinchSpeed * dirSign);
    const currentY = this.player.aggregate.body.getLinearVelocity().y;
    this.player.aggregate.body.setLinearVelocity(
      new Vector3(desired.x, currentY, desired.z),
    );

    this.pinchLastDistance = distance;
    this.cancelClickMove();
  }

  private getPinchDistance(): number {
    const points = Array.from(this.activeTouches.values());
    if (points.length < 2) return 0;
    const a = points[0];
    const b = points[1];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  private pointerHoverCursorHandling(pickResult: PickingInfo): void {
    this.setCursor();

    if (pickResult.hit && pickResult.pickedMesh) {
      if (pickResult.pickedMesh.name.startsWith("sphere")) {
        this.setCursor("cursor-crosshair");
      } else if (pickResult.pickedMesh.name.startsWith("npc")) {
        this.setCursor("cursor-pointer");
      }
    }
  }

  private pointerDownCursorHandling(event: PointerEvent): void {
    const moveX = event.clientX - this.pointerDownPosition.x;
    const moveY = event.clientY - this.pointerDownPosition.y;
    const distance = Math.hypot(moveX, moveY);

    if (distance > this.dragThreshold) {
      this.isDragging = true;
      this.setCursor("cursor-grabbing");
    } else {
      this.isDragging = false;
      this.setCursor("cursor-pointer");
    }
  }

  private pointerSelectActionHandling(pickResult: PickingInfo): void {
    if (pickResult.hit && pickResult.pickedPoint) {
      const targetName = pickResult.pickedMesh?.name;
      if (targetName?.startsWith("npc")) {
        return;
      }
      this.targetPosition = pickResult.pickedPoint;
    }
  }

  private getCursorHost(): HTMLElement {
    return this.canvas ?? document.body;
  }

  private setCursor(className?: string): void {
    const host = this.getCursorHost();
    host.classList.remove(
      "cursor-pointer",
      "cursor-crosshair",
      "cursor-grabbing",
      "cursor-grab",
      "cursor-default",
    );
    if (className) host.classList.add(className);
  }
}
