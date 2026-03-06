import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAIProvider,
  deleteAIProvider,
  fetchAIProviderModels,
  getDefaultAIProviderId,
  getDefaultVlmProviderId,
  listAIProviders,
  setDefaultAIProviderId,
  setDefaultVlmProviderId,
  testAIProviderConnection,
} from "../../lib/tauri";
import { useUIStore } from "../../store/uiStore";
import type { ProviderKind } from "../../types/domain";

type Step = "choose-provider" | "enter-key" | "choose-model" | "done";

interface ProviderDef {
  kind: ProviderKind;
  icon: ReactNode;
  name: string;
  desc: string;
  needsBaseUrl: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    kind: "anthropic",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M24.8 11H15.2L7 30h6l2.2-5.6h9.6L27 30h6L24.8 11zm-7.4 10L20 14.5 22.6 21h-5.2z" fill="#C96442" />
      </svg>
    ),
    name: "Anthropic",
    desc: "Claude models via Anthropic API",
    needsBaseUrl: false,
  },
  {
    kind: "openai",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path
          d="M33.8 17.4c1-2.7.6-5.7-1.1-8-2.5-3.7-6.8-5.5-11-4.7-1.6-2-4-3.2-6.6-2.9C10.9 2.2 7.2 4.8 5.7 8.6c-2.7.9-4.9 2.8-6.1 5.4-2.4 4-1.8 9 1.1 12.3-1 2.7-.6 5.7 1.1 8 2.5 3.7 6.8 5.5 11 4.7 1.6 2 4 3.2 6.6 2.9 4.2-.6 7.9-3.2 9.4-7 2.7-.9 4.9-2.8 6.1-5.4 2.3-4 1.7-9-1.1-12.1zM20 25.5c-3 0-5.5-2.5-5.5-5.5s2.5-5.5 5.5-5.5 5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5z"
          fill="currentColor"
          opacity="0.85"
        />
      </svg>
    ),
    name: "OpenAI",
    desc: "GPT models via OpenAI API",
    needsBaseUrl: false,
  },
  {
    kind: "gemini",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path
          d="M20 4C19 12.4 14 18.8 2 20 14 21.2 19 27.6 20 36 21 27.6 26 21.2 38 20 26 18.8 21 12.4 20 4Z"
          fill="#4285F4"
        />
      </svg>
    ),
    name: "Google Gemini",
    desc: "Gemini models via Google AI",
    needsBaseUrl: false,
  },
  {
    kind: "openai_compatible",
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path d="M20 7L33 14.5V25.5L20 33L7 25.5V14.5Z" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.5" />
        <circle cx="13" cy="20" r="2.5" fill="currentColor" opacity="0.8" />
        <circle cx="20" cy="20" r="2.5" fill="currentColor" opacity="0.8" />
        <circle cx="27" cy="20" r="2.5" fill="currentColor" opacity="0.8" />
      </svg>
    ),
    name: "Local / Custom",
    desc: "Ollama, LM Studio, or any OpenAI-compatible endpoint",
    needsBaseUrl: true,
  },
];

function defaultBaseUrl(kind: ProviderKind, fallback: string) {
  if (fallback.trim()) {
    return fallback.trim();
  }
  if (kind === "anthropic") {
    return "https://api.anthropic.com";
  }
  if (kind === "openai") {
    return "https://api.openai.com";
  }
  if (kind === "gemini") {
    return "https://generativelanguage.googleapis.com";
  }
  return fallback;
}

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

  const providersQuery = useQuery({ queryKey: ["aiProviders"], queryFn: listAIProviders });
  const defaultLlmQuery = useQuery({ queryKey: ["defaultAIProviderId"], queryFn: getDefaultAIProviderId });
  const defaultVlmQuery = useQuery({ queryKey: ["defaultVlmProviderId"], queryFn: getDefaultVlmProviderId });

  const fetchModelsMutation = useMutation({
    mutationFn: () => fetchAIProviderModels({ kind: selectedKind!, apiKey, baseUrl: baseUrl || null }),
    onSuccess: (modelList) => {
      setModels(modelList);
      setSelectedModel(modelList[0] ?? "");
      setFetchError(null);
      setStep("choose-model");
    },
    onError: (error) => setFetchError(String(error)),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAIProvider({
        name: providerName.trim() || `${selectedKind} - ${selectedModel}`,
        kind: selectedKind!,
        baseUrl: defaultBaseUrl(selectedKind!, baseUrl),
        model: selectedModel,
        enabled: true,
        apiKey,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiProviders"] });
      setStep("done");
      setSelectedKind(null);
      setApiKey("");
      setBaseUrl("");
      setModels([]);
      setSelectedModel("");
      setProviderName("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAIProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiProviders"] });
      queryClient.invalidateQueries({ queryKey: ["defaultAIProviderId"] });
      queryClient.invalidateQueries({ queryKey: ["defaultVlmProviderId"] });
    },
  });

  const setDefaultTextMutation = useMutation({
    mutationFn: (id: string | null) => setDefaultAIProviderId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["defaultAIProviderId"] }),
  });

  const setDefaultVlmMutation = useMutation({
    mutationFn: (id: string | null) => setDefaultVlmProviderId(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["defaultVlmProviderId"] }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testAIProviderConnection(id),
  });

  const stepIndex = { "choose-provider": 0, "enter-key": 1, "choose-model": 2, done: 2 }[step];
  const providers = providersQuery.data ?? [];

  return (
    <div className="center-tool-view">
      <div className="tool-view-header">
        <button type="button" className="back-btn" onClick={() => setCenterView("editor")}>
          Back to Editor
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>AI Settings</h2>
      </div>

      <div className="tool-view-body">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            padding: 12,
            marginBottom: 20,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-elevated)",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Default text provider</span>
            <select
              value={defaultLlmQuery.data ?? ""}
              onChange={(e) => setDefaultTextMutation.mutate(e.target.value || null)}
              disabled={setDefaultTextMutation.isPending}
            >
              <option value="">None</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.model})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Default VLM provider</span>
            <select
              value={defaultVlmQuery.data ?? ""}
              onChange={(e) => setDefaultVlmMutation.mutate(e.target.value || null)}
              disabled={setDefaultVlmMutation.isPending}
            >
              <option value="">None</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.model})
                </option>
              ))}
            </select>
          </label>
        </div>

        {providers.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Configured providers</div>
            <div style={{ display: "grid", gap: 8 }}>
              {providers.map((provider) => {
                const isTextDefault = defaultLlmQuery.data === provider.id;
                const isVlmDefault = defaultVlmQuery.data === provider.id;
                return (
                  <div
                    key={provider.id}
                    className="compact-item"
                    style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{provider.name}</span>
                        {isTextDefault && <span className="scope-badge prefix">Text default</span>}
                        {isVlmDefault && <span className="scope-badge free">VLM default</span>}
                      </div>
                      <div className="compact-item-meta" style={{ marginTop: 4 }}>
                        {provider.kind} | {provider.model}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button type="button" className="sm" onClick={() => setDefaultTextMutation.mutate(provider.id)}>
                        Set text
                      </button>
                      <button type="button" className="sm" onClick={() => setDefaultVlmMutation.mutate(provider.id)}>
                        Set VLM
                      </button>
                      <button type="button" className="sm" onClick={() => testMutation.mutate(provider.id)}>
                        Test
                      </button>
                      <button
                        type="button"
                        className="sm danger"
                        onClick={() => deleteMutation.mutate(provider.id)}
                      >
                        x
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {testMutation.data && (
              <p style={{ fontSize: 12, color: testMutation.data.ok ? "#059669" : "#dc2626", marginTop: 8 }}>
                {testMutation.data.message} ({testMutation.data.latencyMs}ms)
              </p>
            )}
          </div>
        )}

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16 }}>Add a provider</div>

        <div className="step-indicator" style={{ marginBottom: 20 }}>
          {["Provider", "API Key", "Model"].map((label, index) => (
            <div key={label} style={{ display: "contents" }}>
              <div className={`step-dot${index < stepIndex ? " done" : index === stepIndex ? " active" : ""}`}>
                {index < stepIndex ? "OK" : index + 1}
              </div>
              <span style={{ fontSize: 12, color: index === stepIndex ? "var(--accent)" : "var(--text-faint)" }}>{label}</span>
              {index < 2 && <div className="step-line" />}
            </div>
          ))}
        </div>

        {step === "choose-provider" && (
          <div>
            <div className="provider-cards">
              {PROVIDERS.map((provider) => (
                <div
                  key={provider.kind}
                  className={`provider-card${selectedKind === provider.kind ? " selected" : ""}`}
                  onClick={() => setSelectedKind(provider.kind)}
                >
                  <div className="provider-card-icon">{provider.icon}</div>
                  <div className="provider-card-name">{provider.name}</div>
                  <div className="provider-card-desc">{provider.desc}</div>
                </div>
              ))}
            </div>
            <button type="button" className="primary" disabled={!selectedKind} onClick={() => setStep("enter-key")}>
              Continue
            </button>
          </div>
        )}

        {step === "enter-key" && selectedKind && (
          <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
            {PROVIDERS.find((provider) => provider.kind === selectedKind)?.needsBaseUrl && (
              <div>
                <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Base URL</label>
                <input
                  style={{ width: "100%" }}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>API key</label>
              <input
                style={{ width: "100%" }}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
            {fetchError && <p className="warn" style={{ fontSize: 12 }}>{fetchError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setStep("choose-provider")}>Back</button>
              <button
                type="button"
                className="primary"
                disabled={!apiKey.trim() || fetchModelsMutation.isPending}
                onClick={() => fetchModelsMutation.mutate()}
              >
                {fetchModelsMutation.isPending ? "Loading models..." : "Load models"}
              </button>
            </div>
          </div>
        )}

        {(step === "choose-model" || step === "done") && (
          <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Model</label>
              <select style={{ width: "100%" }} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, display: "block", marginBottom: 4 }}>Provider name (optional)</label>
              <input
                style={{ width: "100%" }}
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder={`${selectedKind} - ${selectedModel}`}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setStep("enter-key")}>Back</button>
              <button
                type="button"
                className="primary"
                disabled={!selectedModel || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? "Saving..." : "Save provider"}
              </button>
            </div>
            {step === "done" && <p className="ok" style={{ fontSize: 12 }}>Provider saved.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
