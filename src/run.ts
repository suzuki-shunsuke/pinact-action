import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as commit from "@suzuki-shunsuke/commit-ts";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import * as securefix from "@csm-actions/securefix-action";
import * as aqua from "@aquaproj/aqua-installer";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token info list for revocation
const appTokenInfoList: { token: string; expiresAt: string }[] = [];

export const main = async () => {
  try {
    await run();
  } finally {
    await revokeTokens();
  }
};

const revokeTokens = async () => {
  for (const info of appTokenInfoList) {
    try {
      if (githubAppToken.hasExpired(info.expiresAt)) {
        core.info("GitHub App token has already expired");
        continue;
      }
      core.info("Revoking GitHub App token");
      await githubAppToken.revoke(info.token);
    } catch (error) {
      core.warning(`Failed to revoke token: ${error}`);
    }
  }
};

type Args = {
  update: boolean;
  verify: boolean;
  review: boolean;
  minAge: string;
  includes: string[];
  excludes: string[];
};

type RunContext = {
  pinactToken: string;
  pinactInstalled: boolean;
  reviewdogInstalled: boolean;
  files: string[];
  flags: Args;
};

const hasWorkflowFiles = (files: string[]): boolean => {
  // Handle both forward and backslashes for cross-platform compatibility
  return files.some((f) => /^\.github[/\\]workflows[/\\]/.test(f));
};

const run = async () => {
  const ctx = await setup();
  if (!ctx) {
    return;
  }

  const skipPush = core.getBooleanInput("skip_push");
  if (skipPush) {
    await runSkipPushMode(ctx);
  } else {
    await runAutoCommitMode(ctx);
  }
};

const setup = async (): Promise<RunContext | null> => {
  const aquaConfig = path.join(__dirname, "..", "aqua", "aqua.yaml");

  // Get owner for token
  const owner = github.context.repo.owner;

  // Get token for pinact run (contents:read, no repository restriction)
  const pinactToken = await getToken(owner, { contents: "read" });

  // Check if pinact is already installed
  const pinactInstalled = await isPinactInstalled(pinactToken);
  if (!pinactInstalled) {
    // Install aqua if not installed
    const aquaInstalled = await isAquaInstalled();
    if (!aquaInstalled) {
      await aqua.action({
        githubToken: pinactToken,
        version: "v2.56.0",
        enableAquaInstall: false,
      });
    }

    // Set AQUA_GLOBAL_CONFIG
    const currentGlobalConfig = process.env.AQUA_GLOBAL_CONFIG || "";
    process.env.AQUA_GLOBAL_CONFIG = currentGlobalConfig
      ? `${currentGlobalConfig}:${aquaConfig}`
      : aquaConfig;
  }

  // Show pinact version
  await execPinact(pinactInstalled, ["-v"], {
    env: { ...process.env, GITHUB_TOKEN: pinactToken },
  });

  // Get target files
  const files = await getTargetFiles();
  if (files.length === 0) {
    core.notice("No target files found");
    return null;
  }

  const flags: Args = {
    update: core.getBooleanInput("update"),
    verify: core.getBooleanInput("verify"),
    review: core.getBooleanInput("review"),
    minAge: core.getInput("min_age"),
    includes: core
      .getInput("includes")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#")),
    excludes: core
      .getInput("excludes")
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#")),
  };

  // Check if reviewdog is installed when review is enabled
  let reviewdogInstalled = false;
  if (flags.review) {
    reviewdogInstalled = await isReviewdogInstalled();
  }

  return { pinactToken, pinactInstalled, reviewdogInstalled, files, flags };
};

const runSkipPushMode = async (ctx: RunContext): Promise<void> => {
  const { pinactToken, pinactInstalled, files, flags } = ctx;

  const args = ["run", "--diff"];
  if (flags.review) {
    args.push("--format", "sarif");
  } else {
    args.push("--check");
  }
  setFlags(args, flags);

  if (flags.review) {
    await runPinactWithReviewdog(ctx, args);
  } else {
    const result = await execPinact(pinactInstalled, args.concat(files), {
      ignoreReturnCode: true,
      env: { ...process.env, GITHUB_TOKEN: pinactToken },
    });
    if (result !== 0) {
      throw new Error("GitHub Actions aren't pinned.");
    }
  }
};

const runAutoCommitMode = async (ctx: RunContext): Promise<void> => {
  const { pinactToken, pinactInstalled, files, flags } = ctx;

  // Always use --fix in auto commit mode, use sarif format when review is enabled
  const args = ["run", "--check", "--diff", "--fix"];
  if (flags.review) {
    args.push("--format", "sarif");
  }
  setFlags(args, flags);

  // Run pinact (capture output if review is enabled for later reviewdog use)
  let pinactOutput: exec.ExecOutput | null = null;
  let pinactFailed = false;

  if (flags.review) {
    pinactOutput = await getExecOutputPinact(
      pinactInstalled,
      args.concat(files),
      {
        ignoreReturnCode: true,
        env: { ...process.env, GITHUB_TOKEN: pinactToken },
      },
    );
    if (pinactOutput.exitCode !== 0) {
      core.error("pinact run failed");
      pinactFailed = true;
    }
  } else {
    const result = await execPinact(pinactInstalled, args.concat(files), {
      ignoreReturnCode: true,
      env: { ...process.env, GITHUB_TOKEN: pinactToken },
    });
    if (result !== 0) {
      core.error("pinact run failed");
      pinactFailed = true;
    }
  }

  // Check if files have changed
  const changed = await hasChanges(files);

  if (changed) {
    // Files changed → commit and push, don't run reviewdog
    core.error(
      "GitHub Actions aren't pinned. A commit is pushed automatically to pin GitHub Actions.",
    );
    await createCommit(files);
    if (pinactFailed) {
      throw new Error("pinact run failed");
    }
    return;
  }

  // No changes
  core.notice("No changes");

  // Run reviewdog only when no changes and review is enabled
  if (flags.review && pinactOutput) {
    await runReviewdog(ctx, pinactOutput.stdout);
  }

  if (pinactFailed) {
    throw new Error("pinact run failed");
  }
};

const runPinactWithReviewdog = async (
  ctx: RunContext,
  args: string[],
): Promise<void> => {
  const { pinactToken, pinactInstalled, files } = ctx;

  const pinactResult = await getExecOutputPinact(
    pinactInstalled,
    args.concat(files),
    {
      ignoreReturnCode: true,
      env: { ...process.env, GITHUB_TOKEN: pinactToken },
    },
  );

  await runReviewdog(ctx, pinactResult.stdout);
};

const runReviewdog = async (
  ctx: RunContext,
  pinactStdout: string,
): Promise<void> => {
  const { reviewdogInstalled } = ctx;

  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const reviewToken =
    core.getInput("github_token_for_review") ||
    (await getToken(owner, { pull_requests: "write", contents: "read" }, [
      repo,
    ]));

  const reviewdogEnv = {
    ...process.env,
    REVIEWDOG_GITHUB_API_TOKEN: reviewToken,
  };
  const reviewdogResult = await execReviewdog(
    reviewdogInstalled,
    buildReviewdogArgs(),
    { input: Buffer.from(pinactStdout), env: reviewdogEnv },
  );
  if (reviewdogResult !== 0) {
    throw new Error("reviewdog failed");
  }
};

const createCommit = async (files: string[]): Promise<void> => {
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const branch =
    process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "";

  if (!branch) {
    throw new Error("Could not determine branch");
  }

  const securefixServerRepository = core.getInput(
    "securefix_server_repository",
  );
  const securefixAppID = core.getInput("securefix_app_id");
  const securefixAppPrivateKey = core.getInput("securefix_app_private_key");
  const commitMessage = `chore(pinact): pin GitHub Actions`;
  if (securefixServerRepository) {
    if (!securefixAppID || !securefixAppPrivateKey) {
      throw new Error(
        "securefix_app_id and securefix_app_private_key are required when securefix_server_repository is set",
      );
    }

    core.info(
      `Creating commit by Securefix Action: ${JSON.stringify({
        owner,
        repo,
        branch,
        message: "chore(pinact): pin GitHub Actions",
        files,
      })}`,
    );

    await securefix.request({
      appId: securefixAppID,
      privateKey: securefixAppPrivateKey,
      serverRepository: securefixServerRepository,
      files: new Set(files),
      commitMessage: commitMessage,
      workspace: process.env.GITHUB_WORKSPACE ?? "",
    });
    return;
  }

  // Determine permissions based on files
  const permissions: githubAppToken.Permissions = { contents: "write" };
  if (hasWorkflowFiles(files)) {
    permissions.workflows = "write";
  }

  // Get push token
  const pushToken =
    core.getInput("github_token_for_push") ||
    (await getToken(owner, permissions, [repo]));

  const octokit = github.getOctokit(pushToken);

  core.info(
    `Creating commit: ${JSON.stringify({
      owner,
      repo,
      branch,
      message: "chore(pinact): pin GitHub Actions",
      files,
    })}`,
  );

  await commit.createCommit(octokit, {
    owner,
    repo,
    branch,
    message: "chore(pinact): pin GitHub Actions",
    files,
    deleteIfNotExist: true,
    logger: { info: core.info },
  });
};

const setFlags = (args: string[], flags: Args) => {
  if (flags.update) {
    args.push("--update");
  }
  if (flags.verify) {
    args.push("--verify");
  }
  // Note: --review is not added here; reviewdog is used instead when flags.review is true
  if (flags.minAge) {
    args.push("--min-age", flags.minAge);
  }
  for (const include of flags.includes) {
    args.push("--include", include);
  }
  for (const exclude of flags.excludes) {
    args.push("--exclude", exclude);
  }
};

const buildReviewdogArgs = (): string[] => {
  const args = [
    "-f",
    "sarif",
    "-name",
    "pinact",
    "-reporter",
    "github-pr-review",
  ];
  const filterMode = core.getInput("reviewdog_filter_mode");
  const failLevel = core.getInput("reviewdog_fail_level");
  const level = core.getInput("reviewdog_level");
  if (filterMode) {
    args.push("-filter-mode", filterMode);
  }
  if (failLevel) {
    args.push("-fail-level", failLevel);
  }
  if (level) {
    args.push("-level", level);
  }
  return args;
};

const isPinactInstalled = async (token: string): Promise<boolean> => {
  try {
    await exec.getExecOutput("pinact", ["-v"], {
      silent: true,
      env: { ...process.env, GITHUB_TOKEN: token },
    });
    return true;
  } catch {
    return false;
  }
};

const isAquaInstalled = async (): Promise<boolean> => {
  try {
    await exec.getExecOutput("aqua", ["-v"], { silent: true });
    return true;
  } catch {
    return false;
  }
};

const execPinact = async (
  pinactInstalled: boolean,
  args: string[],
  options?: exec.ExecOptions,
): Promise<number> => {
  if (pinactInstalled) {
    return exec.exec("pinact", args, options);
  }
  return exec.exec("aqua", ["exec", "--", "pinact", ...args], options);
};

const isReviewdogInstalled = async (): Promise<boolean> => {
  try {
    await exec.getExecOutput("reviewdog", ["-version"], { silent: true });
    return true;
  } catch {
    return false;
  }
};

const getExecOutputPinact = async (
  pinactInstalled: boolean,
  args: string[],
  options?: exec.ExecOptions,
): Promise<exec.ExecOutput> => {
  if (pinactInstalled) {
    return exec.getExecOutput("pinact", args, options);
  }
  return exec.getExecOutput("aqua", ["exec", "--", "pinact", ...args], options);
};

const execReviewdog = async (
  reviewdogInstalled: boolean,
  args: string[],
  options?: exec.ExecOptions,
): Promise<number> => {
  if (reviewdogInstalled) {
    return exec.exec("reviewdog", args, options);
  }
  return exec.exec("aqua", ["exec", "--", "reviewdog", ...args], options);
};

const getTargetFiles = async (): Promise<string[]> => {
  const files: string[] = [];

  // Get workflow files in .github/workflows
  const workflowDir = path.join(".github", "workflows");
  const workflowResult = await exec.getExecOutput(
    "git",
    ["ls-files", workflowDir],
    { silent: true },
  );
  for (const line of workflowResult.stdout.split("\n")) {
    const f = line.trim();
    if (!f) continue;
    const basename = path.basename(f);
    if (basename.endsWith(".yml") || basename.endsWith(".yaml")) {
      files.push(f);
    }
  }

  // Get action.yaml or action.yml files
  const allResult = await exec.getExecOutput("git", ["ls-files"], {
    silent: true,
  });
  for (const line of allResult.stdout.split("\n")) {
    const f = line.trim();
    if (!f) continue;
    const basename = path.basename(f);
    if (basename === "action.yaml" || basename === "action.yml") {
      files.push(f);
    }
  }

  return files;
};

const hasChanges = async (files: string[]): Promise<boolean> => {
  const result = await exec.getExecOutput(
    "git",
    ["diff", "--quiet", ...files],
    {
      ignoreReturnCode: true,
    },
  );
  return result.exitCode !== 0;
};

const getToken = async (
  owner: string,
  permissions: githubAppToken.Permissions,
  repositories?: string[],
): Promise<string> => {
  const token = core.getInput("github_token");
  if (token) {
    return token;
  }
  const appId = core.getInput("app_id");
  const appPrivateKey = core.getInput("app_private_key");
  if (appId) {
    if (!appPrivateKey) {
      throw new Error("app_private_key is required when app_id is provided");
    }
    core.info(
      `Creating GitHub App token: ${JSON.stringify({
        owner,
        repositories,
        permissions,
      })}`,
    );
    const options: {
      appId: string;
      privateKey: string;
      owner: string;
      permissions: githubAppToken.Permissions;
      repositories?: string[];
    } = {
      appId,
      privateKey: appPrivateKey,
      owner,
      permissions,
    };
    if (repositories) {
      options.repositories = repositories;
    }
    const appToken = await githubAppToken.create(options);
    // Save token info for revocation in finally block
    appTokenInfoList.push({
      token: appToken.token,
      expiresAt: appToken.expiresAt,
    });
    return appToken.token;
  }
  if (appPrivateKey) {
    throw new Error("app_id is required when app_private_key is provided");
  }
  const defaultToken = core.getInput("default_github_token");
  if (defaultToken) {
    return defaultToken;
  }
  throw new Error(
    "github_token, app_id/app_private_key, or default_github_token is required",
  );
};
