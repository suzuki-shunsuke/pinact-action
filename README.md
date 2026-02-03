# pinact-action

[![Ask DeepWiki](https://img.shields.io/badge/Ask_DeepWiki-000000.svg?logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAyCAYAAAAnWDnqAAAAAXNSR0IArs4c6QAAA05JREFUaEPtmUtyEzEQhtWTQyQLHNak2AB7ZnyXZMEjXMGeK/AIi+QuHrMnbChYY7MIh8g01fJoopFb0uhhEqqcbWTp06/uv1saEDv4O3n3dV60RfP947Mm9/SQc0ICFQgzfc4CYZoTPAswgSJCCUJUnAAoRHOAUOcATwbmVLWdGoH//PB8mnKqScAhsD0kYP3j/Yt5LPQe2KvcXmGvRHcDnpxfL2zOYJ1mFwrryWTz0advv1Ut4CJgf5uhDuDj5eUcAUoahrdY/56ebRWeraTjMt/00Sh3UDtjgHtQNHwcRGOC98BJEAEymycmYcWwOprTgcB6VZ5JK5TAJ+fXGLBm3FDAmn6oPPjR4rKCAoJCal2eAiQp2x0vxTPB3ALO2CRkwmDy5WohzBDwSEFKRwPbknEggCPB/imwrycgxX2NzoMCHhPkDwqYMr9tRcP5qNrMZHkVnOjRMWwLCcr8ohBVb1OMjxLwGCvjTikrsBOiA6fNyCrm8V1rP93iVPpwaE+gO0SsWmPiXB+jikdf6SizrT5qKasx5j8ABbHpFTx+vFXp9EnYQmLx02h1QTTrl6eDqxLnGjporxl3NL3agEvXdT0WmEost648sQOYAeJS9Q7bfUVoMGnjo4AZdUMQku50McDcMWcBPvr0SzbTAFDfvJqwLzgxwATnCgnp4wDl6Aa+Ax283gghmj+vj7feE2KBBRMW3FzOpLOADl0Isb5587h/U4gGvkt5v60Z1VLG8BhYjbzRwyQZemwAd6cCR5/XFWLYZRIMpX39AR0tjaGGiGzLVyhse5C9RKC6ai42ppWPKiBagOvaYk8lO7DajerabOZP46Lby5wKjw1HCRx7p9sVMOWGzb/vA1hwiWc6jm3MvQDTogQkiqIhJV0nBQBTU+3okKCFDy9WwferkHjtxib7t3xIUQtHxnIwtx4mpg26/HfwVNVDb4oI9RHmx5WGelRVlrtiw43zboCLaxv46AZeB3IlTkwouebTr1y2NjSpHz68WNFjHvupy3q8TFn3Hos2IAk4Ju5dCo8B3wP7VPr/FGaKiG+T+v+TQqIrOqMTL1VdWV1DdmcbO8KXBz6esmYWYKPwDL5b5FA1a0hwapHiom0r/cKaoqr+27/XcrS5UwSMbQAAAABJRU5ErkJggg==)](https://deepwiki.com/suzuki-shunsuke/pinact-action)
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

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
  with:
    skip_push: "true"
```

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

### update, verify, min_age, includes, excludes, separator

These options are optional.

```yaml
- uses: suzuki-shunsuke/pinact-action@28aeb220eb3252ad0d4422dd5d9368e925acbd8d # v1.3.0
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
    separator: "  # "
```

## Available versions

pinact-action's main branch and feature branches don't work.
[Please see the document](https://github.com/suzuki-shunsuke/release-js-action/blob/main/docs/available_versions.md).
