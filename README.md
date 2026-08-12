# pinact-action

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/suzuki-shunsuke/pinact-action)
[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/suzuki-shunsuke/pinact-action/main/LICENSE) | [action.yaml](action.yaml)

pinact-action is a GitHub Actions to pin GitHub Actions and reusable workflows by [pinact](https://github.com/suzuki-shunsuke/pinact).
By default this action discovers `.github/workflows/*.{yml,yaml}` and `(*/){0,3}action.{yml,yaml}` (pinact's built-in scan) and pushes a commit to a remote branch. To target a wider or different set of files, configure them in `.pinact.yaml` and point the action at it with `config:`.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/dd301d04-152c-49ac-bdf3-dbf8293b376f)

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/bcc1de57-0893-4536-b4bb-db2c9ed34231)

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/fc3ba9c1-561e-4bfe-8c73-5874bbcae69c)

## GitHub Access Token

You can use the following things:

- :thumbsup: GitHub App Installation access token: We recommend this
- :thumbsdown: GitHub Personal Access Token: This can't create verified commits
- :thumbsdown: `${{secrets.GITHUB_TOKEN}}`
  - This can't update workflows.
  - This can't trigger new workflow runs.

https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow

> When you use the repository's GITHUB_TOKEN to perform tasks, events triggered by the GITHUB_TOKEN, with the exception of workflow_dispatch and repository_dispatch, will not create a new workflow run.

### Required permissions

`contents:write` is required.
Furthermore, if you want to fix workflow files, `workflows:write` is also required.
If private actions are used, the permission `contents:read` to access those repositories are also required.
If `review` is enabled, `pull_requests:write` is also required.

## How To Use

```yaml
name: Pinact
on:
  pull_request: {}
jobs:
  pinact:
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout
        uses: actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8 # v6.0.1
        with:
          persist-credentials: false

      - name: Pin actions
        uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
        with:
          app_id: ${{vars.APP_ID}}
          app_private_key: ${{secrets.APP_PRIVATE_KEY}}
```

### Use PAT

```yaml
uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
with:
  github_token: ${{secrets.BOT_GITHUB_TOKEN}}
```

### Using different GitHub Token for creating commits

```yaml
uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
with:
  # For pinact run (contents:read for all actions is required)
  github_token: ${{secrets.BOT_GITHUB_TOKEN}}
  # For creating commits (contents:write for the current repository is required)
  github_token_for_push: ${{secrets.BOT_GITHUB_TOKEN_FOR_PUSH}}
```

### skip_push

If you don't want this action to create a commit, set `skip_push: "true"`.

By default (`fix: "true"`), pinact fixes the workflow files in the workspace but no commit is created, so you can hand the changes off to a later step (for example, a unified commit step shared with other autofix tools — see [#1002](https://github.com/suzuki-shunsuke/pinact-action/issues/1002)):

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    skip_push: "true"
# ...later in the same job, your own commit/push step
```

If you want validation only (fail the CI when actions aren't pinned, never modify files), set `fix: "false"`. This implies `skip_push: "true"` (nothing was modified, so nothing to commit) so you don't need to set both:

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    fix: "false"
```

> [!WARNING]
> The default behavior of `skip_push: "true"` changed: previously it was validate-only, now it modifies files. If you relied on the old check-only behavior, add `fix: "false"`.

`skip_push: "true"` mode does not run any `git` command, so `actions/checkout` is not required when the workflow files are made available some other way (for example, a webhook payload combined with `diff_file:` and `no_api:`). The default (auto-commit) mode still needs `actions/checkout` because pinact's edits are committed via `git diff` against the workspace.

### Reviewdog

See also https://github.com/reviewdog/reviewdog

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    review: "true"
    github_token: ${{secrets.BOT_GITHUB_TOKEN}}
    # Optional
    reviewdog_fail_level: none # The default is "error"
    reviewdog_filter_mode: nofilter # The default is "added"
```

`reviewdog_fail_level` governs the violations pinact reports, but it doesn't cover pinact failing on its own.
If pinact stops with a GitHub API error or an internal error, the review is incomplete, so the step fails even when reviewdog reports nothing.

You can also use the different access token for review:
`contents:read` and `pull_requests:write` permissions are required.

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    review: "true"
    github_token: ${{secrets.BOT_GITHUB_TOKEN}}
    github_token_for_review: ${{secrets.BOT_GITHUB_TOKEN_FOR_REVIEW}}
```

### Securefix Action

pinact-action >= v1.3.0 [#854](https://github.com/suzuki-shunsuke/pinact-action/pull/854)

As of v1.3.0, pinact-action can create commits via [Securefix Action](https://github.com/csm-actions/securefix-action) securely.
About Securefix Action, please see the document of Securefix Action.

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    securefix_app_id: ${{vars.SECUREFIX_ACTION_CLIENT_APP_ID}}
    securefix_app_private_key: ${{secrets.SECUREFIX_ACTION_CLIENT_APP_PRIVATE_KEY}}
    securefix_server_repository: securefix-server
```

### pinact options

These options are optional and map to the corresponding `pinact run` flags.

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    skip_push: "true"
    fix: "false" # pinact run --fix (default "true")
    no_api: "true" # pinact run --no-api
    update: "true"
    verify: "true"
    verify_min_age: "true" # pinact run --verify-min-age
    min_age: "7"
    includes: |
      actions/.*
      suzuki-shunsuke/.*
    excludes: |
      # lines starting with # are ignored
      actions/checkout
    branch_to_tags: |
      # pinact run --branch-to-tag, one regular expression per line
      ^main$
    separator: "  # "
    config: .pinact.yaml # pinact's --config global flag
    diff_file: pr.diff # pinact run --diff-file, only process lines added by the PR
```

## Outputs

`result` tells apart a violation found by pinact from a failure of pinact or of the action itself, without having to parse logs.

| `result`     | Meaning                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `success`    | No problem was found                                                                                                             |
| `not_pinned` | GitHub Actions aren't pinned                                                                                                     |
| `unfixable`  | pinact found problems that it can't fix automatically, such as a branch reference, a `verify` mismatch, or a `min_age` violation |
| `error`      | pinact failed with a GitHub API error or an internal error, or the action itself failed                                          |

`exit_code` is `pinact run`'s exit code, which is what `result` is derived from. It is empty if pinact wasn't run, for example when creating a GitHub App token failed.

Unless `review` is enabled, the step fails in every case other than `success`, so a step reading these outputs needs `if: always()` (or `failure()`). Outputs set by a failed step are still available.
With `review: "true"`, whether a violation fails the step is up to `reviewdog_fail_level`, so `result` can be `not_pinned` or `unfixable` on a step that succeeded.

```yaml
- id: pinact
  uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    skip_push: "true"
    fix: "false"

- if: always() && steps.pinact.outputs.result == 'error'
  run: echo "pinact itself failed, so nothing was verified"
```

> [!NOTE]
> `not_pinned` only occurs with `fix: "false"`.
> When `fix` is enabled, which is the default, pinact fixes the files and exits with 0, so the result is `success`.
> In the default (auto-commit) mode that outcome is where a commit is pushed.

## Available versions

pinact-action's main branch and feature branches don't work.
[Please see the document](https://github.com/suzuki-shunsuke/release-js-action/blob/main/docs/available_versions.md).
