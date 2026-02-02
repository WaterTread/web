import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";

export type WaterFlowParticles = {
  dust: ParticleSystem;
  debris: ParticleSystem;
  dispose: () => void;
};

export type WaterFlowParticlesOptions = {
  scene: Scene;
  emitter: AbstractMesh;

  /**
   * Staattinen suunta, jos et halua sen seuraavan kameraa.
   * Jos annat flowDirProviderin, se voittaa flowDirin.
   */
  flowDir?: Vector3;

  /** Palauttaa world-space suunnan (päivitetään joka frame) */
  flowDirProvider?: () => Vector3;

  /** Emit box half-extents X/Z ja “korkeusalue” Y:lle */
  area: { x: number; z: number };

  /** Korkeus emitterin ympärillä, esim. min 0.8 max 1.8 => korkeammalla */
  emitY?: { min: number; max: number };

  dustEmitRate?: number; // default 600
  dustCapacity?: number; // default 12000

  debrisBurstMin?: number; // default 2
  debrisBurstMax?: number; // default 10
  debrisChancePerSecond?: number; // default 0.28
  debrisCapacity?: number; // default 2000

  dustAlpha?: number; // default 0.20
  debrisAlpha?: number; // default 0.38
};

export class ParticleHelper {
  private static makeDotTexture(scene: Scene, name: string, size: number) {
    const dt = new DynamicTexture(
      name,
      { width: size, height: size },
      scene,
      false,
    );
    const ctx = dt.getContext();

    ctx.clearRect(0, 0, size, size);

    const r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0.0, "rgba(255,255,255,1.0)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1.0, "rgba(255,255,255,0.0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();

    dt.hasAlpha = true;
    dt.update(false);
    return dt;
  }

  static createWaterFlowParticles(
    opts: WaterFlowParticlesOptions,
  ): WaterFlowParticles {
    const { scene, emitter } = opts;

    const emitY = opts.emitY ?? { min: 0.0, max: 3.0 };

    const dustEmitRate = opts.dustEmitRate ?? 600;
    const dustAlpha = opts.dustAlpha ?? 0.2;
    const dustCapacity = opts.dustCapacity ?? 12000;

    const debrisAlpha = opts.debrisAlpha ?? 0.38;
    const debrisBurstMin = opts.debrisBurstMin ?? 2;
    const debrisBurstMax = opts.debrisBurstMax ?? 10;
    const debrisChancePerSecond = opts.debrisChancePerSecond ?? 0.28;
    const debrisCapacity = opts.debrisCapacity ?? 2000;

    const getFlow = (): Vector3 => {
      if (opts.flowDirProvider) return opts.flowDirProvider().normalizeToNew();
      if (opts.flowDir) return opts.flowDir.normalizeToNew();
      return new Vector3(1, 0, 0);
    };

    const applyDirections = (
      ps: ParticleSystem,
      flow: Vector3,
      spread: number,
    ) => {
      // pieni “hajonta” sivuille + vähän pystysuunnassa
      ps.direction1 = flow.add(new Vector3(-spread, -0.04, -spread));
      ps.direction2 = flow.add(new Vector3(+spread, +0.06, +spread));
    };

    const SPEED_MUL = 1.5;

    // ---------------------------
    // A) jatkuvat "pölyhiukkaset"
    // ---------------------------
    const dotTex = ParticleHelper.makeDotTexture(scene, "waterDotTex", 64);

    const dust = new ParticleSystem("waterDust", dustCapacity, scene);
    dust.particleTexture = dotTex;
    dust.emitter = emitter;

    dust.minEmitBox = new Vector3(-opts.area.x, emitY.min, -opts.area.z);
    dust.maxEmitBox = new Vector3(+opts.area.x, emitY.max, +opts.area.z);

    applyDirections(dust, getFlow(), 0.28);

    dust.minEmitPower = 0.3 * SPEED_MUL;
    dust.maxEmitPower = 0.75 * SPEED_MUL;
    dust.updateSpeed = 0.01 * SPEED_MUL;

    dust.minLifeTime = 3.2;
    dust.maxLifeTime = 7.8;

    dust.minSize = 0.012;
    dust.maxSize = 0.045;

    dust.color1 = new Color4(0.85, 0.92, 1.0, dustAlpha);
    dust.color2 = new Color4(0.85, 0.92, 1.0, dustAlpha * 0.45);
    dust.colorDead = new Color4(0.85, 0.92, 1.0, 0.0);

    dust.emitRate = dustEmitRate;
    dust.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    // kevyt “kellunta”
    dust.gravity = new Vector3(0, 0.035, 0);
    dust.start();

    // ---------------------------
    // B) satunnainen "roska" burstina
    // ---------------------------
    const debrisTex = ParticleHelper.makeDotTexture(scene, "debrisTex", 128);

    const debris = new ParticleSystem("waterDebris", debrisCapacity, scene);
    debris.particleTexture = debrisTex;
    debris.emitter = emitter;

    debris.minEmitBox = new Vector3(-opts.area.x, emitY.min, -opts.area.z);
    debris.maxEmitBox = new Vector3(+opts.area.x, emitY.max, +opts.area.z);

    applyDirections(debris, getFlow(), 0.18);

    debris.minEmitPower = 0.75 * SPEED_MUL;
    debris.maxEmitPower = 1.3 * SPEED_MUL;
    debris.updateSpeed = 0.011 * SPEED_MUL;

    debris.minLifeTime = 2.2;
    debris.maxLifeTime = 5.6;

    debris.minSize = 0.035;
    debris.maxSize = 0.11;

    debris.color1 = new Color4(0.75, 0.85, 0.95, debrisAlpha);
    debris.color2 = new Color4(0.75, 0.85, 0.95, debrisAlpha * 0.5);
    debris.colorDead = new Color4(0.75, 0.85, 0.95, 0.0);

    debris.emitRate = 0; // vain burstit
    debris.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    debris.gravity = new Vector3(0, 0.012, 0);
    debris.start();

    // Päivitetään virtaussuunta + satunnaiset burstit
    let accumulator = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      const dt = (scene.deltaTime ?? 16) / 1000;

      // päivitä suunta joka frame, jos flowDirProvider käytössä
      if (opts.flowDirProvider) {
        const flow = getFlow();
        applyDirections(dust, flow, 0.28);
        applyDirections(debris, flow, 0.18);
      }

      accumulator += dt;
      if (accumulator >= 0.25) {
        accumulator = 0;

        const p = debrisChancePerSecond * 0.25; // skaalaa 0.25s tikkiin
        if (Math.random() < p) {
          const count =
            debrisBurstMin +
            Math.floor(Math.random() * (debrisBurstMax - debrisBurstMin + 1));
          debris.manualEmitCount = count;
        }
      }
    });

    const dispose = () => {
      scene.onBeforeRenderObservable.remove(obs);

      dust.stop();
      debris.stop();

      dust.dispose();
      debris.dispose();

      dotTex.dispose();
      debrisTex.dispose();
    };

    return { dust, debris, dispose };
  }
}
