/**
 * Git 操作模块
 * 收集分支 commit 历史和 diff 信息
 */
import { execSync } from 'child_process';
import { PROJECT_ROOT } from './config';

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
}

export interface BranchInfo {
  name: string;
  slug: string;
  commits: CommitInfo[];
  diffStat: string;
  changedFiles: string[];
  /** 核心文件的详细 diff */
  detailedDiffs: Array<{ file: string; diff: string }>;
  /** 最新 commit 完整 hash */
  latestCommitHash: string;
}

function exec(cmd: string, cwd = PROJECT_ROOT): string {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
  } catch {
    return '';
  }
}

/** 分支名 → 文件名安全 slug */
export function branchToSlug(branch: string): string {
  return branch
    .replace(/\//g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** 获取当前分支名 */
export function getCurrentBranch(cwd = PROJECT_ROOT): string {
  return exec('git rev-parse --abbrev-ref HEAD', cwd);
}

/** 获取主分支名（main 或 master） */
function getMainBranch(cwd = PROJECT_ROOT): string {
  const main = exec('git rev-parse --verify main 2>/dev/null', cwd);
  if (main) return 'main';
  const master = exec('git rev-parse --verify master 2>/dev/null', cwd);
  if (master) return 'master';
  return 'main'; // fallback
}

/** 获取最新 commit 完整 hash */
export function getLatestCommitHash(cwd = PROJECT_ROOT): string {
  return exec('git rev-parse HEAD', cwd);
}

/**
 * 收集分支信息
 * @param branch 分支名
 * @param sinceCommit 增量模式：只取此 commit 之后的
 * @param cwd 仓库路径
 */
export function collectBranchInfo(
  branch: string,
  sinceCommit?: string,
  cwd = PROJECT_ROOT
): BranchInfo {
  const slug = branchToSlug(branch);
  const mainBranch = getMainBranch(cwd);

  // 1. commit 历史
  let logCmd: string;
  if (sinceCommit) {
    logCmd = `git log ${sinceCommit}..HEAD --format="%H|%ad|%s" --date=short`;
  } else {
    logCmd = `git log ${mainBranch}..HEAD --format="%H|%ad|%s" --date=short`;
    // 如果没有与主分支的差异（可能就在主分支上），取最近 30 条
    const result = exec(logCmd, cwd);
    if (!result) {
      logCmd = 'git log --format="%H|%ad|%s" --date=short -30';
    }
  }

  const logOutput = exec(logCmd, cwd);
  const commits: CommitInfo[] = logOutput
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [hash, date, ...msgParts] = line.split('|');
      return { hash, date, message: msgParts.join('|') };
    });

  // 2. 与主分支的差异文件列表
  const nameStatus = exec(`git diff ${mainBranch} --name-status`, cwd) ||
                     exec('git diff HEAD~10 --name-status', cwd);
  const changedFiles = nameStatus
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const parts = line.split('\t');
      return parts[parts.length - 1]; // 文件路径
    });

  // 3. 改动统计
  const diffStat = exec(`git diff ${mainBranch} --stat`, cwd) ||
                   exec('git diff HEAD~10 --stat', cwd);

  // 4. 核心文件的详细 diff（取改动最多的前 8 个文件）
  const diffNumstat = exec(`git diff ${mainBranch} --numstat`, cwd) ||
                      exec('git diff HEAD~10 --numstat', cwd);
  const fileChanges = diffNumstat
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [add, del, file] = line.split('\t');
      return { file, changes: (parseInt(add) || 0) + (parseInt(del) || 0) };
    })
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 8);

  const detailedDiffs = fileChanges.map(({ file }) => {
    const diff = exec(`git diff ${mainBranch} -- "${file}"`, cwd) ||
                 exec(`git diff HEAD~10 -- "${file}"`, cwd);
    return { file, diff: diff.slice(0, 8000) }; // 每个文件 diff 限制 8000 字符
  });

  const latestCommitHash = getLatestCommitHash(cwd);

  return {
    name: branch,
    slug,
    commits,
    diffStat,
    changedFiles,
    detailedDiffs,
    latestCommitHash,
  };
}

/**
 * 检查自 lastCommit 以来是否有新 commit
 */
export function hasNewCommits(lastCommit: string, cwd = PROJECT_ROOT): boolean {
  const currentHead = getLatestCommitHash(cwd);
  return currentHead !== lastCommit;
}

/**
 * 读取文件当前内容（用于代码引用）
 */
export function readFileContent(filePath: string, cwd = PROJECT_ROOT): string {
  return exec(`cat "${filePath}" 2>/dev/null | head -200`, cwd);
}
