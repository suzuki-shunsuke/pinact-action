# pinact-action

GitHub Actions to pin GitHub Actions by pinact

## Requirements

Install these tools

- [suzuki-shunsuke/pinact](https://github.com/suzuki-shunsuke/pinact#install)
- [int128/ghcp](https://github.com/int128/ghcp)

To push a commit to a remote branch, GitHub Access Token is needed.

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
