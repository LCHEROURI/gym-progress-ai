# Deploying from CI

`deploy-hosting.yml` calls `firebase-hosting-reusable.yml`, which until
2026-09-28 had no caller at all — it was present, valid, and inert. This file
covers the one-time setup that makes it work.

**Nothing here is code.** Until it is done, the workflow fails at its `preflight`
job with a message naming the missing repository variables, and deploys continue
to happen by hand with `npm run deploy` from a machine with credentials. That is
a safe state, not a broken one.

> **Provisioned 2026-09-28.** Steps 1–4 are done: pool `github`, provider
> `github-provider` (condition `assertion.repository == 'LCHEROURI/gym-progress-ai'`),
> SA `firebase-hosting-deployer` with exactly `roles/firebasehosting.admin` and
> `roles/serviceusage.serviceUsageConsumer`, and all three repository variables
> set. Two commands below were corrected while running them: `providers create`
> is really `providers create-oidc`, and the pool resource name needs the
> project number. The doc reflects what actually worked.

## What CI deploys, and what it does not

| Surface | Deployed by CI | How |
|---|---|---|
| Hosting | yes | this workflow, on push to `main` |
| Cloud Functions | no | `npm run deploy` from a machine |
| Firestore rules | no | `npm run deploy` from a machine |
| Firestore indexes | no | `npm run deploy` from a machine |

Functions, rules, and indexes stay manual on purpose. A rules deploy is a
security change; having one happen unattended on every merge is a worse failure
mode than a slightly slower release. The reusable workflow deploys hosting only,
so it cannot deploy them even by accident.

## The one-time setup

### 1. Workload Identity Federation

The reusable workflow authenticates with OIDC, not a service-account key. As of
2026-09-28 the project has **no** identity pool and no dedicated deployer
account — only the default compute and `firebase-adminsdk` accounts, neither of
which should be attached to a CI pipeline.

```bash
PROJECT=gym-progress-ai-lcherouri
REPO=LCHEROURI/gym-progress-ai

# Pool + provider bound to THIS repository only. The attribute condition means a
# fork cannot mint a token even if it opens a pull request.
#
# Note `create-oidc`, not `create`: there is no generic `providers create`
# subcommand, and gcloud answers a wrong one with a list of valid choices
# rather than a clear error.
gcloud iam workload-identity-pools create github \
  --project="$PROJECT" --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project="$PROJECT" --location=global \
  --workload-identity-pool=github \
  --display-name="$REPO" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$REPO'"
```

### 2. A deployer service account with only Hosting permissions

```bash
gcloud iam service-accounts create firebase-hosting-deployer \
  --project="$PROJECT" --display-name="CI Hosting deployer"

# Hosting Admin is the narrow role that can publish the site.
for ROLE in roles/firebasehosting.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:firebase-hosting-deployer@$PROJECT.iam.gserviceaccount.com" \
    --role="$ROLE" --condition=None
done
```

Note what is **not** granted: `firebase-admin`, `datastore.user`, or Owner. A
compromised CI token can publish a website and nothing else.

### 3. Let GitHub impersonate that account

The pool resource name uses the project **number**, not its id. Using
`$PROJECT` here fails with *"Identity Pool does not exist"* — the pool's `name`
attribute is always numeric.

```bash
NUM=$(gcloud projects describe $PROJECT --format='value(projectNumber)')

gcloud iam service-accounts add-iam-policy-binding \
  firebase-hosting-deployer@$PROJECT.iam.gserviceaccount.com \
  --project="$PROJECT" \
  --member="principalSet://iam.googleapis.com/projects/$NUM/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" \
  --role="roles/iam.workloadIdentityUser"
```

### 4. Repository variables

Settings → Secrets and variables → Actions → **Variables** (not Secrets — these
are not secret).

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT` | `gym-progress-ai-lcherouri` |
| `FIREBASE_DEPLOYER_SERVICE_ACCOUNT` | `firebase-hosting-deployer@gym-progress-ai-lcherouri.iam.gserviceaccount.com` |
| `WORKLOAD_IDENTITY_PROVIDER` | `projects/777425611767/locations/global/workloadIdentityPools/github/providers/github-provider` |

The provider resource name contains the project *number*, not its id. Get it
with `gcloud projects describe $PROJECT --format='value(projectNumber)'`.

**Not `GITHUB_WIF_PROVIDER`.** GitHub reserves the `GITHUB_` prefix for the
variables it injects into every workflow, and rejects the name outright:

```
$ gh variable set GITHUB_WIF_PROVIDER -b ...
HTTP 422: Variable names must not start with GITHUB_.
```

Any `GITHUB_`-prefixed name is unavailable, so this one is spelled out in full.

Or from the CLI:

```bash
gh variable set FIREBASE_PROJECT -b gym-progress-ai-lcherouri --repo LCHEROURI/gym-progress-ai
gh variable set FIREBASE_DEPLOYER_SERVICE_ACCOUNT \
  -b firebase-hosting-deployer@gym-progress-ai-lcherouri.iam.gserviceaccount.com \
  --repo LCHEROURI/gym-progress-ai
gh variable set WORKLOAD_IDENTITY_PROVIDER \
  -b projects/777425611767/locations/global/workloadIdentityPools/github/providers/github-provider \
  --repo LCHEROURI/gym-progress-ai
```

## Verifying before trusting it

Open a pull request. The `deploy` job should publish a **preview channel** — the
reusable workflow routes `pull_request` to `hosting:channel:deploy`, so nothing
touches production. The `smoke` job then asserts the routing invariants against
the live channel, including that a deleted chunk 404s.

Merge to `main` only after a preview run has gone green end to end. The first
production deploy is the one that publishes to real users.

## The smoke check writes a real boot report

Its `__boot` assertion is a genuine POST, so every run leaves a document in
`bootFailures` with `buildId: "ci-smoke-<run id>"`. That is deliberate: the
alternative is asserting the transport some other way, and an empty
`bootFailures` collection is exactly the ambiguous signal this check exists to
disambiguate.

These are identifiable on sight and safe to purge in bulk:

```bash
for ID in $(node functions/list-boot-failures.mjs | grep -o '"buildId":"ci-smoke-[0-9]*"' | cut -d'"' -f4 | sort -u); do
  node functions/purge-boot-failures.mjs "$ID" --confirm
done
```

If the count of `ci-smoke-*` documents ever grows past a handful, the smoke job
is not running — which is itself worth knowing.

**One caveat to expect:** until PR #6 deploys, this check will fail on a cold
`__boot` with a 500. That is the check doing its job, not a misconfiguration.

## Things that will fail, and what they mean

| Symptom | Cause |
|---|---|
| `preflight` lists missing variables | steps 1–4 not done, or variables added to Secrets instead of Variables |
| `HTTP 422: Variable names must not start with GITHUB_` | the name is reserved by GitHub; use `WORKLOAD_IDENTITY_PROVIDER` |
| `Identity Pool does not exist` on the step-3 binding | the pool resource name used the project id; it needs the project **number** |
| `Could not fetch access token` / 401 in the auth step | the provider resource name is wrong, or step 3 is missing; check `gcloud iam service-accounts get-iam-policy` |
| 403 deploying | the deployer SA lacks `roles/firebasehosting.admin` |
| Run succeeds, nothing deployed | the reusable workflow matched neither `preview` nor `production` — its jobs are gated on `github.event_name`, so only `push` to `main` and `pull_request` do anything. `tests/deploy-ci.test.ts` pins this. |
| Run succeeds, production is stale | check the run's `deploy` job logs; a skipped reusable job is not a failure |
