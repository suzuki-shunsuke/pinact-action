import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as commit from "@suzuki-shunsuke/commit-ts";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import * as aqua from "@aquaproj/aqua-installer";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token info for revocation
let appTokenInfo: { token: string; expiresAt: string } | null = null;

export const main = async () => {
  try {
    await run();
  } finally {
    await revokeToken();
  }
};

const revokeToken = async () => {
  if (!appTokenInfo) {
    return;
  }
  if (githubAppToken.hasExpired(appTokenInfo.expiresAt)) {
    core.info("GitHub App token has already expired");
    return;
  }
  core.info("Revoking GitHub App token");
  await githubAppToken.revoke(appTokenInfo.token);
};

type Args = {
  update: boolean;
  verify: boolean;
  review: boolean;
  minAge: string;
  includes: string[];
  excludes: string[];
};

const run = async () => {
  const aquaConfig = path.join(__dirname, "..", "aqua", "aqua.yaml");

  // Get owner/repo for token
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  // Get token for pinact (to access GitHub API)
  const token = await getToken(owner, repo, {
    contents: "write",
    workflows: "write",
  });

  // TODO use different tokens
  // - Install aqua and pinact (no permissions needed)
  // - pinact run (contents:read for actions)
  // - create commit (contents:write for the current repo)

  // Check if pinact is already installed
  const pinactInstalled = await isPinactInstalled(token);
  if (!pinactInstalled) {
    // Install aqua if not installed
    const aquaInstalled = await isAquaInstalled();
    if (!aquaInstalled) {
      await aqua.action({
        githubToken: token,
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

  const env = { ...process.env, GITHUB_TOKEN: token };

  // Show pinact version
  await execPinact(pinactInstalled, ["-v"], {
    env,
  });

  // Get target files
  const files = await getTargetFiles();
  if (files.length === 0) {
    core.notice("No target files found");
    return;
  }

  const skipPush = core.getBooleanInput("skip_push");

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

  if (skipPush) {
    const args = ["run", "--diff"];
    if (flags.review) {
      args.push("--format", "sarif");
    } else {
      args.push("--check");
    }
    setFlags(args, flags);

    if (flags.review) {
      // Run pinact and pipe to reviewdog
      const pinactResult = await getExecOutputPinact(
        pinactInstalled,
        args.concat(files),
        {
          ignoreReturnCode: true,
          env,
        },
      );
      const reviewdogEnv = { ...process.env, REVIEWDOG_GITHUB_API_TOKEN: token };
      const reviewdogResult = await execReviewdog(
        reviewdogInstalled,
        ["-f", "sarif", "-name", "pinact", "-reporter", "github-pr-review"],
        { input: Buffer.from(pinactResult.stdout), env: reviewdogEnv },
      );
      if (reviewdogResult !== 0) {
        throw new Error("reviewdog failed");
      }
    } else {
      // Existing behavior
      const result = await execPinact(pinactInstalled, args.concat(files), {
        ignoreReturnCode: true,
        env,
      });
      if (result !== 0) {
        throw new Error("GitHub Actions aren't pinned.");
      }
    }
    return;
  }

  // auto-commit mode: run pinact and commit changes
  let pinactFailed = false;
  const args = ["run", "--diff", "--fix"];
  if (flags.review) {
    args.push("--format", "sarif");
  }
  setFlags(args, flags);

  if (flags.review) {
    // Run pinact and pipe to reviewdog
    const pinactResult = await getExecOutputPinact(
      pinactInstalled,
      args.concat(files),
      {
        ignoreReturnCode: true,
        env,
      },
    );
    if (pinactResult.exitCode !== 0) {
      core.error("pinact run failed");
      pinactFailed = true;
    }
    const reviewdogEnv = { ...process.env, REVIEWDOG_GITHUB_API_TOKEN: token };
    const reviewdogResult = await execReviewdog(
      reviewdogInstalled,
      ["-f", "sarif", "-name", "pinact", "-reporter", "github-pr-review"],
      { input: Buffer.from(pinactResult.stdout), env: reviewdogEnv },
    );
    if (reviewdogResult !== 0) {
      throw new Error("reviewdog failed");
    }
    // reviewdog success: pinactFailed is ignored per requirements
  } else {
    // Existing behavior
    const pinactResult = await execPinact(pinactInstalled, args.concat(files), {
      ignoreReturnCode: true,
      env,
    });
    if (pinactResult !== 0) {
      core.error("pinact run failed");
      pinactFailed = true;
    }
  }

  // Check if files have changed
  const changed = await hasChanges(files);
  if (!changed) {
    core.notice("No changes");
    if (pinactFailed) {
      throw new Error("pinact run failed");
    }
    return;
  }

  core.error(
    "GitHub Actions aren't pinned. A commit is pushed automatically to pin GitHub Actions.",
  );

  // Create commit
  const branch =
    process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "";

  if (!branch) {
    throw new Error("Could not determine branch");
  }

  const octokit = github.getOctokit(
    core.getInput("github_token_for_push") || token,
  );

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

  if (pinactFailed) {
    throw new Error("pinact run failed");
  }
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
  repo: string,
  permissions: githubAppToken.Permissions,
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
        repositories: [repo],
        permissions,
      })}`,
    );
    const appToken = await githubAppToken.create({
      appId,
      privateKey: appPrivateKey,
      owner,
      repositories: [repo],
      permissions,
    });
    // Save token info for revocation in finally block
    appTokenInfo = {
      token: appToken.token,
      expiresAt: appToken.expiresAt,
    };
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
