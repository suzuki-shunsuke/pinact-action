# pinact-action

[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/suzuki-shunsuke/pinact-action/main/LICENSE) | [action.yaml](action.yaml)

pinact-action is a GitHub Actions to pin GitHub Actions and reusable workflows by [pinact](https://github.com/suzuki-shunsuke/pinact).
This action fixes files and pushes a commit to a remote branch.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/dd301d04-152c-49ac-bdf3-dbf8293b376f)

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/bcc1de57-0893-4536-b4bb-db2c9ed34231)

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/fc3ba9c1-561e-4bfe-8c73-5874bbcae69c)

## GitHub Access Token

You can use the following things:

- :thumbsup: GitHub App Installation access token: We recommend this
- :thumbsdown: GitHub Personal Access Token: This can't create verified commits
- :thumbsdown: `${{secrets.GITHUB_TOKEN}}`: This can't trigger new workflow runs.

https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow

> When you use the repository's GITHUB_TOKEN to perform tasks, events triggered by the GITHUB_TOKEN, with the exception of workflow_dispatch and repository_dispatch, will not create a new workflow run.

### Required permissions

`contents:write` is required.
Furthermore, if you want to fix workflow files, `workflows:write` is also required.
If private actions are used, the permission `contents:read` to access those repositories are also required.

## How To Use

All inputs are optional.

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
        uses: suzuki-shunsuke/pinact-action@v0.1.1
```

By default, this action uses `${{github.token}}` to create a commit.
But we recommend GitHub App because `${{github.token}}` doesn't trigger a new workflow run.

You can create a GitHub App installation access token and pass it to pinact-action yourself, but you can also pass a pair of GitHub App ID and private key.
Then pinact-action creates a GitHub App installation access token with minimum `repositories` and `permissions`.

```yaml
- uses: suzuki-shunsuke/pinact-action@v0.1.1
  with:
    app_id: ${{secrets.APP_ID}}
    app_private_key: ${{secrets.APP_PRIVATE_KEY}}
```

### skip_push

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

```yaml
- uses: suzuki-shunsuke/pinact-action@a60b07ee63e41654915780a3297ff9f5f6b6db63 # v0.1.0
  with:
    skip_push: "true"
```
