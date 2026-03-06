import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  confirmAttribution,
  pasteImportAndAutoAttribution,
} from "../lib/tauri";
import { useUIStore } from "../store/uiStore";

export function OutputInboxPanel() {
  const projectId = useUIStore((s) => s.projectId);
  const [sourceImagePath, setSourceImagePath] = useState("");
  const [clipboardText, setClipboardText] = useState("");
  const [modelHint, setModelHint] = useState("");
  const [resultMessage, setResultMessage] = useState<string>("");
  const [lastResult, setLastResult] = useState<Awaited<
    ReturnType<typeof pasteImportAndAutoAttribution>
  > | null>(null);

  const pasteMutation = useMutation({
    mutationFn: () =>
      pasteImportAndAutoAttribution({
        projectId: projectId ?? "",
        sourceImagePath,
        clipboardText: clipboardText || null,
        modelHint: modelHint || null,
      }),
    onSuccess: (result) => {
      setLastResult(result);
      setResultMessage("Imported output with ranked attribution candidates");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (attributionId: string) =>
      confirmAttribution(lastResult?.outputId ?? "", attributionId),
    onSuccess: () => {
      setResultMessage("Attribution confirmed");
    },
  });

  return (
    <section className="panel">
      <h2>OutputInboxPanel</h2>
      <p>Pasteback import with auto-attribution ranking and one-click confirm.</p>
      {!projectId && <p className="warn">Select a project in EditorWorkspace first.</p>}
      <div className="toolbar">
        <input
          style={{ minWidth: 420 }}
          placeholder="Generated image absolute path"
          value={sourceImagePath}
          onChange={(e) => setSourceImagePath(e.target.value)}
        />
        <input
          placeholder="Model hint (optional)"
          value={modelHint}
          onChange={(e) => setModelHint(e.target.value)}
        />
      </div>
      <textarea
        rows={4}
        style={{ width: "100%" }}
        value={clipboardText}
        onChange={(e) => setClipboardText(e.target.value)}
        placeholder="Paste clipboard text to improve payload parsing (optional)"
      />
      <div className="toolbar">
        <button
          className="primary"
          type="button"
          onClick={() => pasteMutation.mutate()}
          disabled={!projectId || !sourceImagePath}
        >
          Import + Auto Attribute
        </button>
        {resultMessage && <span className="ok">{resultMessage}</span>}
      </div>
      {lastResult && (
        <div>
          <p className="mono">output: {lastResult.outputPath}</p>
          <ul className="list">
            {lastResult.candidates.map((candidate, index) => (
              <li className="list-item" key={candidate.attributionId}>
                <div>
                  candidate #{index + 1}: {candidate.promptVersionId}
                </div>
                <div className="mono">
                  score={candidate.score} reason={candidate.reason}
                </div>
                <button
                  type="button"
                  onClick={() => confirmMutation.mutate(candidate.attributionId)}
                >
                  Confirm
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
