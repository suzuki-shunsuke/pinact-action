import * as core from "@actions/core";
import { KMSClient } from "@aws-sdk/client-kms";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { credentials } from "@suzuki-shunsuke/actions-aws-oidc";
import { createJwt } from "@suzuki-shunsuke/github-app-jwt-aws-kms";

/**
 * Builds a KMS client.
 *
 * When aws_role_to_assume is set, the IAM role is assumed here with the GitHub
 * OIDC token, and the resulting credentials never leave this process. Later
 * steps of the job can't see them, unlike credentials that
 * aws-actions/configure-aws-credentials exports as environment variables or
 * writes to ~/.aws/credentials.
 *
 * Undefined leaves the client to @suzuki-shunsuke/github-app-jwt-aws-kms, which
 * builds one from the key ARN's region and the standard AWS credential chain,
 * so aws-actions/configure-aws-credentials works as well.
 */
const newKMSClient = (prefix: string): KMSClient | undefined => {
  const roleArn = input(prefix, "aws_role_to_assume");
  if (!roleArn) {
    return undefined;
  }
  core.info(`assuming an AWS IAM role with the GitHub OIDC token: ${roleArn}`);
  return new KMSClient({
    region: input(prefix, "aws_region") || undefined,
    credentials: credentials({ roleArn }),
  });
};

/**
 * Reads an AWS input for one app, falling back to the unprefixed one.
 *
 * Each app's key can have its own IAM role, so that a role only signs with the
 * key it belongs to. Sharing one role across both apps, or one region, is
 * simply a matter of setting the unprefixed input alone.
 */
const input = (prefix: string, name: string): string =>
  core.getInput(`${prefix}${name}`) || core.getInput(name);

/**
 * Reads the app id from the inputs, which is empty when no app is configured.
 *
 * This action takes two apps, so the input names are prefixed: "" for app_id,
 * "securefix_" for securefix_app_id.
 *
 * Either client_id or app_id identifies an app. @octokit/auth-app passes the
 * value straight through as the JSON Web Token issuer, and GitHub accepts both,
 * recommending the Client ID.
 */
export const getAppId = (prefix = ""): string =>
  core.getInput(`${prefix}client_id`) || core.getInput(`${prefix}app_id`);

/**
 * Builds an Octokit client authenticated as a GitHub App.
 *
 * When the KMS key input is set, the private key never leaves AWS KMS and only
 * the JSON Web Token signing is delegated to it. Otherwise the private key
 * input is used.
 */
export const newAppOctokit = (prefix = ""): Octokit => {
  const appId = getAppId(prefix);
  if (!appId) {
    throw new Error(`${prefix}client_id or ${prefix}app_id is required`);
  }
  const kmsKeyId = core.getInput(`${prefix}aws_kms_key_id`);
  if (kmsKeyId) {
    core.info(`signing GitHub App JSON Web Tokens with AWS KMS: ${kmsKeyId}`);
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        createJwt: createJwt({
          keyId: kmsKeyId,
          region: input(prefix, "aws_region") || undefined,
          client: newKMSClient(prefix),
        }),
      },
    });
  }
  const privateKey = core.getInput(`${prefix}app_private_key`);
  if (!privateKey) {
    throw new Error(
      `${prefix}app_private_key or ${prefix}aws_kms_key_id is required when ${prefix}client_id or ${prefix}app_id is provided`,
    );
  }
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey },
  });
};
