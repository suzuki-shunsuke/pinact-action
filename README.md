# pinact-action

[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/suzuki-shunsuke/pinact-action/main/LICENSE) | [action.yaml](action.yaml)

pinact-action is a GitHub Actions to pin GitHub Actions and reusable workflows by [pinact](https://github.com/suzuki-shunsuke/pinact).
This action fixes files `\.github/workflows/[^/]+\.ya?ml$` and `^(.*/)?action\.ya?ml?` and pushes a commit to a remote branch.

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
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          persist-credentials: false

      - name: Pin actions
        uses: suzuki-shunsuke/pinact-action@latest
        with:
          app_id: ${{vars.APP_ID}}
          app_private_key: ${{secrets.APP_PRIVATE_KEY}}
```

### Use PAT

```yaml
uses: suzuki-shunsuke/pinact-action@latest
with:
  github_token: ${{secrets.BOT_GITHUB_TOKEN}}
```

### Using different GitHub Token for creating commits

```yaml
uses: suzuki-shunsuke/pinact-action@latest
with:
  # For pinact run (contents:read for all actions is required)
  github_token: ${{secrets.BOT_GITHUB_TOKEN}}
  # For creating commits (contents:write for the current repository is required)
  github_token_for_push: ${{secrets.BOT_GITHUB_TOKEN_FOR_PUSH}}
```

### skip_push

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

```yaml
- uses: suzuki-shunsuke/pinact-action@latest
  with:
    skip_push: "true"
```

### Reviewdog

See also https://github.com/reviewdog/reviewdog

```yaml
- uses: suzuki-shunsuke/pinact-action@latest
  with:
    review: "true"
    github_token: ${{secrets.BOT_GITHUB_TOKEN}}
    # Optional
    reviewdog_fail_level: none # The default is "error"
    reviewdog_filter_mode: nofilter # The default is "added"
```

You can also use the different access token for review:
`contents:read` and `pull_requests:write` permissions are required.

```yaml
- uses: suzuki-shunsuke/pinact-action@latest
  with:
    review: "true"
    github_token: ${{secrets.BOT_GITHUB_TOKEN}}
    github_token_for_review: ${{secrets.BOT_GITHUB_TOKEN_FOR_REVIEW}}
```

### update, verify, min_age, includes, excludes

These options are optional.

```yaml
- uses: suzuki-shunsuke/pinact-action@latest
  with:
    skip_push: "true"
    update: "true"
    verify: "true"
    min_age: "7"
    includes: |
      actions/.*
      suzuki-shunsuke/.*
    excludes: |
      # lines starting with # are ignored
      actions/checkout
```
