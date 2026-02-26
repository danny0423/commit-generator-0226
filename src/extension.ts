import * as vscode from 'vscode';
import { spawn } from 'child_process';

// ── Commit Type 清單 ──────────────────────────────────────
const COMMIT_TYPES: vscode.QuickPickItem[] = [
  { label: 'feat',     description: '✨ 新功能' },
  { label: 'fix',      description: '🐛 修復 bug' },
  { label: 'refactor', description: '♻️  重構（不影響功能）' },
  { label: 'perf',     description: '⚡ 效能優化' },
  { label: 'docs',     description: '📝 文件變更' },
  { label: 'style',    description: '💄 格式調整（不影響邏輯）' },
  { label: 'test',     description: '✅ 新增或修改測試' },
  { label: 'chore',    description: '🔧 建構流程或輔助工具' },
  { label: 'ci',       description: '👷 CI/CD 相關變更' },
  { label: 'revert',   description: '⏪ 還原先前的 commit' },
];

// ── 組合 commit message ───────────────────────────────────
function buildCommitMessage(
  type: string,
  scope: string,
  message: string,
  issue: string
): string {
  const scopePart = scope.trim() ? `${scope.trim()}: ` : '';
  const header = `${type}:${scopePart}${message.trim()}`;
  const footer = issue.trim() ? `Resolves: #${issue.trim()}` : '';
  return footer ? `${header}\n${footer}` : header;
}

// ── 執行 git commit ───────────────────────────────────────
async function runGitCommit(message: string): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    throw new Error('找不到工作區資料夾');
  }
  const cwd = workspaceFolders[0].uri.fsPath;

  return new Promise((resolve, reject) => {
    const git = spawn('git', ['commit', '-F', '-'], { cwd });

    let stdout = '';
    let stderr = '';

    git.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    git.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    git.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout));
      }
    });

    git.stdin.write(message);
    git.stdin.end();
  });
}

// ── 主要指令流程 ──────────────────────────────────────────
async function smartCommit(): Promise<void> {

  // Step 1：選擇 commit type
  const selectedType = await vscode.window.showQuickPick(COMMIT_TYPES, {
    placeHolder: '選擇 commit 類型',
    title: 'Git Commit Helper — Step 1/4：Type',
    matchOnDescription: true,
  });
  if (!selectedType) { return; }

  // Step 2：輸入 scope（模組名稱，可略過）
  const scope = await vscode.window.showInputBox({
    placeHolder: '例如：udiScan　（直接按 Enter 可略過）',
    title: 'Git Commit Helper — Step 2/4：Scope（選填）',
    prompt: '輸入影響範圍，例如模組或檔案名稱',
  });
  if (scope === undefined) { return; }

  // Step 3：輸入 commit message
  const message = await vscode.window.showInputBox({
    placeHolder: '例如：migrate to TypeScript and align with ESLint rules',
    title: 'Git Commit Helper — Step 3/4：Message',
    prompt: '輸入本次變更描述',
    validateInput: (value) => {
      if (!value.trim()) { return 'Message 不能為空'; }
      if (value.length > 100) { return `訊息過長（${value.length}/100）`; }
      return null;
    },
  });
  if (!message) { return; }

  // Step 4：輸入 issue 序號（可略過）
  const issue = await vscode.window.showInputBox({
    placeHolder: '例如：303　（直接按 Enter 可略過）',
    title: 'Git Commit Helper — Step 4/4：Issue（選填）',
    prompt: '輸入 issue 序號，會自動加上 Resolves: #',
    validateInput: (value) => {
      if (value && !/^\d+$/.test(value.trim())) {
        return '請只輸入數字，例如：303';
      }
      return null;
    },
  });
  if (issue === undefined) { return; }

  // ── 組合並預覽 ────────────────────────────────────────
  const finalMessage = buildCommitMessage(selectedType.label, scope, message, issue);

  const confirmed = await vscode.window.showInformationMessage(
    `預覽 commit message：\n\n${finalMessage}`,
    { modal: true },
    '確認送出',
    '取消'
  );
  if (confirmed !== '確認送出') { return; }

  // ── 執行 git commit ───────────────────────────────────
  try {
    const output = await runGitCommit(finalMessage);
    vscode.window.showInformationMessage(`✅ Commit 成功！\n${output.split('\n')[0]}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (errorMsg.includes('nothing to commit')) {
      vscode.window.showWarningMessage('⚠️ 沒有已 staged 的變更，請先執行 git add');
    } else {
      vscode.window.showErrorMessage(`❌ Commit 失敗：${errorMsg}`);
    }
  }
}

// ── Extension 進入點 ──────────────────────────────────────
export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('git-commit-helper.commit', smartCommit);
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}