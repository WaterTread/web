"use client";

import {
  ArcRotateCamera,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders";
import { useEffect, useRef } from "react";

export default function BabylonScene() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ✅ Guard dev StrictMode tuplamounttia vastaan
    if (engineRef.current) return;

    const engine = new Engine(canvas, true, {
      // halutessa:
      // adaptToDeviceRatio: true,
      // preserveDrawingBuffer: true,
      // stencil: true,
    });
    engineRef.current = engine;

    const scene = new Scene(engine);

    const camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 3,
      6,
      new Vector3(0, 1, 0),
      scene,
    );
    camera.attachControl(canvas, true);

    new HemisphericLight("light", new Vector3(0, 1, 0), scene);

    const box = MeshBuilder.CreateBox("box", {}, scene);
    box.position.y = 1;

    MeshBuilder.CreateGround("ground", { width: 8, height: 8 }, scene);

    engine.runRenderLoop(() => {
      scene.render();
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    engine.resize();

    return () => {
      window.removeEventListener("resize", onResize);

      camera.detachControl();

      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "100vh",
        display: "block",
        touchAction: "none",
      }}
    />
  );
}
