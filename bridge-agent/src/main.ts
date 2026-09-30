// Cúram HealthLink Bridge — Electron main process.
// Runs in the system tray, polls HealthLink every 60s, syncs with Supabase.
import { app, Tray, Menu, nativeImage, Notification } from 'electron';
import * as path from 'path';
import { initConfig, loadConfig, detectCertificate, saveConfig, BridgeConfig } from './config';
import { initLogger, log } from './logger';
import { fetchMessages, submitReferral } from './healthlink-client';
import { parseHl7Xml } from './hl7-parser';
import * as sync from './supabase-sync';

type AgentStatus = 'disconnected' | 'connected' | 'error';
let tray: Tray | null = null;
let status: AgentStatus = 'disconnected';
let pollTimer: NodeJS.Timeout | null = null;
let config: BridgeConfig;

// ---- tray ------------------------------------------------------------------

function trayIcon(status: AgentStatus): Electron.NativeImage {
  // 16x16 coloured dot per status. Generated at runtime so no asset files.
  const colours: Record<AgentStatus, [number, number, number]> = {
    connected: [76, 175, 80],    // green
    disconnected: [158, 158, 158], // grey
    error: [244, 67, 54],        // red
  };
  const [r, g, b] = colours[status];
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const inside = dx * dx + dy * dy <= (size / 2 - 1) ** 2;
      const offset = (y * size + x) * 4;
      canvas[offset] = inside ? r : 0;
      canvas[offset + 1] = inside ? g : 0;
      canvas[offset + 2] = inside ? b : 0;
      canvas[offset + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function setStatus(next: AgentStatus, detail?: string): void {
  status = next;
  if (tray) {
    tray.setImage(trayIcon(status));
    tray.setToolTip(`Cúram HealthLink Bridge — ${status}${detail ? `: ${detail}` : ''}`);
  }
}

function createTray(): void {
  tray = new Tray(trayIcon(status));
  tray.setToolTip('Cúram HealthLink Bridge — starting');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Status: starting…', enabled: false },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          stopPolling();
          app.quit();
        },
      },
    ])
  );
  setStatus('disconnected');
}

// ---- polling loop ----------------------------------------------------------

async function pollOnce(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.supabaseUrl || !cfg.bridgeKey) {
    setStatus('disconnected', 'not configured — edit config.json');
    return;
  }
  try {
    await sync.heartbeat(cfg);
    const messages = await fetchMessages(cfg);
    if (messages.length > 0) {
      log.info(`received ${messages.length} HealthLink messages`);
      await sync.ingestMessages(cfg, messages);
    }
    await sync.processOutbox(cfg, submitReferral);
    setStatus('connected');
  } catch (e) {
    log.error('poll failed', { error: e instanceof Error ? e.message : String(e) });
    setStatus('error', e instanceof Error ? e.message : undefined);
  }
}

function startPolling(): void {
  stopPolling();
  void pollOnce();
  pollTimer = setInterval(() => void pollOnce(), config.pollIntervalMs);
}

function stopPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---- app lifecycle ---------------------------------------------------------

app.whenReady().then(() => {
  initLogger(app.getPath('userData'));
  initConfig(app.getPath('userData'));
  config = loadConfig();
  log.info('bridge starting', { version: app.getVersion() });

  // Auto-start with the OS (Windows: registry run key / macOS: login item).
  app.setLoginItemSettings({ openAtLogin: true });

  const cert = detectCertificate(config);
  if (!cert) {
    log.warn('no HealthLink certificate detected — set healthlink.certPath in config.json');
  } else if (config.healthlink.certPath !== cert) {
    config.healthlink.certPath = cert;
    saveConfig(config);
    log.info('auto-detected HealthLink certificate', { certPath: cert });
  }

  if (!config.healthlink.endpoint) {
    log.warn('HealthLink endpoint not configured — inbound polling disabled until formal integration');
  }

  createTray();
  startPolling();

  // Auto-update check: compare the running version against the latest release
  // manifest served alongside the installer. Notifies via tray; install
  // happens on next launch.
  checkForUpdates(config).catch((e) => log.warn('update check failed', { error: String(e) }));
});

app.on('window-all-closed', () => {
  // Tray app: keep running.
});

async function checkForUpdates(config: BridgeConfig): Promise<void> {
  const manifestUrl = `${config.supabaseUrl}/storage/v1/object/public/releases/bridge/latest.json`;
  const res = await fetch(manifestUrl);
  if (!res.ok) return;
  const manifest = (await res.json()) as { version?: string };
  if (manifest.version && manifest.version !== app.getVersion()) {
    log.info('update available', { current: app.getVersion(), latest: manifest.version });
    if (tray) tray.setToolTip(`Cúram HealthLink Bridge — update ${manifest.version} available`);
    new Notification({
      title: 'Cúram Bridge update',
      body: `Version ${manifest.version} is available. It will install on next launch.`,
    }).show();
  }
}
