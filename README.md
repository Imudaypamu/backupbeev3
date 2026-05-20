# 🐝 BackupBee v2.0

**BackupBee** is a powerful VS Code extension that protects your work with automatic versioned backups AND captures every file you open — so you never lose an important file again, even if you close it without saving.

---

## ✨ What's New in v2.0

### 📂 Session File Capture *(the big one)*

> **"I'm opening too many files and accidentally closing important ones."**

BackupBee now automatically saves a snapshot of **every file you open** into a session folder (`_bee_session/<session-id>/`). The moment you open a file, its current contents are preserved — regardless of whether you save, edit, or close it.

- Each VS Code session gets its own folder
- Past sessions are browsable in the Dashboard
- You can open any captured file directly from the Dashboard

### 🖥 Beautiful Dashboard

Open the Dashboard via:
- Command Palette → `BackupBee: Open Dashboard`  
- Keyboard: `Ctrl+Shift+Alt+B` / `Cmd+Shift+Alt+B`  
- Status bar click

The Dashboard has four tabs:
| Tab | What you see |
|-----|---|
| **Overview** | Stats, quick toggles, recently opened files |
| **Session Capture** | All files opened this session + past sessions |
| **Backup History** | All backup versions of the currently active file |
| **Settings** | Toggle features, configure paths, clean up |

---

## 🚀 Features

| Feature | Description |
|---------|-------------|
| **Auto-Backup on Save** | Versioned copy created every time you save a file |
| **Session File Capture** | Snapshot every opened file automatically |
| **Smart Dedup** | Skips backup if file content hasn't changed |
| **Restore from UI** | Browse and restore any backup version |
| **Configurable Backup Dir** | Store backups anywhere — project root or custom path |
| **Per-File Folders** | Each source file gets its own backup subfolder |
| **Backup Retention** | Keep N latest backups (default: 10) |
| **Status Bar** | Live count of backups and captured files |
| **Manual Backup** | `Ctrl+Shift+B` to back up the active file right now |

---

## 📋 Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `BackupBee: Open Dashboard` | `Ctrl+Shift+Alt+B` | Open the visual dashboard |
| `BackupBee: Backup Current File Now` | `Ctrl+Shift+B` | Instantly back up active file |
| `BackupBee: Restore File from Backup` | — | Pick a restore point for active file |
| `BackupBee: Toggle Auto-Backup On/Off` | — | Enable/disable save-triggered backups |
| `BackupBee: Toggle Session File Capture On/Off` | — | Enable/disable open-file capture |
| `BackupBee: Set Backup Root Directory` | — | Choose where backups are stored |
| `BackupBee: View Session Captured Files` | — | Jump to session tab in Dashboard |
| `BackupBee: Finalize & Clean All Backups` | — | Delete all backup files |

---

## ⚙️ Configuration

```jsonc
{
  // Enable versioned backup on file save
  "backupbee.enabled": true,

  // Automatically snapshot every file you open
  "backupbee.sessionCaptureEnabled": true,

  // Custom backup root directory (leave empty to use workspace root)
  "backupbee.backupRootDir": "",

  // Custom session capture directory
  "backupbee.sessionCaptureDir": "",

  // How many backup versions to keep per file
  "backupbee.maxBackupsPerFile": 10,

  // Glob patterns to exclude from backup
  "backupbee.excludePatterns": [
    "**/node_modules/**",
    "**/.git/**",
    "**/.bee_backups/**",
    "**/_bee_session/**"
  ],

  // Show BackupBee in the status bar
  "backupbee.showStatusBar": true,

  // Show a toast notification for each backup created
  "backupbee.notifyOnBackup": false
}
```

---

## 📁 Folder Structure

```
your-workspace/
├── .bee_backups/           ← versioned backups
│   └── src_index_ts/
│       ├── index_2026-05-20T10-30-00_auto.ts
│       ├── index_2026-05-20T11-00-00_manual.ts
│       └── index_2026-05-20T12-00-00_auto.ts
│
└── _bee_session/           ← session captures
    └── 2026-05-20T09-00/   ← each session gets its own folder
        ├── src_index_ts/
        │   └── index_opened.ts
        └── src_utils_ts/
            └── utils_opened.ts
```

---

## 🔧 Development

```bash
git clone https://github.com/Imudaypamu/backupbee2.git
cd backupbee2
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

---

## 📦 Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/) by searching **BackupBee**.

---

## 📄 License

GPL-3.0 — see [LICENSE](./LICENSE)
