import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleHelper } from "../ParticleHelper";

export const setupWaterParticles = (scene: Scene, emitter: AbstractMesh) => {
  const deviceFlowDir = new Vector3(0, 0, -1);

  return ParticleHelper.createWaterFlowParticles({
    scene,
    emitter,
    flowDir: deviceFlowDir,
    area: { x: 7.5, z: 7.5 },
    emitY: { min: 0.7, max: 1.6 },
    dustEmitRate: 520,
    dustCapacity: 1200,
    debrisChancePerSecond: 0.15,
    debrisBurstMin: 1,
    debrisBurstMax: 6,
    debrisCapacity: 1800,
  });
};
