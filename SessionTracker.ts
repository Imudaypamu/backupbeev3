import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BackupManager } from './BackupManager';

export interface SessionFile {
  originalPath: string;
  capturedPath: string;
  capturedAt: string;
  fileName: string;
  size: string;
  language: string;
}

export class SessionTracker {
  private context: vscode.ExtensionContext;
  private backupManager: BackupManager;
  private sessionFiles: Map<string, SessionFile> = new Map();
  private sessionId: string;
  private sessionDir: string = '';

  constructor(context: vscode.ExtensionContext, backupManager: BackupManager) {
    this.context = context;
    this.backupManager = backupManager;
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    this.refreshSessionDir();
    this.loadSessionHistory();
  }

  refreshSessionDir() {
    const cfg = vscode.workspace.getConfiguration('backupbee');
    const customSession = cfg.get<string>('sessionCaptureDir', '');
    if (customSession && fs.existsSync(path.dirname(customSession))) {
      this.sessionDir = path.join(customSession, this.sessionId);
    } else {
      const backupRoot = this.backupManager.getBackupRoot();
      this.sessionDir = path.join(path.dirname(backupRoot), '_bee_session', this.sessionId);
    }
    fs.mkdirSync(this.sessionDir, { recursive: true });
  }

  getSessionDir(): string { return this.sessionDir; }
  getSessionId(): string { return this.sessionId; }

  private loadSessionHistory() {
    const saved = this.context.globalState.get<SessionFile[]>(`session_${this.sessionId}`, []);
    saved.forEach(f => this.sessionFiles.set(f.originalPath, f));
  }

  private saveSessionHistory() {
    this.context.globalState.update(
      `session_${this.sessionId}`,
      Array.from(this.sessionFiles.values())
    );
  }

  async captureFile(filePath: string): Promise<boolean> {
    // Don't double-capture
    if (this.sessionFiles.has(filePath)) { return false; }
    if (!fs.existsSync(filePath)) { return false; }

    try {
      const ext = path.extname(filePath);
      const base = path.basename(filePath, ext);
      const safeName = filePath
        .replace(/[:\\/]/g, '_')
        .replace(/^_+/, '')
        .slice(-60);
      const subDir = path.join(this.sessionDir, safeName);
      fs.mkdirSync(subDir, { recursive: true });

      const capturedFileName = `${base}_opened${ext}`;
      const capturedPath = path.join(subDir, capturedFileName);
      fs.copyFileSync(filePath, capturedPath);

      const stat = fs.statSync(filePath);
      const sizeStr = stat.size < 1024
        ? `${stat.size} B`
        : stat.size < 1024 * 1024
        ? `${(stat.size / 1024).toFixed(1)} KB`
        : `${(stat.size / 1024 / 1024).toFixed(2)} MB`;

      // Detect language from extension
      const langMap: Record<string, string> = {
        '.ts': 'TypeScript', '.js': 'JavaScript', '.py': 'Python',
        '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.cs': 'C#',
        '.cpp': 'C++', '.c': 'C', '.html': 'HTML', '.css': 'CSS',
        '.json': 'JSON', '.md': 'Markdown', '.sh': 'Shell',
        '.yml': 'YAML', '.yaml': 'YAML', '.xml': 'XML',
        '.php': 'PHP', '.rb': 'Ruby', '.swift': 'Swift', '.kt': 'Kotlin',
      };
      const language = langMap[ext.toLowerCase()] || ext.slice(1).toUpperCase() || 'Text';

      const entry: SessionFile = {
        originalPath: filePath,
        capturedPath,
        capturedAt: new Date().toLocaleString(),
        fileName: path.basename(filePath),
        size: sizeStr,
        language,
      };
      this.sessionFiles.set(filePath, entry);
      this.saveSessionHistory();
      return true;
    } catch (err) {
      console.error('BackupBee session capture error:', err);
      return false;
    }
  }

  getCurrentSessionFiles(): SessionFile[] {
    return Array.from(this.sessionFiles.values())
      .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  }

  getSessionCount(): number { return this.sessionFiles.size; }

  getPastSessions(): Array<{ id: string; dir: string; fileCount: number; date: string }> {
    const sessionRoot = path.dirname(this.sessionDir);
    if (!fs.existsSync(sessionRoot)) { return []; }
    try {
      return fs.readdirSync(sessionRoot)
        .filter(d => d !== this.sessionId)
        .map(d => {
          const fullDir = path.join(sessionRoot, d);
          let fileCount = 0;
          try {
            const walk = (dir: string) => {
              fs.readdirSync(dir).forEach(f => {
                const full = path.join(dir, f);
                if (fs.statSync(full).isDirectory()) { walk(full); }
                else { fileCount++; }
              });
            };
            walk(fullDir);
          } catch {}
          return { id: d, dir: fullDir, fileCount, date: d.replace(/-/g, ':').replace('T', ' ') };
        })
        .sort((a, b) => b.id.localeCompare(a.id))
        .slice(0, 20);
    } catch { return []; }
  }
}
