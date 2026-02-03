"use client";

import { Engine } from "@babylonjs/core/Engines/engine";
import { useEffect, useRef } from "react";
import createScene from "./createScene";

export default function BabylonClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Guard dev StrictMode tuplamounttia vastaan
    if (engineRef.current) return;

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      // adaptToDeviceRatio: true, // halutessa terävämpi @ high-DPI
    });
    engineRef.current = engine;

    const scene = createScene(engine, canvas);

    engine.runRenderLoop(() => {
      scene.render();
    });

    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    engine.resize(); // varmistus heti alussa

    return () => {
      window.removeEventListener("resize", onResize);

      // Siistimpi shutdown
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
      />
      <a
        href="https://github.com/WaterTread/watertread/"
        target="_blank"
        rel="noreferrer"
        aria-label="WaterTread on GitHub"
        style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          width: "64px",
          height: "64px",
          display: "block",
          opacity: 0.9,
        }}
      >
        <img
          src="/watertread.svg"
          alt=""
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      </a>
    </div>
  );
}
