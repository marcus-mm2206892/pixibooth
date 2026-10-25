"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BoothEngine, isCameraPhase } from "@/lib/boothEngine";
import { BrowserCameraAdapter } from "@/lib/camera";
import { WelcomeScreen } from "./WelcomeScreen";
import { TemplatePicker } from "./TemplatePicker";
import { FilterPicker } from "./FilterPicker";
import { CameraBooth } from "./CameraBooth";
import { PhotoReview } from "./PhotoReview";
import { ResultScreen } from "./ResultScreen";
import { FinaleScreen } from "./FinaleScreen";

export default function PhotoBoothApp() {
  const [engine] = useState(() => new BoothEngine(new BrowserCameraAdapter()));
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  useEffect(() => {
    engine.hydrate();
    const onVisibility = () => engine.handleVisibility(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      engine.shutdown();
    };
  }, [engine]);

  const { phase, session } = state;

  if (isCameraPhase(phase) || phase === "error") {
    return <CameraBooth state={state} engine={engine} />;
  }

  switch (phase) {
    case "template-select":
      return (
        <TemplatePicker
          session={session}
          onSelect={(t) => engine.setTemplate(t)}
          onBack={() => engine.goHome()}
          onNext={() => engine.showFilters()}
        />
      );
    case "filter-select":
      return (
        <FilterPicker
          session={session}
          onSelect={(f) => engine.setFilter(f)}
          onBack={() => engine.showTemplates()}
          onNext={() => engine.showCamera()}
        />
      );
    case "review":
      return (
        <PhotoReview
          session={session}
          onRetake={(i) => engine.retake(i)}
          onRetakeAll={() => engine.retakeAll()}
          onContinue={() => engine.showResult()}
        />
      );
    case "result":
      return (
        <ResultScreen
          session={session}
          onTemplate={(t) => engine.setTemplate(t)}
          onFilter={(f) => engine.setFilter(f)}
          onBack={() => engine.showReview()}
          onFinish={() => engine.showFinale()}
        />
      );
    case "finale":
      return (
        <FinaleScreen session={session} onBack={() => engine.showResult()} onNewSession={() => engine.newSession()} />
      );
    default:
      return <WelcomeScreen onStart={() => engine.begin()} />;
  }
}
