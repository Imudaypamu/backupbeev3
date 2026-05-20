import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface BackupEntry {
  backupPath: string;
  originalPath: string;
  timestamp: string;
  type: 'auto' | 'manual' | 'session';
  size: string;
  hash: string;
}

export interface BackupStats {
  totalBackups: number;
  totalSizeMB: string;
  filesTracked: number;
  lastBackupTime: string;
}

export class BackupManager {
  private backupRoot: string = '';
  private context: vscode.ExtensionContext;
  private excludePatterns: string[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.refreshConfig();
  }

  refreshConfig() {
    const cfg = vscode.workspace.getConfiguration('backupbee');
    const customRoot = cfg.get<string>('backupRootDir', '');
    if (customRoot && fs.existsSync(customRoot)) {
      this.backupRoot = path.join(customRoot, '.bee_backups');
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        this.backupRoot = path.join(workspaceFolders[0].uri.fsPath, '.bee_backups');
      } else {
        const home = process.env.HOME || process.env.USERPROFILE || '.';
        this.backupRoot = path.join(home, '.bee_backups');
      }
    }
    this.excludePatterns = cfg.get<string[]>('excludePatterns', [
      '**/node_modules/**', '**/.git/**', '**/.bee_backups/**', '**/_bee_session/**'
    ]);
    fs.mkdirSync(this.backupRoot, { recursive: true });
  }

  getBackupRoot(): string { return this.backupRoot; }

  isExcluded(filePath: string): boolean {
    const normalised = filePath.replace(/\\/g, '/');
    return this.excludePatterns.some(pattern => {
      const simplified = pattern.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\//g, '');
      return normalised.includes(simplified.length > 0 ? simplified : 'NEVER_MATCH');
    });
  }

  private getFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    } catch { return 'unknown'; }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) { return `${bytes} B`; }
    if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  private getBackupDirForFile(filePath: string): string {
    // Create a safe folder name from the full path
    const safeName = filePath
      .replace(/[:\\/]/g, '_')
      .replace(/^_+/, '')
      .slice(-80); // limit length
    return path.join(this.backupRoot, safeName);
  }

  async backupFile(filePath: string, type: 'auto' | 'manual'): Promise<boolean> {
    if (!fs.existsSync(filePath)) { return false; }
    const currentHash = this.getFileHash(filePath);
    const backups = this.listBackups(filePath);

    // Skip if content unchanged (avoid duplicate backups on same content)
    if (type === 'auto' && backups.length > 0 && backups[0].hash === currentHash) {
      return false;
    }

    const dir = this.getBackupDirForFile(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const backupFileName = `${base}_${ts}_${type}${ext}`;
    const backupPath = path.join(dir, backupFileName);

    fs.copyFileSync(filePath, backupPath);

    // Prune old backups
    const cfg = vscode.workspace.getConfiguration('backupbee');
    const maxKeep = cfg.get<number>('maxBackupsPerFile', 10);
    this.pruneBackups(filePath, maxKeep);

    // Persist metadata
    this.saveBackupMeta(filePath, {
      backupPath,
      originalPath: filePath,
      timestamp: now.toLocaleString(),
      type,
      size: this.formatSize(fs.statSync(backupPath).size),
      hash: currentHash,
    });

    return true;
  }

  private saveBackupMeta(originalPath: string, entry: BackupEntry) {
    const metaKey = `meta_${Buffer.from(originalPath).toString('base64').slice(0, 40)}`;
    const existing: BackupEntry[] = this.context.globalState.get<BackupEntry[]>(metaKey, []);
    existing.unshift(entry);
    this.context.globalState.update(metaKey, existing.slice(0, 50));
  }

  listBackups(filePath: string): BackupEntry[] {
    const dir = this.getBackupDirForFile(filePath);
    if (!fs.existsSync(dir)) { return []; }
    return fs.readdirSync(dir)
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const fullPath = path.join(dir, f);
        const stat = fs.statSync(fullPath);
        // Parse timestamp and type from filename
        const match = f.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})_(auto|manual)/);
        const tsRaw = match ? match[1].replace(/T/, ' ').replace(/-/g, ':').replace(/(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : '';
        const ts = tsRaw ? new Date(tsRaw).toLocaleString() : stat.mtime.toLocaleString();
        const type = match ? (match[2] as 'auto' | 'manual') : 'auto';
        return {
          backupPath: fullPath,
          originalPath: filePath,
          timestamp: ts || stat.mtime.toLocaleString(),
          type,
          size: this.formatSize(stat.size),
          hash: 'unknown',
        } as BackupEntry;
      })
      .sort((a, b) => {
        const sa = fs.statSync(a.backupPath).mtime.getTime();
        const sb = fs.statSync(b.backupPath).mtime.getTime();
        return sb - sa;
      });
  }

  private pruneBackups(filePath: string, maxKeep: number) {
    const dir = this.getBackupDirForFile(filePath);
    if (!fs.existsSync(dir)) { return; }
    const files = fs.readdirSync(dir)
      .map(f => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(maxKeep).forEach(f => {
      try { fs.unlinkSync(f.path); } catch {}
    });
  }

  async restoreFromBackup(originalPath: string, backupPath: string): Promise<void> {
    // First create a "pre-restore" backup of current state
    await this.backupFile(originalPath, 'manual');
    fs.copyFileSync(backupPath, originalPath);
    // Reload the document in editor
    const doc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === originalPath);
    if (doc) {
      await vscode.commands.executeCommand('workbench.action.files.revert');
    }
  }

  async cleanAll(): Promise<number> {
    let count = 0;
    if (!fs.existsSync(this.backupRoot)) { return 0; }
    const cleanDir = (dir: string) => {
      fs.readdirSync(dir).forEach(f => {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
          cleanDir(full);
          try { fs.rmdirSync(full); } catch {}
        } else {
          fs.unlinkSync(full);
          count++;
        }
      });
    };
    cleanDir(this.backupRoot);
    return count;
  }

  getStats(): BackupStats {
    let totalBackups = 0;
    let totalBytes = 0;
    const trackedFiles = new Set<string>();

    if (fs.existsSync(this.backupRoot)) {
      const walk = (dir: string, depth = 0) => {
        if (depth > 5) { return; }
        try {
          fs.readdirSync(dir).forEach(f => {
            const full = path.join(dir, f);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
              trackedFiles.add(full);
              walk(full, depth + 1);
            } else {
              totalBackups++;
              totalBytes += stat.size;
            }
          });
        } catch {}
      };
      walk(this.backupRoot);
    }

    return {
      totalBackups,
      totalSizeMB: this.formatSize(totalBytes),
      filesTracked: trackedFiles.size,
      lastBackupTime: totalBackups > 0 ? new Date().toLocaleString() : 'Never',
    };
  }
}
