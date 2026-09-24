import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import FloorPlanImportWorkspace from "@/components/editor/FloorPlanImportWorkspace";

const noop = () => undefined;
function Harness() {
  const [open, setOpen] = useState(true);
  const [request, setRequest] = useState<{ file: File; trainingBenchmarkOptIn: boolean } | null>(null);
  return <main>
    <h1>Production import workspace lifecycle verification</h1>
    <button onClick={() => setOpen(false)}>Close workspace</button>
    <button onClick={() => { setRequest({ file: new File(["authored transport fixture"], "replacement-plan.png", { type: "image/png" }), trainingBenchmarkOptIn: false }); setOpen(true); }}>Replace upload</button>
    {open && <FloorPlanImportWorkspace request={request} trainingBenchmarkOptIn={false} dark={false} disabled={false} proMode={false}
      onChooseFile={() => setOpen(false)} onHistoryConfirmationOpenChange={noop} onTrainingBenchmarkOptInChange={noop} />}
  </main>;
}
const host = document.createElement("div"); document.body.append(host);
createRoot(host).render(<StrictMode><Harness /></StrictMode>);
