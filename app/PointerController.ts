import {
  PointerEventTypes,
  Scene,
  Vector3,
  type Nullable,
  type PickingInfo,
} from "@babylonjs/core";
import type { PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { PhysicsCharacterController } from "@babylonjs/core/Physics/v2/characterController";
import type { CharacterControls } from "./CharacterControls";

type Vec2 = { x: number; y: number };

export class PointerController {
  private readonly scene: Scene;
  private readonly character: PhysicsCharacterController;
  private readonly controls: CharacterControls;
  private readonly canvas: Nullable<HTMLCanvasElement>;

  private readonly dragThresholdPxMouse = 3;
  private readonly dragThresholdPxTouch = 10;
  private readonly rotationSpeed = 0.015; // rad/pixel (drag -> angular velocity)
  private readonly pitchSpeed = 0.0025; // rad/pixel
  private readonly maxPitch = 0.8; // radians
  private readonly stopDistance = 0.35; // meters
  private readonly clickToMoveStrength = 0.5; // 0..1
  private readonly slowRadius = 1.2; // meters
  private readonly turnSpeed = 4.0; // rad/sec
  private readonly stuckEpsilon = 0.05; // meters
  private readonly stuckTimeoutMs = 600;
  private readonly yawDamping = 10.0; // 1/sec

  private isPointerDown = false;
  private isDragging = false;
  private pointerDownPos: Vec2 = { x: 0, y: 0 };
  private prevPos: Vec2 = { x: 0, y: 0 };
  private maxDragDistance = 0;

  private targetPoint: Vector3 | null = null;
  private activePointerId: number | null = null;
  private activePointerType: "mouse" | "touch" | "pen" | null = null;
  private lastDistance: number | null = null;
  private lastDistanceTimeMs = 0;
  private yawVelocity = 0;

  private pointerObserver: Observer<PointerInfo> | null = null;

  constructor(
    scene: Scene,
    character: PhysicsCharacterController,
    controls: CharacterControls,
  ) {
    this.scene = scene;
    this.character = character;
    this.controls = controls;
    this.canvas = scene.getEngine().getRenderingCanvas();

    this.registerPointerEvents();
    this.installUpdateLoop();
  }

  dispose(): void {
    if (this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
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

  private onPointerDown(event: PointerEvent): void {
    if (this.activePointerId !== null) return;

    this.isPointerDown = true;
    this.isDragging = false;

    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    this.prevPos = { x: event.clientX, y: event.clientY };
    this.maxDragDistance = 0;
    this.activePointerId = event.pointerId;
    this.activePointerType =
      (event.pointerType as "mouse" | "touch" | "pen") ?? "mouse";

    if (this.canvas && this.canvas.setPointerCapture) {
      this.canvas.setPointerCapture(event.pointerId);
    }

    if (event.pointerType === "touch") {
      event.preventDefault();
    }

    this.getCursorHost().classList.add("pointer");
    this.focusCanvas();
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.isPointerDown) {
      if (event.pointerType === "mouse") {
        const pick = this.scene.pick(event.clientX, event.clientY);
        this.pointerHoverCursorHandling(pick);
      }
      return;
    }
    if (this.activePointerId !== event.pointerId) return;

    const dx = event.clientX - this.prevPos.x;
    const dy = event.clientY - this.prevPos.y;

    const totalDx = event.clientX - this.pointerDownPos.x;
    const totalDy = event.clientY - this.pointerDownPos.y;
    const dist = Math.hypot(totalDx, totalDy);
    if (dist > this.maxDragDistance) this.maxDragDistance = dist;

    const threshold =
      this.activePointerType === "touch"
        ? this.dragThresholdPxTouch
        : this.dragThresholdPxMouse;
    if (dist > threshold) this.isDragging = true;

    // Drag = yaw rotate
    if (this.isDragging) {
      this.yawVelocity = -dx * this.rotationSpeed;
      const body = this.getCharacterBody();
      if (body) {
        body.setAngularDamping(this.yawDamping);
        body.setAngularVelocity(new Vector3(0, this.yawVelocity, 0));
      }
      this.controls.pitch = this.clampPitch(
        this.controls.pitch - dy * this.pitchSpeed,
      );
      this.targetPoint = null;
      this.pointerDownCursorHandling(event);
    }

    this.prevPos = { x: event.clientX, y: event.clientY };

    if (event.pointerType === "touch") {
      event.preventDefault();
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;

    const upPos = { x: event.clientX, y: event.clientY };
    const dist = Math.hypot(
      upPos.x - this.pointerDownPos.x,
      upPos.y - this.pointerDownPos.y,
    );

    this.isPointerDown = false;

    // Click = click-to-move
    const threshold =
      this.activePointerType === "touch"
        ? this.dragThresholdPxTouch
        : this.dragThresholdPxMouse;
    if (!this.isDragging && this.maxDragDistance <= threshold) {
      const pick = this.scene.pick(event.clientX, event.clientY);
      this.handleClick(pick);
    }

    this.isDragging = false;
    this.getCursorHost().classList.remove("pointer", "grabbing");
    if (this.canvas && this.canvas.releasePointerCapture) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.activePointerId = null;
    this.activePointerType = null;

    if (event.pointerType === "touch") {
      event.preventDefault();
    }
    this.focusCanvas();
  }

  private handleClick(pick: PickingInfo): void {
    if (!pick.hit || !pick.pickedPoint) return;

    // halutessa voit filtteröidä UI-meshit tms
    const n = pick.pickedMesh?.name ?? "";
    if (n.includes("Side Panel")) return;

    this.targetPoint = pick.pickedPoint.clone();
    this.lastDistance = null;
    this.lastDistanceTimeMs = performance.now();
  }

  private installUpdateLoop(): void {
    this.scene.onBeforeRenderObservable.add(() => {
      const dt = (this.scene.deltaTime ?? 0) / 1000;
      this.updateYawInertia(dt);
      this.stepClickToMove();
    });
  }

  private updateYawInertia(dt: number): void {
    if (dt <= 0) return;
    if (this.targetPoint) return; // click-to-move controls yaw

    this.controls.yaw += this.yawVelocity * dt;

    const decay = Math.max(0, 1 - this.yawDamping * dt);
    this.yawVelocity *= decay;
    if (Math.abs(this.yawVelocity) < 0.0001) this.yawVelocity = 0;
  }

  private stepClickToMove(): void {
    if (!this.targetPoint) return;

    const pos = this.character.getPosition();

    const to = this.targetPoint.subtract(pos);
    to.y = 0;

    const dist = to.length();
    if (dist < this.stopDistance) {
      this.targetPoint = null;
      this.lastDistance = null;
      this.controls.inputDirection.set(0, 0, 0);
      return;
    }

    to.normalize();

    // Smoothly rotate toward target
    const desiredYaw = Math.atan2(to.x, to.z);
    const dt = (this.scene.deltaTime ?? 0) / 1000;
    if (dt > 0) {
      this.yawVelocity = 0;
      const body = this.getCharacterBody();
      if (body) body.setAngularVelocity(Vector3.Zero());
      const cur = this.controls.yaw;
      const next = this.lerpAngle(cur, desiredYaw, this.turnSpeed * dt);
      this.controls.yaw = next;
    }

    // Stop trying if we're not getting closer (likely collision/obstacle)
    const now = performance.now();
    if (this.lastDistance === null) {
      this.lastDistance = dist;
      this.lastDistanceTimeMs = now;
    } else if (dist < this.lastDistance - this.stuckEpsilon) {
      this.lastDistance = dist;
      this.lastDistanceTimeMs = now;
    } else if (now - this.lastDistanceTimeMs > this.stuckTimeoutMs) {
      this.targetPoint = null;
      this.lastDistance = null;
      this.controls.inputDirection.set(0, 0, 0);
      return;
    }

    // World dir -> local dir (inverse yaw)
    const yaw = this.controls.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);

    const localX = to.x * cos - to.z * sin;
    const localZ = to.x * sin + to.z * cos;

    this.controls.inputDirection.set(localX, 0, localZ);

    const len = this.controls.inputDirection.length();
    if (len > 0) {
      const slowFactor = Math.min(1, dist / this.slowRadius);
      const strength = this.clickToMoveStrength * slowFactor;
      this.controls.inputDirection.scaleInPlace(strength / len);
    }
  }

  private focusCanvas(): void {
    window.setTimeout(() => this.canvas?.focus(), 0);
  }

  private getCharacterBody(): {
    setAngularVelocity: (v: Vector3) => void;
    setAngularDamping: (v: number) => void;
  } | null {
    type AngularBody = {
      setAngularVelocity?: (v: Vector3) => void;
      setAngularDamping?: (v: number) => void;
      body?: {
        setAngularVelocity?: (v: Vector3) => void;
        setAngularDamping?: (v: number) => void;
      };
    };

    const hasAngular = (
      v: AngularBody | undefined,
    ): v is {
      setAngularVelocity: (v: Vector3) => void;
      setAngularDamping: (v: number) => void;
    } => {
      return (
        typeof v?.setAngularVelocity === "function" &&
        typeof v?.setAngularDamping === "function"
      );
    };

    const candidate = this.character as unknown as {
      _body?: AngularBody;
    };

    const body = candidate._body;
    if (hasAngular(body)) return body;
    if (hasAngular(body?.body)) return body.body;
    return null;
  }

  private getCursorHost(): HTMLElement {
    return document.body;
  }

  private pointerHoverCursorHandling(pick: PickingInfo | null): void {
    this.getCursorHost().classList.remove("crosshair", "pointer");
    if (!pick?.hit || !pick.pickedMesh) return;

    const name = pick.pickedMesh.name;
    if (name.startsWith("sphere")) {
      this.getCursorHost().classList.add("crosshair");
    } else if (name.startsWith("npc")) {
      this.getCursorHost().classList.add("pointer");
    }
  }

  private pointerDownCursorHandling(event: PointerEvent): void {
    const moveX = event.clientX - this.pointerDownPos.x;
    const moveY = event.clientY - this.pointerDownPos.y;
    const distance = Math.hypot(moveX, moveY);

    const threshold =
      this.activePointerType === "touch"
        ? this.dragThresholdPxTouch
        : this.dragThresholdPxMouse;
    if (distance > threshold) {
      this.isDragging = true;
      this.getCursorHost().classList.add("grabbing");
      this.getCursorHost().classList.remove("pointer");
    } else {
      this.getCursorHost().classList.remove("grabbing");
      this.getCursorHost().classList.add("pointer");
    }
  }

  private clampPitch(v: number): number {
    if (v > this.maxPitch) return this.maxPitch;
    if (v < -this.maxPitch) return -this.maxPitch;
    return v;
  }

  private lerpAngle(current: number, target: number, t: number): number {
    const a = this.wrapAngle(target - current);
    const clamped = Math.min(Math.max(t, 0), 1);
    return current + a * clamped;
  }

  private wrapAngle(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }
}
