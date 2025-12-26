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

const run = async () => {
  const aquaConfig = path.join(__dirname, "..", "aqua", "aqua.yaml");

  // Get owner/repo for token
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;

  // Get token for pinact (to access GitHub API)
  const token = await getToken(owner, repo, { contents: "write" });

  // TODO use different tokens
  // - Install aqua and pinact (no permissions needed)
  // - pinact run (contents:read for actions)
  // - create commit (contents:write for the current repo)

  const env = { ...process.env, GITHUB_TOKEN: token };

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

  if (skipPush) {
    // TODO support pinact run options
    // --verify
    // --update
    // --review
    // --min-age
    // --include
    // --exclude
    const result = await execPinact(
      pinactInstalled,
      ["run", "--diff", "--check", ...files],
      { ignoreReturnCode: true, env },
    );
    if (result !== 0) {
      core.setFailed("GitHub Actions aren't pinned.");
    }
    return;
  }

  // auto-commit mode: run pinact and commit changes
  // TODO support pinact run options
  // --verify
  // --update
  // --review
  // --diff
  // --min-age
  // --include
  // --exclude
  let pinactFailed = false;
  const pinactResult = await execPinact(pinactInstalled, ["run", ...files], {
    ignoreReturnCode: true,
    env,
  });
  if (pinactResult !== 0) {
    core.error("pinact run failed");
    pinactFailed = true;
  }

  // Check if files have changed
  const changed = await hasChanges(files);
  if (!changed) {
    core.notice("No changes");
    if (pinactFailed) {
      core.setFailed("pinact run failed");
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
    core.setFailed("Could not determine branch");
    return;
  }

  const octokit = github.getOctokit(token);

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
    core.setFailed("pinact run failed");
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
    ["diff", "--exit-code", ...files],
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
