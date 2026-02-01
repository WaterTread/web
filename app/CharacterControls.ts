import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Scene } from "@babylonjs/core/scene";

import {
  KeyboardEventTypes,
  type KeyboardInfo,
} from "@babylonjs/core/Events/keyboardEvents";
import {
  PointerEventTypes,
  type PointerInfo,
} from "@babylonjs/core/Events/pointerEvents";

/**
 * Kapseloi inputit:
 * - W/S tai ↑/↓: inputDirection.z
 * - A/D tai ←/→: turnInput (-1..1)
 * - Space: wantJump
 * - Hiiri drag: yaw
 * - Estää selaimen scrollin kun canvas fokuksessa
 */
export class CharacterControls {
  public readonly inputDirection = new Vector3(0, 0, 0); // käytetään vain z:tä (eteen/taakse)
  public wantJump = false;

  public yaw = 0;
  public turnInput = 0; // -1 vasen, +1 oikea

  private isMouseDown = false;

  private pointerObserver: Observer<PointerInfo> | null = null;
  private keyboardObserver: Observer<KeyboardInfo> | null = null;

  private windowKeydownHandler: ((e: KeyboardEvent) => void) | null = null;

  public attach(scene: Scene, canvas: HTMLCanvasElement): void {
    // Pointer: drag → yaw
    this.pointerObserver = scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case PointerEventTypes.POINTERDOWN:
          this.isMouseDown = true;
          canvas.focus();
          break;

        case PointerEventTypes.POINTERUP:
          this.isMouseDown = false;
          break;

        case PointerEventTypes.POINTERMOVE:
          if (this.isMouseDown) {
            // first-person: pyöritä yaw:ta (ei siirretä kameraa)
            this.yaw += pointerInfo.event.movementX * -0.02;
          }
          break;
      }
    });

    // Keyboard: WASD/nuolet + space
    this.keyboardObserver = scene.onKeyboardObservable.add((kbInfo) => {
      switch (kbInfo.type) {
        case KeyboardEventTypes.KEYDOWN: {
          const k = kbInfo.event.key;
          if (k === "w" || k === "ArrowUp") this.inputDirection.z = 1;
          else if (k === "s" || k === "ArrowDown") this.inputDirection.z = -1;
          else if (k === "a" || k === "ArrowLeft") this.turnInput = -1;
          else if (k === "d" || k === "ArrowRight") this.turnInput = 1;
          else if (k === " ") this.wantJump = true;
          break;
        }

        case KeyboardEventTypes.KEYUP: {
          const k = kbInfo.event.key;

          if (k === "w" || k === "s" || k === "ArrowUp" || k === "ArrowDown") {
            this.inputDirection.z = 0;
          }

          if (
            k === "a" ||
            k === "d" ||
            k === "ArrowLeft" ||
            k === "ArrowRight"
          ) {
            this.turnInput = 0;
          } else if (k === " ") {
            this.wantJump = false;
          }
          break;
        }
      }
    });

    // Estä arrow/space scrollaus kun canvas fokuksessa
    this.windowKeydownHandler = (e: KeyboardEvent) => {
      if (document.activeElement !== canvas) return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)
      ) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", this.windowKeydownHandler, {
      passive: false,
    });
  }

  public detach(scene: Scene): void {
    if (this.pointerObserver) {
      scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
    if (this.keyboardObserver) {
      scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }
    if (this.windowKeydownHandler) {
      window.removeEventListener("keydown", this.windowKeydownHandler);
      this.windowKeydownHandler = null;
    }
  }

  /** Näppäinkääntö dt:n mukaan (A/D ja ←/→) */
  public stepTurn(dt: number, turnSpeedRadPerSec: number): void {
    this.yaw += this.turnInput * turnSpeedRadPerSec * dt;
  }
}
