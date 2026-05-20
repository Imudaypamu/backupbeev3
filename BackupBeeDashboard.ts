import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BackupManager } from '../BackupManager';
import { SessionTracker } from '../SessionTracker';

export class BackupBeeDashboard {
  public static currentPanel: BackupBeeDashboard | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    private backupManager: BackupManager,
    private sessionTracker: SessionTracker
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtml();
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables
    );

    // Refresh content every 10 seconds if visible
    const interval = setInterval(() => {
      if (this._panel.visible) { this._pushState(); }
    }, 10_000);
    this._disposables.push({ dispose: () => clearInterval(interval) });

    // Initial data push
    setTimeout(() => this._pushState(), 300);
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    backupManager: BackupManager,
    sessionTracker: SessionTracker,
    tab: 'backups' | 'session' | 'settings' = 'backups'
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (BackupBeeDashboard.currentPanel) {
      BackupBeeDashboard.currentPanel._panel.reveal(column);
      BackupBeeDashboard.currentPanel._pushState(tab);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'backupbeeDashboard',
      '🐝 BackupBee Dashboard',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    BackupBeeDashboard.currentPanel = new BackupBeeDashboard(
      panel, context, backupManager, sessionTracker
    );
    BackupBeeDashboard.currentPanel._pushState(tab);
  }

  private _pushState(tab?: string) {
    const cfg = vscode.workspace.getConfiguration('backupbee');
    const stats = this.backupManager.getStats();
    const sessionFiles = this.sessionTracker.getCurrentSessionFiles();
    const pastSessions = this.sessionTracker.getPastSessions();

    // Get backups for active file
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const activeBackups = activeFile ? this.backupManager.listBackups(activeFile) : [];
    const activeFileName = activeFile ? path.basename(activeFile) : null;

    this._panel.webview.postMessage({
      type: 'state',
      tab,
      stats,
      sessionFiles,
      pastSessions,
      activeFile: activeFileName,
      activeBackups,
      config: {
        backupEnabled: cfg.get<boolean>('enabled', true),
        sessionEnabled: cfg.get<boolean>('sessionCaptureEnabled', true),
        maxBackups: cfg.get<number>('maxBackupsPerFile', 10),
        notifyOnBackup: cfg.get<boolean>('notifyOnBackup', false),
        backupRoot: this.backupManager.getBackupRoot(),
        sessionDir: this.sessionTracker.getSessionDir(),
        sessionId: this.sessionTracker.getSessionId(),
      },
    });
  }

  private async _handleMessage(msg: any) {
    switch (msg.command) {
      case 'ready':
        this._pushState();
        break;
      case 'toggleBackup':
        await vscode.commands.executeCommand('backupbee.toggleBackup');
        setTimeout(() => this._pushState(), 200);
        break;
      case 'toggleSession':
        await vscode.commands.executeCommand('backupbee.toggleSessionCapture');
        setTimeout(() => this._pushState(), 200);
        break;
      case 'backupNow':
        await vscode.commands.executeCommand('backupbee.backupNow');
        setTimeout(() => this._pushState(), 500);
        break;
      case 'restoreFile':
        await vscode.commands.executeCommand('backupbee.restoreFile');
        break;
      case 'openSessionDir':
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.sessionTracker.getSessionDir()));
        break;
      case 'openBackupRoot':
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this.backupManager.getBackupRoot()));
        break;
      case 'openFile':
        if (msg.filePath && fs.existsSync(msg.filePath)) {
          vscode.window.showTextDocument(vscode.Uri.file(msg.filePath));
        }
        break;
      case 'selectBackupDir':
        await vscode.commands.executeCommand('backupbee.selectBackupDir');
        setTimeout(() => this._pushState(), 500);
        break;
      case 'cleanAll':
        await vscode.commands.executeCommand('backupbee.finalizeAndClean');
        setTimeout(() => this._pushState(), 500);
        break;
      case 'updateSetting':
        await vscode.workspace.getConfiguration('backupbee').update(
          msg.key, msg.value, vscode.ConfigurationTarget.Global
        );
        this.backupManager.refreshConfig();
        setTimeout(() => this._pushState(), 200);
        break;
      case 'refreshData':
        this._pushState();
        break;
    }
  }

  private _getHtml(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>BackupBee Dashboard</title>
<style>
  :root {
    --bee-yellow: #F5C518;
    --bee-amber: #E8A000;
    --bee-dark: #1A1A2E;
    --bee-card: #16213E;
    --bee-surface: #0F3460;
    --bee-accent: #F5C518;
    --bee-green: #00D9A3;
    --bee-red: #FF4757;
    --bee-blue: #54A0FF;
    --bee-text: #E8E8E8;
    --bee-muted: #8A8FA3;
    --bee-border: rgba(245,197,24,0.15);
    --bee-hover: rgba(245,197,24,0.08);
    --radius: 12px;
    --radius-sm: 8px;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bee-dark);
    color: var(--bee-text);
    min-height: 100vh;
    font-size: 13px;
    line-height: 1.5;
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #1A1A2E 0%, #16213E 100%);
    border-bottom: 1px solid var(--bee-border);
    padding: 20px 24px 0;
    position: sticky; top: 0; z-index: 100;
  }
  .header-top { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
  .bee-logo { font-size: 32px; filter: drop-shadow(0 0 12px rgba(245,197,24,0.5)); }
  .header-title h1 { font-size: 20px; font-weight: 700; color: var(--bee-yellow); letter-spacing: -0.3px; }
  .header-title p { font-size: 11px; color: var(--bee-muted); }
  .header-actions { margin-left: auto; display: flex; gap: 8px; }

  /* ── Tabs ── */
  .tabs { display: flex; gap: 2px; }
  .tab {
    padding: 8px 18px;
    border: none; background: none;
    color: var(--bee-muted); cursor: pointer;
    font-size: 12px; font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.2s; white-space: nowrap;
  }
  .tab:hover { color: var(--bee-text); }
  .tab.active { color: var(--bee-yellow); border-bottom-color: var(--bee-yellow); }

  /* ── Layout ── */
  .content { padding: 20px 24px; max-width: 1000px; }

  /* ── Stat Cards ── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px; margin-bottom: 20px;
  }
  .stat-card {
    background: var(--bee-card);
    border: 1px solid var(--bee-border);
    border-radius: var(--radius);
    padding: 16px;
    transition: border-color 0.2s;
  }
  .stat-card:hover { border-color: rgba(245,197,24,0.35); }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--bee-muted); margin-bottom: 6px; }
  .stat-value { font-size: 26px; font-weight: 700; color: var(--bee-yellow); line-height: 1; }
  .stat-sub { font-size: 10px; color: var(--bee-muted); margin-top: 4px; }

  /* ── Toggle Pills ── */
  .toggles-row { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .toggle-pill {
    display: flex; align-items: center; gap: 10px;
    background: var(--bee-card); border: 1px solid var(--bee-border);
    border-radius: 40px; padding: 10px 16px;
    cursor: pointer; transition: all 0.2s; user-select: none;
    flex: 1; min-width: 200px;
  }
  .toggle-pill:hover { border-color: rgba(245,197,24,0.4); }
  .toggle-pill.on { border-color: var(--bee-green); background: rgba(0,217,163,0.06); }
  .toggle-pill .toggle-icon { font-size: 18px; }
  .toggle-pill .toggle-label { flex: 1; }
  .toggle-pill .toggle-label strong { display: block; font-size: 12px; color: var(--bee-text); }
  .toggle-pill .toggle-label span { font-size: 10px; color: var(--bee-muted); }
  .switch {
    width: 36px; height: 20px; border-radius: 20px;
    background: var(--bee-muted); position: relative;
    transition: background 0.2s; flex-shrink: 0;
  }
  .switch.on { background: var(--bee-green); }
  .switch::after {
    content: ''; position: absolute; top: 2px; left: 2px;
    width: 16px; height: 16px; border-radius: 50%;
    background: white; transition: transform 0.2s;
  }
  .switch.on::after { transform: translateX(16px); }

  /* ── Section ── */
  .section { margin-bottom: 20px; }
  .section-header {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px;
  }
  .section-header h2 { font-size: 13px; font-weight: 600; color: var(--bee-text); }
  .section-header .badge {
    background: rgba(245,197,24,0.15); color: var(--bee-yellow);
    font-size: 10px; padding: 2px 7px; border-radius: 20px; font-weight: 600;
  }
  .section-header .ml { margin-left: auto; }

  /* ── File List ── */
  .file-list { display: flex; flex-direction: column; gap: 6px; }
  .file-item {
    background: var(--bee-card); border: 1px solid var(--bee-border);
    border-radius: var(--radius-sm); padding: 12px 14px;
    display: flex; align-items: center; gap: 12px;
    cursor: pointer; transition: all 0.15s;
  }
  .file-item:hover { border-color: rgba(245,197,24,0.4); background: var(--bee-hover); }
  .file-icon { font-size: 16px; flex-shrink: 0; }
  .file-name { font-weight: 600; font-size: 12px; color: var(--bee-text); }
  .file-meta { font-size: 10px; color: var(--bee-muted); margin-top: 2px; }
  .file-path { font-size: 10px; color: var(--bee-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }
  .file-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .lang-tag {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
    padding: 2px 7px; border-radius: 20px;
    background: rgba(84,160,255,0.15); color: var(--bee-blue);
  }
  .size-tag { font-size: 10px; color: var(--bee-muted); }
  .type-tag {
    font-size: 9px; padding: 2px 7px; border-radius: 20px; font-weight: 600;
  }
  .type-auto { background: rgba(0,217,163,0.12); color: var(--bee-green); }
  .type-manual { background: rgba(245,197,24,0.12); color: var(--bee-yellow); }

  /* ── Buttons ── */
  .btn {
    padding: 7px 14px; border-radius: var(--radius-sm);
    border: none; cursor: pointer; font-size: 11px; font-weight: 600;
    transition: all 0.15s; white-space: nowrap;
  }
  .btn-primary { background: var(--bee-yellow); color: #1A1A2E; }
  .btn-primary:hover { background: var(--bee-amber); }
  .btn-ghost { background: transparent; color: var(--bee-muted); border: 1px solid var(--bee-border); }
  .btn-ghost:hover { color: var(--bee-text); border-color: rgba(245,197,24,0.4); }
  .btn-danger { background: rgba(255,71,87,0.15); color: var(--bee-red); border: 1px solid rgba(255,71,87,0.2); }
  .btn-danger:hover { background: rgba(255,71,87,0.25); }
  .btn-sm { padding: 4px 10px; font-size: 10px; }
  .btn-icon { padding: 6px 8px; }

  /* ── Empty State ── */
  .empty {
    background: var(--bee-card); border: 1px dashed var(--bee-border);
    border-radius: var(--radius); padding: 36px 24px;
    text-align: center; color: var(--bee-muted);
  }
  .empty .empty-icon { font-size: 36px; margin-bottom: 10px; }
  .empty h3 { font-size: 14px; color: var(--bee-text); margin-bottom: 6px; }
  .empty p { font-size: 11px; line-height: 1.6; }

  /* ── Session Banner ── */
  .session-banner {
    background: linear-gradient(135deg, rgba(0,217,163,0.1), rgba(84,160,255,0.08));
    border: 1px solid rgba(0,217,163,0.25);
    border-radius: var(--radius); padding: 14px 18px;
    display: flex; align-items: center; gap: 14px; margin-bottom: 20px;
  }
  .session-banner .session-icon { font-size: 24px; }
  .session-banner .session-info { flex: 1; }
  .session-banner h3 { font-size: 13px; font-weight: 600; color: var(--bee-green); }
  .session-banner p { font-size: 11px; color: var(--bee-muted); margin-top: 2px; }
  .session-banner .session-id {
    font-family: monospace; font-size: 10px; color: var(--bee-muted);
    background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;
    margin-top: 4px; display: inline-block;
  }

  /* ── Settings ── */
  .settings-grid { display: flex; flex-direction: column; gap: 10px; }
  .setting-row {
    background: var(--bee-card); border: 1px solid var(--bee-border);
    border-radius: var(--radius-sm); padding: 14px 16px;
    display: flex; align-items: center; gap: 12px;
  }
  .setting-label { flex: 1; }
  .setting-label strong { display: block; font-size: 12px; color: var(--bee-text); margin-bottom: 2px; }
  .setting-label span { font-size: 10px; color: var(--bee-muted); }
  .setting-control input[type="number"] {
    width: 70px; background: var(--bee-dark); border: 1px solid var(--bee-border);
    color: var(--bee-text); border-radius: 6px; padding: 5px 8px; font-size: 12px;
  }
  .path-display {
    font-family: monospace; font-size: 10px; color: var(--bee-muted);
    background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px;
    word-break: break-all; margin-top: 8px;
  }

  /* ── Past Sessions ── */
  .past-session {
    background: var(--bee-card); border: 1px solid var(--bee-border);
    border-radius: var(--radius-sm); padding: 12px 14px;
    display: flex; align-items: center; gap: 12px;
  }
  .past-session-icon { font-size: 14px; }
  .past-session-info { flex: 1; }
  .past-session-id { font-family: monospace; font-size: 11px; color: var(--bee-text); }
  .past-session-meta { font-size: 10px; color: var(--bee-muted); margin-top: 2px; }

  /* ── Active File ── */
  .active-file-card {
    background: linear-gradient(135deg, rgba(245,197,24,0.08), rgba(245,197,24,0.04));
    border: 1px solid rgba(245,197,24,0.3);
    border-radius: var(--radius); padding: 14px 18px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 12px;
  }
  .active-file-card h3 { font-size: 12px; color: var(--bee-yellow); font-weight: 600; }
  .active-file-card p { font-size: 11px; color: var(--bee-muted); margin-top: 2px; }

  .page { display: none; }
  .page.active { display: block; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--bee-border); border-radius: 10px; }

  .divider { height: 1px; background: var(--bee-border); margin: 16px 0; }
  .text-muted { color: var(--bee-muted); font-size: 11px; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .pulse { animation: pulse 2s ease-in-out infinite; }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div class="bee-logo">🐝</div>
    <div class="header-title">
      <h1>BackupBee</h1>
      <p>Version 2.0 · Your files are safe</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-primary btn-sm" onclick="send('backupNow')">⚡ Backup Now</button>
      <button class="btn btn-ghost btn-sm" onclick="send('refreshData')">↺ Refresh</button>
    </div>
  </div>
  <div class="tabs">
    <button class="tab active" data-tab="overview" onclick="switchTab('overview')">🏠 Overview</button>
    <button class="tab" data-tab="session" onclick="switchTab('session')">📂 Session Capture</button>
    <button class="tab" data-tab="backups" onclick="switchTab('backups')">🗄 Backup History</button>
    <button class="tab" data-tab="settings" onclick="switchTab('settings')">⚙️ Settings</button>
  </div>
</div>

<div class="content">

  <!-- ── OVERVIEW ── -->
  <div id="page-overview" class="page active">
    <div class="stats-grid" id="stats-grid"></div>
    <div class="toggles-row" id="toggles-row"></div>
    <div id="overview-extra"></div>
  </div>

  <!-- ── SESSION CAPTURE ── -->
  <div id="page-session" class="page">
    <div class="session-banner">
      <div class="session-icon">📂</div>
      <div class="session-info">
        <h3>Session File Capture</h3>
        <p>Every file you open in VS Code is automatically snapshotted — even if you close it without saving.</p>
        <span class="session-id" id="session-id-label">Loading...</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="send('openSessionDir')">Open Folder ↗</button>
    </div>
    <div class="section">
      <div class="section-header">
        <h2>This Session</h2>
        <span class="badge" id="session-count">0</span>
        <div class="ml"></div>
      </div>
      <div id="session-file-list" class="file-list"></div>
    </div>
    <div class="section">
      <div class="section-header"><h2>Past Sessions</h2></div>
      <div id="past-sessions-list" class="file-list"></div>
    </div>
  </div>

  <!-- ── BACKUP HISTORY ── -->
  <div id="page-backups" class="page">
    <div id="active-file-card"></div>
    <div class="section">
      <div class="section-header">
        <h2>Backups for Active File</h2>
        <div class="ml"></div>
        <button class="btn btn-ghost btn-sm" onclick="send('restoreFile')">⏮ Restore...</button>
      </div>
      <div id="backup-list" class="file-list"></div>
    </div>
  </div>

  <!-- ── SETTINGS ── -->
  <div id="page-settings" class="page">
    <div class="settings-grid" id="settings-grid"></div>
    <div class="divider"></div>
    <div class="section">
      <div class="section-header"><h2>Backup Storage</h2></div>
      <div class="setting-row">
        <div class="setting-label">
          <strong>Backup Root Directory</strong>
          <span>Where all your backup files are stored</span>
          <div class="path-display" id="backup-root-path">—</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="send('selectBackupDir')">Change...</button>
      </div>
      <div class="setting-row" style="margin-top:10px;">
        <div class="setting-label">
          <strong>Session Capture Directory</strong>
          <span>Where opened-file snapshots are stored</span>
          <div class="path-display" id="session-dir-path">—</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="send('openSessionDir')">Open ↗</button>
      </div>
    </div>
    <div class="divider"></div>
    <div class="section">
      <div class="section-header"><h2>Danger Zone</h2></div>
      <div class="setting-row">
        <div class="setting-label">
          <strong>Clean All Backups</strong>
          <span>Permanently delete every backup file. Cannot be undone.</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="send('cleanAll')">🗑 Clean All</button>
      </div>
    </div>
  </div>

</div>

<script>
  const vscode = acquireVsCodeApi();
  let state = {};

  function send(command, extra) {
    vscode.postMessage({ command, ...extra });
  }

  function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + tab));
  }

  function fileIcon(lang) {
    const icons = {
      TypeScript: '🔷', JavaScript: '🟨', Python: '🐍', Rust: '🦀',
      Go: '🐹', Java: '☕', 'C#': '💜', 'C++': '⚙️', C: '⚙️',
      HTML: '🌐', CSS: '🎨', JSON: '📋', Markdown: '📝',
      Shell: '💻', YAML: '📑', XML: '📄', PHP: '🐘',
      Ruby: '💎', Swift: '🍎', Kotlin: '🎯',
    };
    return icons[lang] || '📄';
  }

  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'state') {
      state = msg;
      render(msg);
      if (msg.tab) { switchTab(msg.tab); }
    }
  });

  function render(s) {
    renderStats(s);
    renderToggles(s);
    renderOverviewExtra(s);
    renderSession(s);
    renderBackups(s);
    renderSettings(s);
  }

  function renderStats(s) {
    const st = s.stats || {};
    const sessionCount = (s.sessionFiles || []).length;
    document.getElementById('stats-grid').innerHTML = [
      { label: 'Total Backups', value: st.totalBackups || 0, sub: 'versioned files' },
      { label: 'Session Captured', value: sessionCount, sub: 'files this session' },
      { label: 'Files Tracked', value: st.filesTracked || 0, sub: 'unique sources' },
      { label: 'Storage Used', value: st.totalSizeMB || '0 B', sub: 'backup data' },
    ].map(c => \`
      <div class="stat-card">
        <div class="stat-label">\${c.label}</div>
        <div class="stat-value">\${c.value}</div>
        <div class="stat-sub">\${c.sub}</div>
      </div>
    \`).join('');
  }

  function renderToggles(s) {
    const cfg = s.config || {};
    document.getElementById('toggles-row').innerHTML = \`
      <div class="toggle-pill \${cfg.backupEnabled ? 'on' : ''}" onclick="send('toggleBackup')">
        <span class="toggle-icon">💾</span>
        <div class="toggle-label">
          <strong>Auto-Backup on Save</strong>
          <span>Creates versioned backup every time you save</span>
        </div>
        <div class="switch \${cfg.backupEnabled ? 'on' : ''}"></div>
      </div>
      <div class="toggle-pill \${cfg.sessionEnabled ? 'on' : ''}" onclick="send('toggleSession')">
        <span class="toggle-icon">📂</span>
        <div class="toggle-label">
          <strong>Session File Capture</strong>
          <span>Snapshots every file you open automatically</span>
        </div>
        <div class="switch \${cfg.sessionEnabled ? 'on' : ''}"></div>
      </div>
    \`;
  }

  function renderOverviewExtra(s) {
    const recent = (s.sessionFiles || []).slice(0, 4);
    const recentHtml = recent.length ? recent.map(f => \`
      <div class="file-item" onclick="send('openFile', { filePath: '\${esc(f.originalPath)}' })">
        <span class="file-icon">\${fileIcon(f.language)}</span>
        <div>
          <div class="file-name">\${esc(f.fileName)}</div>
          <div class="file-meta">Captured \${esc(f.capturedAt)} · \${esc(f.size)}</div>
        </div>
        <div class="file-right">
          <span class="lang-tag">\${esc(f.language)}</span>
        </div>
      </div>
    \`).join('') : \`<div class="empty"><div class="empty-icon">📭</div><h3>No files captured yet</h3><p>Open any file in VS Code and it will appear here.</p></div>\`;

    document.getElementById('overview-extra').innerHTML = \`
      <div class="section">
        <div class="section-header">
          <h2>Recently Opened Files</h2>
          <span class="badge">\${(s.sessionFiles||[]).length}</span>
          <div class="ml"></div>
          <button class="btn btn-ghost btn-sm" onclick="switchTab('session')">View All</button>
        </div>
        <div class="file-list">\${recentHtml}</div>
      </div>
    \`;
  }

  function renderSession(s) {
    const files = s.sessionFiles || [];
    const cfg = s.config || {};
    document.getElementById('session-id-label').textContent = 'Session: ' + (cfg.sessionId || '—');
    document.getElementById('session-count').textContent = files.length;

    const listEl = document.getElementById('session-file-list');
    if (files.length === 0) {
      listEl.innerHTML = \`<div class="empty"><div class="empty-icon">📭</div><h3>No files captured this session</h3><p>Open any file in your workspace and BackupBee will save a snapshot automatically. Even if you close it without saving, the original content is preserved here.</p></div>\`;
    } else {
      listEl.innerHTML = files.map(f => \`
        <div class="file-item" onclick="send('openFile', { filePath: '\${esc(f.capturedPath)}' })">
          <span class="file-icon">\${fileIcon(f.language)}</span>
          <div style="flex:1;min-width:0">
            <div class="file-name">\${esc(f.fileName)}</div>
            <div class="file-path">\${esc(f.originalPath)}</div>
            <div class="file-meta">Captured at \${esc(f.capturedAt)}</div>
          </div>
          <div class="file-right">
            <span class="lang-tag">\${esc(f.language)}</span>
            <span class="size-tag">\${esc(f.size)}</span>
          </div>
        </div>
      \`).join('');
    }

    const past = s.pastSessions || [];
    const pastEl = document.getElementById('past-sessions-list');
    if (past.length === 0) {
      pastEl.innerHTML = \`<p class="text-muted">No previous sessions found.</p>\`;
    } else {
      pastEl.innerHTML = past.map(ps => \`
        <div class="past-session">
          <span class="past-session-icon">🗂</span>
          <div class="past-session-info">
            <div class="past-session-id">\${esc(ps.date)}</div>
            <div class="past-session-meta">\${ps.fileCount} file(s) captured</div>
          </div>
        </div>
      \`).join('');
    }
  }

  function renderBackups(s) {
    const activeFile = s.activeFile;
    const backups = s.activeBackups || [];

    const cardEl = document.getElementById('active-file-card');
    if (activeFile) {
      cardEl.innerHTML = \`
        <div class="active-file-card">
          <span style="font-size:22px">📄</span>
          <div>
            <h3>\${esc(activeFile)}</h3>
            <p>\${backups.length} backup(s) available — click a backup to preview, or use Restore to roll back.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="send('backupNow')">⚡ Backup Now</button>
        </div>
      \`;
    } else {
      cardEl.innerHTML = \`<div class="active-file-card"><span style="font-size:22px">💡</span><div><h3>No file open</h3><p>Open a file to see its backup history here.</p></div></div>\`;
    }

    const listEl = document.getElementById('backup-list');
    if (backups.length === 0) {
      listEl.innerHTML = activeFile
        ? \`<div class="empty"><div class="empty-icon">🕐</div><h3>No backups yet</h3><p>Save the file or click "Backup Now" to create your first backup.</p></div>\`
        : \`<div class="empty"><div class="empty-icon">📄</div><h3>Open a file first</h3><p>Navigate to any file to see its version history.</p></div>\`;
    } else {
      listEl.innerHTML = backups.map((b, i) => \`
        <div class="file-item" onclick="send('openFile', { filePath: '\${esc(b.backupPath)}' })">
          <span class="file-icon">\${i === 0 ? '⭐' : '🗄'}</span>
          <div style="flex:1">
            <div class="file-name">\${esc(b.timestamp)}\${i === 0 ? ' <span style="color:var(--bee-green);font-size:9px;font-weight:600;">LATEST</span>' : ''}</div>
            <div class="file-meta">\${esc(b.size)}</div>
          </div>
          <div class="file-right">
            <span class="type-tag \${b.type === 'manual' ? 'type-manual' : 'type-auto'}">\${b.type === 'manual' ? '🖐 Manual' : '💾 Auto'}</span>
          </div>
        </div>
      \`).join('');
    }
  }

  function renderSettings(s) {
    const cfg = s.config || {};
    document.getElementById('backup-root-path').textContent = cfg.backupRoot || '(not set)';
    document.getElementById('session-dir-path').textContent = cfg.sessionDir || '(not set)';

    document.getElementById('settings-grid').innerHTML = \`
      <div class="setting-row">
        <div class="setting-label">
          <strong>Max Backups per File</strong>
          <span>Older backups are pruned automatically to save space.</span>
        </div>
        <div class="setting-control">
          <input type="number" min="1" max="50" value="\${cfg.maxBackups || 10}"
            onchange="send('updateSetting', { key: 'maxBackupsPerFile', value: parseInt(this.value) })" />
        </div>
      </div>
      <div class="setting-row">
        <div class="setting-label">
          <strong>Notify on Each Backup</strong>
          <span>Show a toast notification every time a backup is created (can be noisy).</span>
        </div>
        <div class="switch \${cfg.notifyOnBackup ? 'on' : ''}" style="cursor:pointer"
          onclick="send('updateSetting', { key: 'notifyOnBackup', value: \${!cfg.notifyOnBackup} })"></div>
      </div>
    \`;
  }

  function esc(str) {
    if (!str) { return ''; }
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Tell extension we're ready
  send('ready');
</script>
</body>
</html>`;
  }

  dispose() {
    BackupBeeDashboard.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}
