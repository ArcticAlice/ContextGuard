const vscode = require('vscode');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const apiBase = 'http://localhost:3000/api';
let lastSignature = '';

async function branchFor(folder) { try { const { stdout } = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: folder.uri.fsPath }); return stdout.trim() || 'detached HEAD'; } catch { return 'no Git branch'; } }
async function refreshFocus(showMessage = false) {
  const editor = vscode.window.activeTextEditor; const folder = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!editor || !folder || editor.document.uri.scheme !== 'file') { if (showMessage) vscode.window.showWarningMessage('ContextGuard needs an active file inside an open workspace.'); return; }
  const relativeFile = vscode.workspace.asRelativePath(editor.document.uri, false); const branch = await branchFor(folder); const signature = `${folder.uri.fsPath}|${relativeFile}|${branch}`;
  if (signature === lastSignature && !showMessage) return;
  lastSignature = signature;
  const focus = `VS Code workspace: ${folder.name}. Active file: ${relativeFile}. Git branch: ${branch}.`;
  try { const response = await fetch(`${apiBase}/focus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ focus, source: 'vscode', activate: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (showMessage) vscode.window.showInformationMessage(`ContextGuard focus updated: ${data.statement}`); } catch (error) { if (showMessage) vscode.window.showErrorMessage(`ContextGuard could not update focus: ${error.message}`); }
}
function activate(context) {
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => refreshFocus()));
  context.subscriptions.push(vscode.commands.registerCommand('contextguard.refreshFocus', () => refreshFocus(true)));
  for (const folder of vscode.workspace.workspaceFolders || []) { const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '.git/HEAD')); watcher.onDidChange(() => refreshFocus()); watcher.onDidCreate(() => refreshFocus()); context.subscriptions.push(watcher); }
  refreshFocus();
}
function deactivate() {}
module.exports = { activate, deactivate };
