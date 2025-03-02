# pinact-action

[![License](http://img.shields.io/badge/license-mit-blue.svg?style=flat-square)](https://raw.githubusercontent.com/suzuki-shunsuke/pinact-action/main/LICENSE) | [action.yaml](action.yaml)

GitHub Actions to pin GitHub Actions and reusable workflows by [pinact](https://github.com/suzuki-shunsuke/pinact).
This action fixes files and pushes a commit to a remote branch.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/dd301d04-152c-49ac-bdf3-dbf8293b376f)

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/bcc1de57-0893-4536-b4bb-db2c9ed34231)

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/fc3ba9c1-561e-4bfe-8c73-5874bbcae69c)

This action uses GitHub Access Token.

The following permissions may be needed.

- `contents: write`: To push a commit to a remote branch. If private actions are used, the permission to access those repositories are also required
- `workflows: write`: To update GitHub Action workflow files

## Usage

```yaml
- uses: suzuki-shunsuke/pinact-action@a60b07ee63e41654915780a3297ff9f5f6b6db63 # v0.1.0
  with:
    github_token: ${{secrets.PAT}}
```

```yaml
- uses: suzuki-shunsuke/pinact-action@a60b07ee63e41654915780a3297ff9f5f6b6db63 # v0.1.0
  with:
    skip_push: false
```
