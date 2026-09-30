// Bridge agent configuration, persisted to <userData>/config.json.
import * as fs from 'fs';
import * as path from 'path';

export interface HealthlinkConfig {
  // HealthLink Online web service endpoint (set during formal integration
  // testing — see build plan month 16).
  endpoint: string;
  practiceHealthlinkId: string;
  // Mutual TLS certificate (PFX) exported from the Windows certificate store.
  certPath: string;
  certPassphrase: string;
}

export interface BridgeConfig {
  supabaseUrl: string;
  bridgeKey: string;
  practiceId: string;
  pollIntervalMs: number;
  healthlink: HealthlinkConfig;
}

const DEFAULTS: BridgeConfig = {
  supabaseUrl: '',
  bridgeKey: '',
  practiceId: '',
  pollIntervalMs: 60_000,
  healthlink: {
    endpoint: '',
    practiceHealthlinkId: '',
    certPath: '',
    certPassphrase: '',
  },
};

let configPath = '';

export function initConfig(userDataDir: string): void {
  configPath = path.join(userDataDir, 'config.json');
}

export function loadConfig(): BridgeConfig {
  if (!configPath) throw new Error('config not initialised');
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      ...DEFAULTS,
      ...raw,
      healthlink: { ...DEFAULTS.healthlink, ...(raw.healthlink ?? {}) },
    };
  } catch {
    return { ...DEFAULTS, healthlink: { ...DEFAULTS.healthlink } };
  }
}

export function saveConfig(config: BridgeConfig): void {
  if (!configPath) throw new Error('config not initialised');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// On first launch, look for a HealthLink PFX certificate in the common
// locations. On Windows the cert typically lives in the user store; the
// practice exports it to PFX once and the agent reads it from disk.
export function detectCertificate(config: BridgeConfig): string | null {
  if (config.healthlink.certPath && fs.existsSync(config.healthlink.certPath)) {
    return config.healthlink.certPath;
  }
  const candidates = [
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'HealthLink', 'certificate.pfx')
      : null,
    process.env.APPDATA
      ? path.join(process.env.APPDATA, 'curam-bridge', 'certificate.pfx')
      : null,
  ].filter((p): p is string => Boolean(p));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
