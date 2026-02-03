import { Color3 } from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Tools } from "@babylonjs/core/Misc/tools";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import type { Scene } from "@babylonjs/core/scene";

const PROTO_ROOT_URL = "/";

const matchTransform = (src: AbstractMesh, dst: AbstractMesh) => {
  src.computeWorldMatrix(true);

  dst.position.copyFrom(src.position);
  dst.scaling.copyFrom(src.scaling);

  if (src.rotationQuaternion) {
    dst.rotationQuaternion = src.rotationQuaternion.clone();
  } else {
    dst.rotationQuaternion = null;
    dst.rotation.copyFrom(src.rotation);
  }
};

const hideChildrenByName = (root: AbstractMesh, namesToHide: string[]) => {
  for (const m of root.getChildMeshes(true) as AbstractMesh[]) {
    if (namesToHide.includes(m.name)) {
      m.setEnabled(false);
      m.isPickable = false;
    }
  }
};

export const loadMovingParts = async (options: {
  scene: Scene;
  slab: AbstractMesh;
  slabHeight: number;
  hiddenMeshNames: string[];
  file?: string;
}): Promise<AbstractMesh | null> => {
  const { scene, slab, slabHeight, hiddenMeshNames, file } = options;
  const protoFile = file ?? "prototype_moving_parts.glb";

  let movingRoot: AbstractMesh | null = null;

  await new Promise<void>((resolve) => {
    SceneLoader.ImportMesh(
      "",
      PROTO_ROOT_URL,
      protoFile,
      scene,
      (meshes, _ps, _sk, animationGroups) => {
        const root = meshes[0] as AbstractMesh | undefined;
        if (!root) {
          resolve();
          return;
        }

        movingRoot = root;

        for (const m of meshes) m.layerMask = 1;

        const greyPlastic = new PBRMaterial("greyPlastic", scene);
        greyPlastic.albedoColor = new Color3(0.45, 0.45, 0.48);
        greyPlastic.metallic = 0.0;
        greyPlastic.roughness = 0.6;

        const renderMeshes = root.getChildMeshes(true) as AbstractMesh[];
        for (const m of renderMeshes) {
          if (m.getTotalVertices && m.getTotalVertices() > 0) {
            m.material = greyPlastic;
          }
          m.layerMask = 1;
        }

        const slabTopY = slab.position.y + slabHeight / 2;

        root.computeWorldMatrix(true);
        const bi = root.getBoundingInfo();
        const minY = bi.boundingBox.minimumWorld.y;
        const deltaY = slabTopY - minY;

        root.rotationQuaternion = null;
        root.rotation.x = Tools.ToRadians(20);
        root.position.y += deltaY + 1;
        root.position.x = slab.position.x;
        root.position.z = slab.position.z;

        root.scaling.setAll(0.01);

        for (const cm of renderMeshes) {
          if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
          new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
        }

        for (const ag of animationGroups) ag.start(true);
        hideChildrenByName(root, hiddenMeshNames);

        resolve();
      },
    );
  });

  return movingRoot;
};

export const loadStaticParts = async (options: {
  scene: Scene;
  slab: AbstractMesh;
  movingRoot: AbstractMesh | null;
  file?: string;
}) => {
  const { scene, slab, movingRoot, file } = options;
  const staticFile = file ?? "prototype_static_parts.glb";

  await new Promise<void>((resolve) => {
    SceneLoader.ImportMesh("", PROTO_ROOT_URL, staticFile, scene, (meshes) => {
      const root = meshes[0] as AbstractMesh | undefined;
      if (!root) {
        resolve();
        return;
      }

      for (const m of meshes) m.layerMask = 1;

      const whiteMat = new PBRMaterial("staticWhite", scene);
      whiteMat.albedoColor = new Color3(1, 1, 1);
      whiteMat.metallic = 0.0;
      whiteMat.roughness = 0.8;

      const renderMeshes = root.getChildMeshes(true) as AbstractMesh[];
      for (const m of renderMeshes) {
        if (m.getTotalVertices && m.getTotalVertices() > 0) {
          m.material = whiteMat;
        }
        m.layerMask = 1;
      }

      if (movingRoot) {
        matchTransform(movingRoot, root);
      } else {
        root.position.copyFrom(slab.position);
        root.scaling.setAll(0.01);
      }

      for (const cm of renderMeshes) {
        if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
        new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
      }

      resolve();
    });
  });
};

export const loadFlowDiverter = async (options: {
  scene: Scene;
  slab: AbstractMesh;
  slabHeight: number;
  movingRoot: AbstractMesh | null;
  file?: string;
}) => {
  const { scene, slab, slabHeight, movingRoot, file } = options;
  const flowDiverterFile = file ?? "flow_diverter.glb";

  await new Promise<void>((resolve) => {
    SceneLoader.ImportMesh(
      "",
      PROTO_ROOT_URL,
      flowDiverterFile,
      scene,
      (meshes) => {
        const root = meshes[0] as AbstractMesh | undefined;
        if (!root) {
          resolve();
          return;
        }

        // Root name as requested
        root.name = "flowdiverter";

        // Layer mask
        for (const m of meshes) {
          m.layerMask = 1;
        }

        // Material (optional). Poista jos haluat käyttää GLB:n omia materiaaleja.
        const diverterMat = new PBRMaterial("flowDiverterMat", scene);
        diverterMat.albedoColor = new Color3(1, 1, 1);
        diverterMat.metallic = 0.0;
        diverterMat.roughness = 0.8;

        const renderMeshes = root.getChildMeshes(true) as AbstractMesh[];
        for (const m of renderMeshes) {
          if (m.getTotalVertices && m.getTotalVertices() > 0) {
            m.material = diverterMat;
          }
          m.layerMask = 1;
        }

        if (movingRoot) {
          // copy position + scaling only
          root.position.copyFrom(movingRoot.position);
          root.scaling.copyFrom(movingRoot.scaling);

          // pieni offset: nosta hieman ja siirrä vähän eteen (säädä halutessa)
          root.position.y -= 0.3;
          root.position.z += 3.3;
        } else {
          root.position.copyFrom(slab.position);
          root.position.y += slabHeight / 2 + 0.15;
          root.scaling.setAll(0.01);
        }

        // Jos flowdiverter on mallinnettu samaan mittaan kuin proto, tämä on ok.
        // Jos mittakaava on eri, säädä tätä:
        root.scaling.setAll(0.01);

        // Colliderit (staattinen)
        for (const cm of renderMeshes) {
          if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
          new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
        }

        resolve();
      },
    );
  });
};

export const loadEnvironment = async (scene: Scene) => {
  await new Promise<void>((resolve) => {
    SceneLoader.ImportMesh(
      "",
      "/",
      "underwaterground.glb",
      scene,
      async (newMeshes) => {
        for (const m of newMeshes) m.layerMask = 1;

        const groundMat = await NodeMaterial.ParseFromSnippetAsync(
          "PMHWJS",
          scene,
        );
        groundMat.name = "groundMaterial";

        const ground = scene.getMeshByName("ground") as AbstractMesh | null;
        if (ground) ground.material = groundMat;

        const root = newMeshes[0] as AbstractMesh | undefined;
        const colliders: AbstractMesh[] = root
          ? (root.getChildMeshes(false) as AbstractMesh[])
          : (newMeshes.filter(
              (x): x is AbstractMesh => x instanceof Mesh,
            ) as AbstractMesh[]);

        for (const cm of colliders) {
          if (!cm.getTotalVertices || cm.getTotalVertices() === 0) continue;
          new PhysicsAggregate(cm, PhysicsShapeType.MESH, { mass: 0 }, scene);
        }

        resolve();
      },
    );
  });
};
