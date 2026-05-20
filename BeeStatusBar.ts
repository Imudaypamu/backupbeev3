import * as vscode from 'vscode';
import * as path from 'path';
import { BackupManager } from './BackupManager';
import { SessionTracker } from './SessionTracker';

export class BeeStatusBar {
  private statusItem: vscode.StatusBarItem;
  private context: vscode.ExtensionContext;
  private backupManager: BackupManager;
  private sessionTracker: SessionTracker;

  constructor(
    context: vscode.ExtensionContext,
    backupManager: BackupManager,
    sessionTracker: SessionTracker
  ) {
    this.context = context;
    this.backupManager = backupManager;
    this.sessionTracker = sessionTracker;

    this.statusItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusItem.command = 'backupbee.openDashboard';
    context.subscriptions.push(this.statusItem);
    this.refresh();
  }

  refresh() {
    const cfg = vscode.workspace.getConfiguration('backupbee');
    if (!cfg.get<boolean>('showStatusBar', true)) {
      this.statusItem.hide();
      return;
    }

    const backupEnabled = cfg.get<boolean>('enabled', true);
    const sessionEnabled = cfg.get<boolean>('sessionCaptureEnabled', true);
    const stats = this.backupManager.getStats();
    const sessionCount = this.sessionTracker.getSessionCount();

    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const hasBackups = activeFile ? this.backupManager.listBackups(activeFile).length > 0 : false;

    let icon = '🐝';
    if (!backupEnabled && !sessionEnabled) { icon = '🐝💤'; }

    const parts: string[] = [];
    if (backupEnabled) { parts.push(`${stats.totalBackups} backups`); }
    if (sessionEnabled) { parts.push(`📂 ${sessionCount} captured`); }

    this.statusItem.text = `${icon} ${parts.join('  ')}`;
    this.statusItem.tooltip = [
      `BackupBee v2.0`,
      `────────────────────`,
      `Auto-backup: ${backupEnabled ? '✅ ON' : '❌ OFF'}`,
      `Session capture: ${sessionEnabled ? '✅ ON' : '❌ OFF'}`,
      `Total backups: ${stats.totalBackups}`,
      `Files tracked: ${stats.filesTracked}`,
      `Total size: ${stats.totalSizeMB}`,
      `Session files: ${sessionCount}`,
      `────────────────────`,
      `Click to open Dashboard`,
    ].join('\n');

    if (!backupEnabled && !sessionEnabled) {
      this.statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.statusItem.backgroundColor = undefined;
    }

    this.statusItem.show();
  }

  dispose() { this.statusItem.dispose(); }
}
