import {
  Axis,
  KeyboardEventTypes,
  Scene,
  Vector3,
  type IKeyboardEvent,
  type KeyboardInfo,
} from "@babylonjs/core";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { RigidPlayer } from "./PointerController";

export class KeyboardController {
  private readonly scene: Scene;
  private readonly angularDamping = 500;
  private readonly forceMagnitude = 4;
  private readonly rotationSpeed = 2;
  private readonly jumpForce = 2000;
  private keyboardState: Record<string, boolean> = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowUp: false,
    ArrowDown: false,
    KeyA: false,
    KeyD: false,
    KeyW: false,
    KeyS: false,
    Space: false,
    ShiftLeft: false,
    ShiftRight: false,
  };
  private player: RigidPlayer;
  private keyboardObserver: Observer<KeyboardInfo> | null = null;
  private renderObserver: Observer<Scene> | null = null;

  constructor(player: RigidPlayer, scene: Scene) {
    this.scene = scene;
    this.player = player;
    this.registerKeyboardEvents(scene);
    this.initializeUpdateLoop();
  }

  private registerKeyboardEvents(scene: Scene): void {
    this.keyboardObserver = scene.onKeyboardObservable.add(({ event, type }) => {
      switch (type) {
        case KeyboardEventTypes.KEYDOWN:
          this.onKeyDown(event);
          break;
        case KeyboardEventTypes.KEYUP:
          this.onKeyUp(event);
          break;
      }
    });
  }

  private onKeyDown(event: IKeyboardEvent): void {
    this.keyboardState[event.code] = true;
  }

  private onKeyUp(event: IKeyboardEvent): void {
    this.keyboardState[event.code] = false;
    if (event.code in this.keyboardState) {
      this.keyboardStop();
    }
  }

  private keyboardJump(): void {
    this.keyboardState.Space = false;
    const impulse = new Vector3(0, this.jumpForce, 0);
    const position = this.player.mesh.getAbsolutePosition();
    this.player.aggregate.body.applyImpulse(impulse, position);
  }

  private keyboardStop(): void {
    this.player.aggregate.body.setLinearVelocity(Vector3.Zero());
  }

  private keyboardRotate(direction: number): void {
    const rotationDirection = direction > 0 ? 1 : -1;
    const angularVelocity = new Vector3(
      0,
      this.rotationSpeed * rotationDirection,
      0,
    );
    this.player.aggregate.body.setAngularDamping(this.angularDamping);
    this.player.aggregate.body.setAngularVelocity(angularVelocity);
  }

  private keyboardMove(direction: number, axis: Vector3): void {
    const currentVelocity = this.player.aggregate.body.getLinearVelocity();
    const frontVector = this.player.aggregate.transformNode.getDirection(axis);
    const magnitude =
      direction === -1 ? this.forceMagnitude : -this.forceMagnitude;
    const customForce = frontVector.scale(magnitude);
    customForce.y = currentVelocity.y;
    this.player.aggregate.body.setLinearVelocity(customForce);
  }

  public handleKeyboardState(): void {
    const shiftDown = this.keyboardState.ShiftLeft || this.keyboardState.ShiftRight;

    if (this.keyboardState.ArrowUp || this.keyboardState.KeyW)
      this.keyboardMove(-1, Axis.Z);
    if (this.keyboardState.ArrowDown || this.keyboardState.KeyS)
      this.keyboardMove(1, Axis.Z);
    if (shiftDown) {
      if (this.keyboardState.KeyA || this.keyboardState.ArrowLeft)
        this.keyboardMove(1, Axis.X);
      if (this.keyboardState.KeyD || this.keyboardState.ArrowRight)
        this.keyboardMove(-1, Axis.X);
    } else {
      if (this.keyboardState.KeyA || this.keyboardState.ArrowLeft)
        this.keyboardRotate(-1);
      if (this.keyboardState.KeyD || this.keyboardState.ArrowRight)
        this.keyboardRotate(1);
    }
    if (this.keyboardState.Space) this.keyboardJump();
  }

  private initializeUpdateLoop(): void {
    this.renderObserver = this.scene.onBeforeRenderObservable.add(() => {
      this.handleKeyboardState();
    });
  }

  public dispose(): void {
    if (this.keyboardObserver) {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }
    if (this.renderObserver) {
      this.scene.onBeforeRenderObservable.remove(this.renderObserver);
      this.renderObserver = null;
    }
  }
}
