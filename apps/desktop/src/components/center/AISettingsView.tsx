import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAIProvider,
  deleteAIProvider,
  fetchAIProviderModels,
  listAIProviders,
  setDefaultAIProviderId,
  testAIProviderConnection,
} from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";
import type { ProviderKind } from "../../types/domain";

type Step = "choose-provider" | "enter-key" | "choose-model" | "done";

interface ProviderDef {
  kind: ProviderKind;
  icon: string;
  name: string;
  desc: string;
  needsBaseUrl: boolean;
}

const PROVIDERS: ProviderDef[] = [
  { kind: "anthropic", icon: "🟠", name: "Anthropic", desc: "Claude models via Anthropic API", needsBaseUrl: false },
  { kind: "openai", icon: "🟢", name: "OpenAI", desc: "GPT models via OpenAI API", needsBaseUrl: false },
  { kind: "gemini", icon: "🔵", name: "Google Gemini", desc: "Gemini models via Google AI", needsBaseUrl: false },
  { kind: "openai_compatible", icon: "⚪", name: "OpenAI Compatible", desc: "Any provider with /v1/models API (DeepSeek, Together, etc.)", needsBaseUrl: true },
];

export function AISettingsView() {
  const setCenterView = useUIStore((s) => s.setCenterView);
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("choose-provider");
  const [selectedKind, setSelectedKind] = useState<ProviderKind | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [providerName, setProviderName] = useState("");
  const [fetchError, setFetchError] = useState<string | null>(null);

  const existingProvidersQuery = useQuery({ queryKey: ["aiProviders"], queryFn: listAIProviders });

  const fetchModelsMutation = useMutation({
    mutationFn: () =>
      fetchAIProviderModels({ kind: selectedKind!, apiKey, baseUrl: baseUrl || null }),
    onSuccess: (modelList) => {
      setModels(modelList);
      setSelectedModel(modelList[0] ?? "");
      setFetchError(null);
      setStep("choose-model");
    },
    onError: (e) => setFetchError(String(e)),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAIProvider({
        name: providerName.trim() || `${selectedKind} — ${selectedModel}`,
        kind: selectedKind!,
        baseUrl: baseUrl || (
          selectedKind === "anthropic" ? "https://api.anthropic.com" :
          selectedKind === "openai" ? "https://api.openai.com" :
          selectedKind === "gemini" ? "https://generativelanguage.googleapis.com" :
          baseUrl
        ),
        model: selectedModel,
        enabled: true,
        apiKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiProviders"] });
      setStep("done");
      setSelectedKind(null); setApiKey(""); setBaseUrl(""); setModels([]); setSelectedModel(""); setProviderName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAIProvider(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiProviders"] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultAIProviderId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["defaultAIProviderId"] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testAIProviderConnection(id),
  });

  const stepIndex = { "choose-provider": 0, "enter-key": 1, "choose-model": 2, "done": 2 }[step];

  return (
    <div className="center-tool-view">
      <div className="tool-view-header">
        <button type="button" className="back-btn" onClick={() => setCenterView("editor")}>
          ← Back to Editor
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>AI Settings</h2>
      </div>

      <div className="tool-view-body">
        {/* Existing providers */}
        {existingProvidersQuery.data && existingProvidersQuery.data.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Configured providers</div>
            {existingProvidersQuery.data.map((p) => (
              <div key={p.id} className="compact-item" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</span>
                  <span className="compact-item-meta" style={{ marginLeft: 8 }}>{p.model}</span>
                </div>
                <button type="button" style={{ fontSize: 11 }} onClick={() => setDefaultMutation.mutate(p.id)}>Set default</button>
                <button type="button" style={{ fontSize: 11 }} onClick={() => testMutation.mutate(p.id)}>Test</button>
                <button type="button" style={{ fontSize: 11, color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => deleteMutation.mutate(p.id)}>✕</button>
              </div>
            ))}
            {testMutation.data && (
              <p style={{ fontSize: 12, color: testMutation.data.ok ? "#059669" : "#dc2626" }}>
                {testMutation.data.message} ({testMutation.data.latencyMs}ms)
              </p>
            )}
            <hr style={{ margin: "20px 0", borderColor: "#f3f4f6" }} />
          </div>
        )}

        {/* Add new provider */}
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Add a provider</div>

        {/* Step indicator */}
        <div className="step-indicator" style={{ marginBottom: 20 }}>
          {["Provider", "API Key", "Model"].map((label, i) => (
            <div key={label} style={{ display: "contents" }}>
              <div className={`step-dot${i < stepIndex ? " done" : i === stepIndex ? " active" : ""}`}>
                {i < stepIndex ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 12, color: i === stepIndex ? "#0ea5e9" : "#9ca3af" }}>{label}</span>
              {i < 2 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {/* Step 1: Choose provider */}
        {step === "choose-provider" && (
          <div>
            <div className="provider-cards">
              {PROVIDERS.map((p) => (
                <div
                  key={p.kind}
                  className={`provider-card${selectedKind === p.kind ? " selected" : ""}`}
                  onClick={() => setSelectedKind(p.kind)}
                >
                  <div className="provider-card-icon">{p.icon}</div>
                  <div className="provider-card-name">{p.name}</div>
                  <div className="provider-card-desc">{p.desc}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="primary"
              disabled={!selectedKind}
              onClick={() => setStep("enter-key")}
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: API Key */}
        {step === "enter-key" && selectedKind && (
          <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
            {PROVIDERS.find((p) => p.kind === selectedKind)?.needsBaseUrl && (
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Base URL</label>
                <input
                  style={{ width: "100%" }}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com"
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>API Key</label>
              <input
                style={{ width: "100%" }}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            </div>
            {fetchError && <p className="warn" style={{ fontSize: 12 }}>{fetchError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setStep("choose-provider")}>← Back</button>
              <button
                type="button"
                className="primary"
                disabled={!apiKey.trim() || fetchModelsMutation.isPending}
                onClick={() => fetchModelsMutation.mutate()}
              >
                {fetchModelsMutation.isPending ? "Loading models…" : "Load models →"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Choose model */}
        {(step === "choose-model" || step === "done") && (
          <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Model</label>
              <select style={{ width: "100%" }} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Provider name (optional)</label>
              <input
                style={{ width: "100%" }}
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder={`${selectedKind} — ${selectedModel}`}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setStep("enter-key")}>← Back</button>
              <button
                type="button"
                className="primary"
                disabled={!selectedModel || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Saving…" : "Save provider"}
              </button>
            </div>
            {step === "done" && <p className="ok" style={{ fontSize: 12 }}>Provider saved. Add another or close.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
