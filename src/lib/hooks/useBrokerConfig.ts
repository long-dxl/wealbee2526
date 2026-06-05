import { useState, useEffect } from 'react';

export type BrokerId = 'dnse' | 'ssi' | 'vps' | 'vcsc' | 'vnd';

export interface BrokerConfig {
  broker: BrokerId;
  token: string;       // X-API-Key value
  apiKey?: string;
  apiSecret?: string;  // HMAC secret
  accountNo?: string;  // e.g. "0001179019"
  connectedAt?: string;
}

const STORAGE_KEY = 'wealbee_broker_config';
const CHANGE_EVENT = 'wealbee:broker-config-change';

export function getBrokerConfig(): BrokerConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as BrokerConfig;
    if (!cfg.apiKey && cfg.token) cfg.apiKey = cfg.token;
    return cfg;
  } catch {
    return null;
  }
}

export function useBrokerConfig() {
  const [config, setConfigState] = useState<BrokerConfig | null>(getBrokerConfig);

  useEffect(() => {
    const handler = () => setConfigState(getBrokerConfig());
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, []);

  const saveConfig = (cfg: BrokerConfig) => {
    const normalized = { ...cfg, apiKey: cfg.apiKey ?? cfg.token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    setConfigState(normalized);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  };

  const clearConfig = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConfigState(null);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  };

  return { config, saveConfig, clearConfig };
}
