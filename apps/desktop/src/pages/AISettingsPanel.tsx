import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAIProvider,
  deleteAIProvider,
  getDefaultAIProviderId,
  listAIProviders,
  setDefaultAIProviderId,
  testAIProviderConnection,
} from "../lib/tauri";
import type { ProviderKind } from "../types/domain";

export function AISettingsPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("OpenAI Main");
  const [kind, setKind] = useState<ProviderKind>("openai");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com");
  const [model, setModel] = useState("gpt-4o-mini");
  const [apiKey, setApiKey] = useState("");
  const [testMessage, setTestMessage] = useState<string>("");

  const providersQuery = useQuery({
    queryKey: ["aiProviders"],
    queryFn: listAIProviders,
  });

  const defaultProviderQuery = useQuery({
    queryKey: ["defaultAIProviderId"],
    queryFn: getDefaultAIProviderId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAIProvider({
        name,
        kind,
        baseUrl,
        model,
        enabled: true,
        apiKey,
      }),
    onSuccess: () => {
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["aiProviders"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAIProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiProviders"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testAIProviderConnection(id),
    onSuccess: (res) => setTestMessage(`${res.ok ? "OK" : "FAILED"}: ${res.message}`),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (providerId: string | null) => setDefaultAIProviderId(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["defaultAIProviderId"] });
    },
  });

  return (
    <section className="panel">
      <h2>AISettingsPanel</h2>
      <p>Optional enhancement. Core workflow still works with zero AI providers.</p>
      <div className="grid-2">
        <div>
          <h3>Create Provider</h3>
          <div className="toolbar">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <select value={kind} onChange={(e) => setKind(e.target.value as ProviderKind)}>
              <option value="openai_compatible">openai_compatible</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
              <option value="gemini">gemini</option>
            </select>
          </div>
          <input
            style={{ width: "100%" }}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL"
          />
          <input
            style={{ width: "100%", marginTop: 8 }}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Default model"
          />
          <input
            style={{ width: "100%", marginTop: 8 }}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API key"
            type="password"
          />
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="primary" type="button" onClick={() => createMutation.mutate()}>
              Save Provider
            </button>
          </div>
        </div>
        <div>
          <h3>Registered Providers</h3>
          <p className="mono">
            default: {defaultProviderQuery.data ?? "(not set)"}
          </p>
          {testMessage && <p className="mono">{testMessage}</p>}
          <ul className="list">
            {providersQuery.data?.map((provider) => (
              <li className="list-item" key={provider.id}>
                <div>
                  <strong>{provider.name}</strong> ({provider.kind})
                </div>
                <div className="mono">{provider.baseUrl}</div>
                <div className="mono">model: {provider.model}</div>
                <div className="toolbar">
                  <button
                    type="button"
                    onClick={() => setDefaultMutation.mutate(provider.id)}
                  >
                    Set Default
                  </button>
                  <button type="button" onClick={() => testMutation.mutate(provider.id)}>
                    Test
                  </button>
                  <button type="button" onClick={() => deleteMutation.mutate(provider.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setDefaultMutation.mutate(null)}>
            Clear Default
          </button>
        </div>
      </div>
    </section>
  );
}
