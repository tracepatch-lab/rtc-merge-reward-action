# RTC Merge Reward Action

Reusable GitHub Action that awards RTC when a pull request is merged.

It is designed for open source maintainers who want a low-friction bounty workflow:

- trigger on `pull_request.closed`
- require `github.event.pull_request.merged == true`
- read the contributor wallet from the PR body or a `.rtc-wallet` file
- call a configurable RustChain payout endpoint
- post a PR comment with the payout or dry-run result

The action defaults to dry-run mode so repositories can test wallet discovery and comments before moving funds.

## Usage

```yaml
name: RTC merge rewards

on:
  pull_request:
    types: [closed]

permissions:
  contents: read
  issues: write
  pull-requests: read

jobs:
  reward:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: tracepatch-lab/rtc-merge-reward-action@v1
        with:
          amount: 5
          wallet-from: project-fund
          admin-key: ${{ secrets.RTC_ADMIN_KEY }}
          dry-run: "false"
```

## Wallet Discovery

The action first scans the PR body for one of these forms:

```text
RTC wallet: RTCa14a8b8553834f4593db826222424420bf6f8417
wallet: my-rtc-wallet
miner_id: RTCa14a8b8553834f4593db826222424420bf6f8417
```

If no wallet appears in the PR body, it reads `.rtc-wallet` from the contributor branch.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `amount` | yes | | RTC amount per merged PR |
| `wallet-from` | yes | | Funding wallet/account |
| `admin-key` | no | | Bearer token for the payout endpoint |
| `node-url` | no | `https://50.28.86.131` | RustChain node base URL |
| `payout-path` | no | `/wallet/transfer` | Payout route, configurable for deployments |
| `wallet-file` | no | `.rtc-wallet` | Fallback wallet file |
| `dry-run` | no | `true` | Set to `false` to submit payment |
| `comment` | no | `true` | Post a PR comment |
| `github-token` | no | `${{ github.token }}` | GitHub API token |

## Example PR Body

```markdown
Fixes #123

RTC wallet: RTCa14a8b8553834f4593db826222424420bf6f8417
```

## Local Test

```bash
node test.js
```

## Marketplace Notes

This repository includes `action.yml` with branding metadata, so it can be published as a GitHub Marketplace Action after tagging a release such as `v1`.
