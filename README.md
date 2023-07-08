# pinact-action

GitHub Actions to pin GitHub Actions and reusable workflows by [pinact](https://github.com/suzuki-shunsuke/pinact).

This action fixes files and pushes a commit to a remote branch.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/dd301d04-152c-49ac-bdf3-dbf8293b376f)

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/bcc1de57-0893-4536-b4bb-db2c9ed34231)

If you don't want to push a commit, this action can also only validate files.
In this case, if actions aren't pinned CI fails.

![image](https://github.com/suzuki-shunsuke/pinact-action/assets/13323303/fc3ba9c1-561e-4bfe-8c73-5874bbcae69c)

## Requirements

Install these tools

- [suzuki-shunsuke/pinact](https://github.com/suzuki-shunsuke/pinact#install)
- [int128/ghcp](https://github.com/int128/ghcp): To push a commit to a remote branch

This action uses GitHub Access Token too.

The following permissions may be needed.

- `pull-requests: write`: To push a commit to a remote branch
- `contents: read`: To access private actions

## Usage

```yaml
- uses: suzuki-shunsuke/pinact-action@main
  with:
    github_token: ${{secrets.PAT}}
```

```yaml
- uses: suzuki-shunsuke/pinact-action@main
  with:
    skip_push: false
```

## LICENSE

[MIT](LICENSE)
