# BackupBee Changelog

## [2.0.0] — 2026-05-20

### 🆕 New Features
- **Session File Capture**: Every file you open in VS Code is instantly snapshotted to a session folder — even if you close it without saving. Never lose context on important files again.
- **Beautiful Dashboard**: Rich webview dashboard with real-time stats, file lists, session history, backup history, and settings — all in one place.
- **Restore from Dashboard**: Browse all backup versions of the current file and restore with one click.
- **Backup History View**: See all backup versions of the active file with timestamps, types (auto/manual), and sizes.
- **Past Sessions**: View files captured across previous VS Code sessions.
- **Smart Dedup**: Auto-backups are skipped when file content hasn't changed (hash-based comparison).
- **Status Bar**: Live status bar item showing backup count and session capture count with a rich tooltip.
- **Manual Backup Shortcut**: `Ctrl+Shift+B` / `Cmd+Shift+B` to instantly back up the current file.
- **Dashboard Shortcut**: `Ctrl+Shift+Alt+B` / `Cmd+Shift+Alt+B` to open the dashboard.
- **Configurable max backups**: Now defaults to 10 (was 7). Set any value from 1–50.
- **Notify on backup**: Optional toast notification per backup (off by default).
- **Language detection**: Files are tagged with their language in the dashboard UI.

### 🎨 UI/UX Improvements
- Dark, premium dashboard design with bee yellow accent colors
- Toggle switches for backup and session capture directly in dashboard
- Real-time refresh every 10 seconds when dashboard is open
- File icons per language
- Smooth transitions and hover states

### 🔧 Changed
- Backup folder name format updated (safer cross-platform path encoding)
- Backup file naming now includes type: `filename_2026-05-20T12-00-00_auto.ts`
- Extension activates on startup (`onStartupFinished`) to capture files immediately

## [1.0.0]

- Initial release
- Auto-backup on save
- Configurable backup root
- Backup toggle
- Clean up command
- 7 backups per file retention
