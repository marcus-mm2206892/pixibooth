"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BoothEngine, isCameraPhase } from "@/lib/boothEngine";
import { BrowserCameraAdapter } from "@/lib/camera";
import { WelcomeScreen } from "./WelcomeScreen";
import { StyleScreen } from "./StyleScreen";
import { CameraBooth } from "./CameraBooth";
import { KeepScreen } from "./KeepScreen";
import { ThanksScreen } from "./ThanksScreen";
import { ShutterFlash } from "./ShutterFlash";

export default function PhotoBoothApp() {
  const [engine] = useState(() => new BoothEngine(new BrowserCameraAdapter()));
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  useEffect(() => {
    const onVisibility = () => engine.handleVisibility(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      engine.shutdown();
    };
  }, [engine]);

  const { phase, session } = state;

  const screen = (() => {
    if (isCameraPhase(phase) || phase === "error") return <CameraBooth state={state} engine={engine} />;
    switch (phase) {
      case "style-select":
        return <StyleScreen state={state} engine={engine} />;
      case "result":
        return (
          <KeepScreen session={session} onRetake={(i) => engine.retake(i)} onFinish={() => engine.finish()} />
        );
      case "thanks":
        return <ThanksScreen onDone={() => engine.goHome()} />;
      default:
        return <WelcomeScreen onStart={() => engine.begin()} />;
    }
  })();

  return (
    <>
      {screen}
      <ShutterFlash count={state.flashCount} />
    </>
  );
}
