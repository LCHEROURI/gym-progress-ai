# Monitoring

What is watched, from where, and what happens when it breaks.

## The one thing that matters most: `/__boot`

`/__boot` is the blank-screen telemetry path. A dependency-free probe is inlined
into `index.html` and posts to it when a chunk fails to load, the MIME type is
wrong, or React never mounts — failures the app itself cannot report, because
the app is exactly what failed.

**If that endpoint is down, blank screens are happening invisibly.** Every
deploy is unverified until it recovers, because nothing will be reported when a
client fails to boot.

This is not hypothetical. It was silently dead for its entire first life:
`reportBootFailure` shipped at `memory: "128MiB"` and the runtime OOM-killed the
instance at 141 MiB *before the handler ran*, so every request that arrived
while the function was scaled to zero got a 500. A burst against one warm
instance returned 202, which is why the smoke test passed and the outage went
unnoticed. See the cold-start note in `docs/BLANK-SCREEN-RUNBOOK.md`.

## The liveness monitor

A Cloud Monitoring uptime check probes `/__boot` from three US regions every
15 minutes and requires **202** plus a body containing `"ok":true`. An alert
policy emails when it fails.

| Piece | Where |
|---|---|
| Uptime check | `boot-intake-liveness-NLXrhTcawlA` in `gym-progress-ai-lcherouri` |
| Check config | `monitoring/boot-intake-liveness.yaml` |
| Alert policy | `monitoring/boot-intake-alert-policy.yaml` |
| Provisioning | `monitoring/provision.sh` |
| Probe cleanup | `.github/workflows/purge-liveness-probes.yml` (daily 07:17 UTC) |
| Tests | `tests/monitoring-config.test.ts` |

Why Cloud Monitoring rather than a scheduled job: the monitor has to keep
working when the things it watches are broken. Anything running inside this
repo's CI shares a failure domain with the deploy it is meant to verify. This
probes from Google's infrastructure, outside both the repository and the
Firebase project.

### Verifying it by hand

Do this after any change to the monitor, and before believing an alert:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://gym-progress-ai-lcherouri.web.app/__boot \
  -H 'Content-Type: text/plain' \
  --data '{"buildId":"manual-probe","stage":"boot","message":"manual"}'
```

Expect `202`. Then confirm the metric is actually being written — this is the
step that catches a filter matching nothing:

```bash
gcloud monitoring time-series list \
  --project=gym-progress-ai-lcherouri \
  --filter='metric.type="monitoring.googleapis.com/uptime_check/check_passed"'
```

An empty list means the check is not running, regardless of what the console
shows. `monitoring/provision.sh` re-creates anything missing and is safe to
re-run.

## Status right now: the check runs, the alert does not fire yet

This is the honest state as of 2026-09-28, and it matters more than the rest of
this file.

| Piece | State |
|---|---|
| Uptime check `boot-intake-liveness-NLXrhTcawlA` | **running**, every 15 min from 3 US regions |
| Probe reaching `/__boot` | **confirmed** — see below |
| `uptime_check/check_passed` metric | **never materialises** |
| Alert policy | **cannot be created** — blocked on the metric |
| Email notification | **unverified**, and would send nothing anyway |

The check is genuinely working. `bootFailures` accumulates `liveness-probe`
documents on schedule:

```
2026-09-28T17:19:54Z  buildId=liveness-probe  count=2
2026-09-28T17:22:40Z  buildId=liveness-probe  count=1
2026-09-28T17:33:33Z  buildId=liveness-probe  count=3
```

So the endpoint is being probed every fifteen minutes and answering 202. What
does not happen is the **alert**: the API refuses to create a policy that
filters on a metric with no data points, and no data points are ever written:

```
Cannot find metric(s) that match type =
  "monitoring.googleapis.com/uptime_check/check_passed"
label = "check_id" label = "check_passed"
```

GCP's own guidance is *"it could take up to 10 minutes to become available"*,
and this was still empty forty minutes after creation, so that is not the
answer. The likely cause is a missing **Monitoring service agent** — the
project has no `service-777425611767@gcp-sa-monitoring.iam.gserviceaccount.com`,
and without it the checker can make HTTP requests but cannot write its metric.
The probes landing in Firestore are consistent with exactly that: the check
works, the reporting path does not.

**To finish it, run this** (it hung repeatedly in the session that wrote this
file, so it may well work from your shell):

```bash
gcloud beta services identity create \
  --service=monitoring.googleapis.com --project=gym-progress-ai-lcherouri

# then wait one check period, confirm a data point, and create the policy:
node monitoring/provision.sh
gcloud monitoring time-series list --project=gym-progress-ai-lcherouri \
  --filter='metric.type="monitoring.googleapis.com/uptime_check/check_passed"'
```

Until that lands, **nothing will email you.** The check is running, so the
endpoint is being exercised, but a silent probe is not a monitor. Re-run
`monitoring/provision.sh` after the next check period: it is idempotent and
creates the policy the moment the metric exists.


minutes and only accepts 1, 5, 10, or 15. The REST v3 API, which would take
`3600s`, rejects uptime-check creation on this project with `Invalid target
type` at any period. The check therefore runs every 15 minutes — about 96 probe
documents a day, all identical apart from a dedupe window, which is why the
daily purge exists. Detection is *faster* than hourly would have been; the cost
is the write volume, not the latency.

**A continuously-failing check emails exactly once**, on open, plus once on
close. This API has no repeat interval. If that is not enough, the fix is a
second policy, not a setting.

**The alert does not fire until the check has produced one data point.** Creating
the policy too early returns `NOT_FOUND` with *"it could take up to 10 minutes
to become available"*. That is a wait, not a failure — re-run
`monitoring/provision.sh` after one check period.

**The purge job does not run yet.** It authenticates as
`vars.FIREBASE_ADMIN_SERVICE_ACCOUNT`, which does not exist. `provision.sh`
prints exactly what is missing.

## The probe documents are real reports

Every probe is a genuine POST, so it writes a document to `bootFailures` with
`buildId: "liveness-probe"`. This is deliberate: the alternative is asserting
the transport some other way, and an empty `bootFailures` is exactly the
ambiguous signal this whole system exists to remove.

The stable `buildId` is what makes them purgeable as a set.
`tests/monitoring-config.test.ts` asserts the probe body and the purge job
reference the *same* string — if those drift, the purge silently matches nothing
and the collection grows forever with no error anywhere.

Purge by hand:

```bash
node functions/list-boot-failures.mjs
node functions/purge-boot-failures.mjs liveness-probe --confirm
```

If the count of `liveness-probe` documents ever grows past a day, the purge job
is not running — which is itself worth knowing.

## Traps hit while provisioning this

Every one of these cost a round trip, and each is why the provisioning is a
script with the working commands rather than a doc full of plausible ones.

| Attempt | Error | Reality |
|---|---|---|
| `gcloud monitoring uptime create --config=…` | unrecognized argument | there is no `--config`; `--configuration` is also rejected on this version, so the check must be built from flags |
| REST `POST …/uptimeConfigs` | 404 | the resource is `uptimeCheckConfigs` |
| REST body with `method` / `expectedResponseCode` | unknown field | REST wants `requestMethod`, `acceptedResponseStatusCodes[]`, and a **base64** `body` |
| REST `contentType: "text/plain"` | invalid enum | it is `TYPE_UNSPECIFIED`/`URL_ENCODED`/`USER_PROVIDED`; use `USER_PROVIDED` + `customContentType` |
| REST, correct schema | `Invalid target type` | creation is not possible over REST on this project at all |
| `gcloud --period=3600` | valid choices are 1, 5, 10, 15 | hourly is unavailable |
| `gcloud --request-method=POST` | did you mean 'post'? | lowercase |
| `gcloud --regions=USA` | must be one of `usa-oregon`… | lowercase with hyphens, and **at least three** are required |
| `gcloud --group-type=uptime_url` | invalid choice | only `aws-elb-load-balancer` and `gce-instance` exist; use `--resource-type=uptime-url` |
| `--validate-ssl` | expected one argument | needs `--validate-ssl=true` |
| email channel label `address` | permissible key is `email_address` | |
| alert policy `filter:` as a list | "Proto field is not repeating" | v3 wants one newline-joined string |
| alert policy `alertPolicy:` block | cannot find field | it is `alertStrategy` with `notificationPrompts` / `autoClose` |

`gcloud alpha monitoring channels list` and `policies create` also hung
repeatedly here; the REST API was fast and gave better errors. If a `gcloud
monitoring` command stalls, use the REST endpoint with
`gcloud auth print-access-token`.

## The email channel is unverified until you click

GCP creates an email channel in an unverified state and sends a verification
link. **An unverified channel sends nothing** — the policy will look armed and
be completely silent. This is the single most likely way for this monitor to
appear installed and not work.

## What is not monitored

Stated so the gaps are known rather than assumed:

- **The client.** Nothing checks that a real phone renders the app. The boot
  probe reports failures, but only from a device that reaches `/__boot`.
- **Firestore writes from the client.** If the Firestore rules or the client's
  write path break, no check here notices.
- **Gemini.** The client-side `firebase/ai` calls in `src/coach` are billable
  and unenforced by App Check until it is configured. A quota or error spike
  there is invisible.
- **The scheduled functions.** `sundayWeeklyReports` and
  `sendWorkoutReminders` have no liveness check. They fail by running and
  logging, not by returning an HTTP status, so an uptime check is the wrong
  tool; a log-based metric on their error rate is the right one.
