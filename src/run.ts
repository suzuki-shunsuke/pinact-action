import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import * as commit from "@suzuki-shunsuke/commit-ts";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import * as aqua_installer from "@aquaproj/aqua-installer";
import * as path from "node:path";

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

  // Check if pinact is already installed
  const pinactInstalled = await isPinactInstalled();
  if (!pinactInstalled) {
    // Install aqua if not installed
    const aquaInstalled = await isAquaInstalled();
    if (!aquaInstalled) {
      await aqua_installer.install();
    }

    // Set AQUA_GLOBAL_CONFIG
    const currentGlobalConfig = process.env.AQUA_GLOBAL_CONFIG || "";
    process.env.AQUA_GLOBAL_CONFIG = currentGlobalConfig
      ? `${currentGlobalConfig}:${aquaConfig}`
      : aquaConfig;
  }

  // Show pinact version
  await execPinact(pinactInstalled, ["-v"]);

  // Get target files
  const files = await getTargetFiles();
  if (files.length === 0) {
    core.notice("No target files found");
    return;
  }

  const skipPush = core.getBooleanInput("skip_push");

  if (skipPush) {
    // skip_push mode: run pinact with --check
    const result = await execPinact(
      pinactInstalled,
      ["run", "--diff", "--check", ...files],
      { ignoreReturnCode: true },
    );
    if (result !== 0) {
      core.setFailed("GitHub Actions aren't pinned.");
    }
    return;
  }

  // auto-commit mode: run pinact and commit changes
  let pinactFailed = false;
  const pinactResult = await execPinact(
    pinactInstalled,
    ["run", ...files],
    { ignoreReturnCode: true },
  );
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
  const owner = github.context.repo.owner;
  const repo = github.context.repo.repo;
  const branch =
    process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "";

  if (!branch) {
    core.setFailed("Could not determine branch");
    return;
  }

  const token = await getToken(owner, repo, { contents: "write" });
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

const isPinactInstalled = async (): Promise<boolean> => {
  try {
    await exec.getExecOutput("pinact", ["-v"], { silent: true });
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
  const workflowResult = await exec.getExecOutput("git", [
    "ls-files",
    workflowDir,
  ]);
  for (const line of workflowResult.stdout.split("\n")) {
    const f = line.trim();
    if (!f) continue;
    const basename = path.basename(f);
    if (basename.endsWith(".yml") || basename.endsWith(".yaml")) {
      files.push(f);
    }
  }

  // Get action.yaml or action.yml files
  const allResult = await exec.getExecOutput("git", ["ls-files"]);
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
  throw new Error("github_token or app_id/app_private_key is required");
};
