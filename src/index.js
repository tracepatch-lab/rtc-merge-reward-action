const fs = require("fs");

function input(name, fallback = "") {
  const key = `INPUT_${name.replace(/ /g, "_").replace(/-/g, "_").toUpperCase()}`;
  return process.env[key] || fallback;
}

function boolInput(name, fallback = false) {
  const value = input(name, String(fallback)).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function requiredInput(name) {
  const value = input(name).trim();
  if (!value) throw new Error(`Missing required input: ${name}`);
  return value;
}

function loadEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error("GITHUB_EVENT_PATH is not set");
  return JSON.parse(fs.readFileSync(eventPath, "utf8"));
}

function extractWallet(text) {
  if (!text) return null;
  const labeled = text.match(/(?:rtc\s*wallet|wallet|miner[_ -]?id)\s*[:=]\s*`?([A-Za-z0-9_-]{6,})`?/i);
  if (labeled) return labeled[1];
  const address = text.match(/\bRTC[a-zA-Z0-9]{24,}\b/);
  return address ? address[0] : null;
}

function githubApiUrl(path) {
  return `https://api.github.com${path}`;
}

async function githubRequest(path, options = {}) {
  const token = input("github-token") || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("github-token or GITHUB_TOKEN is required");

  const response = await fetch(githubApiUrl(path), {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "rtc-merge-reward-action",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function readWalletFile(owner, repo, ref, walletFile) {
  const encodedPath = walletFile.split("/").map(encodeURIComponent).join("/");
  const data = await githubRequest(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`);
  if (!data || !data.content) return null;
  const content = Buffer.from(data.content, "base64").toString("utf8").trim();
  return extractWallet(content) || content.split(/\s+/)[0] || null;
}

async function postComment(owner, repo, issueNumber, body) {
  if (!boolInput("comment", true)) return;
  await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

async function payRtc({ wallet, amount, from, event }) {
  const dryRun = boolInput("dry-run", true);
  const nodeUrl = input("node-url", "https://50.28.86.131").replace(/\/+$/, "");
  const payoutPath = input("payout-path", "/wallet/transfer");
  const adminKey = input("admin-key");
  const memo = `GitHub PR merge reward: ${event.repository.full_name}#${event.pull_request.number}`;

  const payload = {
    from,
    to: wallet,
    amount: Number(amount),
    memo,
    github: {
      repository: event.repository.full_name,
      pull_request: event.pull_request.number,
      merge_commit_sha: event.pull_request.merge_commit_sha,
      contributor: event.pull_request.user.login,
    },
  };

  if (dryRun) {
    return { dryRun: true, payload };
  }
  if (!adminKey) throw new Error("admin-key is required when dry-run is false");

  const response = await fetch(`${nodeUrl}${payoutPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    // Keep raw text when the node does not return JSON.
  }
  if (!response.ok) {
    throw new Error(`RTC payout failed: ${response.status} ${text}`);
  }
  return { dryRun: false, status: response.status, body, payload };
}

function resultComment({ wallet, amount, from, result }) {
  const mode = result.dryRun ? "Dry run" : "Payment submitted";
  const tx = result.body && (result.body.tx || result.body.txid || result.body.transaction_id);
  return [
    `## RTC merge reward: ${mode}`,
    "",
    `- Amount: ${amount} RTC`,
    `- Recipient: \`${wallet}\``,
    `- Funding wallet: \`${from}\``,
    tx ? `- Transaction: \`${tx}\`` : null,
    "",
    result.dryRun
      ? "No funds were moved because `dry-run` is enabled. Set `dry-run: \"false\"` and provide `admin-key` to submit payment."
      : "The configured RustChain node accepted the payout request.",
  ].filter(Boolean).join("\n");
}

async function main() {
  const event = loadEvent();
  const pr = event.pull_request;
  if (!pr) {
    console.log("No pull_request payload found; nothing to reward.");
    return;
  }
  if (event.action !== "closed" || pr.merged !== true) {
    console.log("Pull request was not merged; nothing to reward.");
    return;
  }

  const amount = requiredInput("amount");
  const from = requiredInput("wallet-from");
  const owner = event.repository.owner.login;
  const repo = event.repository.name;
  const walletFile = input("wallet-file", ".rtc-wallet");

  let wallet = extractWallet(pr.body);
  if (!wallet) {
    wallet = await readWalletFile(owner, repo, pr.head.sha, walletFile);
  }
  if (!wallet) {
    throw new Error(`No RTC wallet found in PR body or ${walletFile}`);
  }

  const result = await payRtc({ wallet, amount, from, event });
  await postComment(owner, repo, pr.number, resultComment({ wallet, amount, from, result }));
  console.log(JSON.stringify({ ok: true, wallet, amount, dryRun: result.dryRun }));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { extractWallet, resultComment };
