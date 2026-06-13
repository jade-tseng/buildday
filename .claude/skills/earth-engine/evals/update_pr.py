#!/usr/bin/env python3
"""Update GitHub PR description with eval results.

Usage:
    export GITHUB_TOKEN=ghp_...
    python update_pr.py --repo jade-tseng/buildday [--pr 1]

If --pr is omitted, discovers the open PR for feat/earth-engine-skill automatically.
"""
import argparse
import json
import os
import pathlib
import sys
import requests

EVALS_DIR = pathlib.Path(__file__).parent
GITHUB_API = "https://api.github.com"


def get_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def find_pr(repo, token):
    resp = requests.get(
        f"{GITHUB_API}/repos/{repo}/pulls",
        headers=get_headers(token),
        params={"state": "open", "head": f"{repo.split('/')[0]}:feat/earth-engine-skill"},
        timeout=15,
    )
    resp.raise_for_status()
    prs = resp.json()
    if not prs:
        sys.exit("No open PR found for feat/earth-engine-skill")
    return prs[0]["number"], prs[0]["body"] or ""


def get_pr_body(repo, pr_number, token):
    resp = requests.get(
        f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}",
        headers=get_headers(token),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("body") or ""


def build_appendix(functional_md, trigger_path):
    from datetime import date

    trigger_section = ""
    if trigger_path and trigger_path.exists():
        trigger_raw = json.loads(trigger_path.read_text())
        results = trigger_raw if isinstance(trigger_raw, list) else trigger_raw.get("results", [])
        passed = sum(1 for r in results if r.get("pass"))
        total = len(results)
        rows = "\n".join(
            f"| {r['query'][:65]} | {'yes' if r['should_trigger'] else 'no'} "
            f"| {r.get('trigger_rate', 0):.0%} | {'✅' if r.get('pass') else '❌'} |"
            for r in results
        )
        trigger_section = f"""
### Trigger Eval — {passed}/{total} passed

| Query | Should Trigger | Trigger Rate | Result |
|-------|---------------|-------------|--------|
{rows}

<details>
<summary>Raw trigger eval JSON</summary>

```json
{json.dumps(results, indent=2)}
```

</details>
"""

    return f"""

---

## Eval Results ({date.today()})

### Functional Eval — tested 8 locations deterministically

{functional_md}
{trigger_section}"""


def patch_pr(repo, pr_number, new_body, token):
    resp = requests.patch(
        f"{GITHUB_API}/repos/{repo}/pulls/{pr_number}",
        headers=get_headers(token),
        json={"body": new_body},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["html_url"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="jade-tseng/buildday")
    parser.add_argument("--pr", type=int, help="PR number (auto-detected if omitted)")
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"))
    args = parser.parse_args()

    if not args.token:
        sys.exit("GITHUB_TOKEN not set. Export it or pass --token.")

    functional_results = EVALS_DIR / "results.md"
    trigger_results = EVALS_DIR / "trigger_results.json"

    if not functional_results.exists():
        sys.exit(f"functional results not found: {functional_results}\nRun functional_eval.py first.")

    if args.pr:
        pr_number = args.pr
        current_body = get_pr_body(args.repo, pr_number, args.token)
    else:
        pr_number, current_body = find_pr(args.repo, args.token)

    print(f"Updating PR #{pr_number} on {args.repo}...")

    # Strip any previous eval results block to avoid duplicates
    if "\n---\n\n## Eval Results" in current_body:
        current_body = current_body[: current_body.index("\n---\n\n## Eval Results")]

    appendix = build_appendix(functional_results.read_text(), trigger_results)
    new_body = current_body + appendix

    url = patch_pr(args.repo, pr_number, new_body, args.token)
    print(f"Done: {url}")


if __name__ == "__main__":
    main()
