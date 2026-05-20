import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BackupManager } from './BackupManager';
import { SessionTracker } from './SessionTracker';
import { BackupBeeDashboard } from './panels/BackupBeeDashboard';
import { BeeStatusBar } from './BeeStatusBar';

let backupManager: BackupManager;
let sessionTracker: SessionTracker;
let statusBar: BeeStatusBar;

export function activate(context: vscode.ExtensionContext) {
  console.log('🐝 BackupBee v2.0 activated!');

  backupManager = new BackupManager(context);
  sessionTracker = new SessionTracker(context, backupManager);
  statusBar = new BeeStatusBar(context, backupManager, sessionTracker);

  // ─── Commands ──────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('backupbee.toggleBackup', () => {
      const cfg = vscode.workspace.getConfiguration('backupbee');
      const current = cfg.get<boolean>('enabled', true);
      cfg.update('enabled', !current, vscode.ConfigurationTarget.Global);
      const msg = !current ? '🐝 BackupBee: Auto-backup ENABLED' : '🐝 BackupBee: Auto-backup DISABLED';
      vscode.window.showInformationMessage(msg);
      statusBar.refresh();
    }),

    vscode.commands.registerCommand('backupbee.toggleSessionCapture', () => {
      const cfg = vscode.workspace.getConfiguration('backupbee');
      const current = cfg.get<boolean>('sessionCaptureEnabled', true);
      cfg.update('sessionCaptureEnabled', !current, vscode.ConfigurationTarget.Global);
      const msg = !current
        ? '🐝 BackupBee: Session Capture ENABLED — opened files will be auto-saved!'
        : '🐝 BackupBee: Session Capture DISABLED';
      vscode.window.showInformationMessage(msg);
      statusBar.refresh();
    }),

    vscode.commands.registerCommand('backupbee.selectBackupDir', async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Set as BackupBee Root',
      });
      if (selected && selected.length > 0) {
        const dir = selected[0].fsPath;
        await vscode.workspace.getConfiguration('backupbee').update(
          'backupRootDir', dir, vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`🐝 BackupBee: Backup root set to:\n${dir}`);
        backupManager.refreshConfig();
        statusBar.refresh();
      }
    }),

    vscode.commands.registerCommand('backupbee.openDashboard', () => {
      BackupBeeDashboard.createOrShow(context, backupManager, sessionTracker);
    }),

    vscode.commands.registerCommand('backupbee.finalizeAndClean', async () => {
      const answer = await vscode.window.showWarningMessage(
        '🐝 BackupBee: Delete ALL backup files? This cannot be undone.',
        { modal: true },
        'Yes, Clean Up',
        'Cancel'
      );
      if (answer === 'Yes, Clean Up') {
        const count = await backupManager.cleanAll();
        vscode.window.showInformationMessage(`🐝 BackupBee: Cleaned up ${count} backup file(s).`);
        statusBar.refresh();
      }
    }),

    vscode.commands.registerCommand('backupbee.backupNow', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('🐝 BackupBee: No active file to back up.');
        return;
      }
      const backed = await backupManager.backupFile(editor.document.uri.fsPath, 'manual');
      if (backed) {
        vscode.window.showInformationMessage(`🐝 BackupBee: Manual backup created for ${path.basename(editor.document.uri.fsPath)}`);
        statusBar.refresh();
      }
    }),

    vscode.commands.registerCommand('backupbee.restoreFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('🐝 BackupBee: No active file to restore.');
        return;
      }
      const filePath = editor.document.uri.fsPath;
      const backups = backupManager.listBackups(filePath);
      if (backups.length === 0) {
        vscode.window.showInformationMessage('🐝 BackupBee: No backups found for this file.');
        return;
      }
      const picks = backups.map(b => ({
        label: `$(history) ${b.timestamp}`,
        description: `${b.type === 'manual' ? '🖐 Manual' : '💾 Auto'} · ${b.size}`,
        detail: b.backupPath,
        backup: b,
      }));
      const chosen = await vscode.window.showQuickPick(picks, {
        placeHolder: `Restore ${path.basename(filePath)} from backup`,
        title: '🐝 BackupBee — Choose a restore point',
      });
      if (chosen) {
        const confirm = await vscode.window.showWarningMessage(
          `Restore from ${chosen.backup.timestamp}? Current file will be overwritten.`,
          { modal: true }, 'Restore', 'Cancel'
        );
        if (confirm === 'Restore') {
          await backupManager.restoreFromBackup(filePath, chosen.backup.backupPath);
          vscode.window.showInformationMessage(`🐝 BackupBee: File restored from ${chosen.backup.timestamp}`);
        }
      }
    }),

    vscode.commands.registerCommand('backupbee.viewSessionFiles', () => {
      BackupBeeDashboard.createOrShow(context, backupManager, sessionTracker, 'session');
    }),
  );

  // ─── Event Listeners ───────────────────────────────────────────────
  // Auto-backup on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const cfg = vscode.workspace.getConfiguration('backupbee');
      if (!cfg.get<boolean>('enabled', true)) { return; }
      if (backupManager.isExcluded(doc.uri.fsPath)) { return; }
      await backupManager.backupFile(doc.uri.fsPath, 'auto');
      statusBar.refresh();
      if (cfg.get<boolean>('notifyOnBackup', false)) {
        vscode.window.showInformationMessage(`🐝 Backup created: ${path.basename(doc.uri.fsPath)}`);
      }
    })
  );

  // Session capture: when a file is OPENED, snapshot it immediately
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      const cfg = vscode.workspace.getConfiguration('backupbee');
      if (!cfg.get<boolean>('sessionCaptureEnabled', true)) { return; }
      if (doc.uri.scheme !== 'file') { return; }
      if (backupManager.isExcluded(doc.uri.fsPath)) { return; }
      await sessionTracker.captureFile(doc.uri.fsPath);
      statusBar.refresh();
    })
  );

  // Track active editor changes for status bar
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => statusBar.refresh())
  );

  // Capture already-open docs on activation
  setTimeout(() => {
    const cfg = vscode.workspace.getConfiguration('backupbee');
    if (cfg.get<boolean>('sessionCaptureEnabled', true)) {
      vscode.workspace.textDocuments.forEach(async (doc) => {
        if (doc.uri.scheme === 'file' && !backupManager.isExcluded(doc.uri.fsPath)) {
          await sessionTracker.captureFile(doc.uri.fsPath);
        }
      });
      statusBar.refresh();
    }
  }, 1000);

  statusBar.refresh();
}

export function deactivate() {
  statusBar?.dispose();
}
