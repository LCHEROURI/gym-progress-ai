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

## Known limits, stated rather than hidden

**Hourly is not possible.** `gcloud monitoring uptime create --period` is in
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

## Still open

**Last live-verified: 2026-09-29.** The evidence below is current as of that
date. Re-run the "Verify by hand" probes after any change to the monitor, and
update this date if you do so.

### What was verified live (2026-09-29)

Two of the three previously-unverified gates now pass, checked by hand against
the live project:

1. **The endpoint answers 202.** A fresh POST to
   `https://gym-progress-ai-lcherouri.web.app/__boot` returned `202`.

2. **The `check_passed` metric is being written.** A REST query against
   `monitoring.googleapis.com/uptime_check/check_passed` over the last 30
   minutes returned 3 time series, all on resource `uptime_url`
   `gym-progress-ai-lcherouri.web.app` — so the uptime check is running and
   reporting, not just installed.

3. **The channel in the policy file is the live channel.** Cloud Monitoring has
   exactly one notification channel in the project:
   `16757130955440014131` (`Boot intake liveness`), which is byte-for-byte the
   channel named in `monitoring/boot-intake-alert-policy.yaml` line 41. The
   policy file is not pointing at a stale or wrong channel.

### What is still not working yet

Two things remain, and both are now concrete instead of vague:

- **The alert policy has not been created in Cloud Monitoring yet.** A query for
  `alertPolicies` in the project returned 0 policies, so `boot-intake-liveness`
  does not exist live yet. The good news: the precondition is now satisfied. The
  uptime check `boot-intake-liveness-NLXrhTcawlA` is present and running (verified
  live: `displayName: boot-intake-liveness`, `monitoredResource: uptime_url` on
  `gym-progress-ai-lcherouri.web.app`, `period: 900s`, `path: /__boot`,
  `acceptedResponseStatusCodes: [202]`, `contentMatchers: ["ok":true
  CONTAINS_STRING]`, `selectedRegions: USA_IOWA/USA_OREGON/USA_VIRGINIA` — all of
  which match `monitoring/boot-intake-liveness.yaml`). The check has also produced
  data points (verified live: 3 `check_passed` time series in the last 30
  minutes). So `monitoring/provision.sh` should now be able to create the policy.

  **Next action (run locally):** on a machine with a working `gcloud auth
  session` against `gym-progress-ai-lcherouri`, run
  `bash monitoring/provision.sh`. The script is idempotent and safe to re-run;
  when the policy exists it prints `alert policy: present`. This machine's
  `gcloud` does not expose the `monitoring` subcommands the script uses, so it
  is not the right runtime for this step — run it where `gcloud monitoring uptime
  describe boot-intake-liveness-NLXrhTcawlA` works.

  After running it, confirm the policy appeared:
  ```bash
  curl -s -H "Authorization: Bearer \$(gcloud auth print-access-token)" \
    "https://monitoring.googleapis.com/v3/projects/gym-progress-ai-lcherouri/alertPolicies" \
    | python3 -c "import json,sys; [print(p.get('displayName'), [n.split('/')[-1] for n in p.get('notificationChannels',[])]) for p in json.load(sys.stdin).get('alertPolicies',[])]"
  ```
  Expect a policy whose `displayName` is `boot-intake-liveness` and whose
  channel list includes `16757130955440014131`.

- **The channel is not yet `VERIFIED`.** Its `verificationStatus` is unverified.
  GCP creates email channels in an unverified state and emails a verification
  link; until that link is clicked, the channel sends nothing and the alert will
  look armed and be silent. This is the single most likely way for this monitor
  to appear installed and not work, and the doc says so in the section just
  below.

  **Next action (GCP Console):** open Monitoring → Alerting → Notification
  channels, find `Boot intake liveness` (channel id
  `16757130955440014131`), and click the verification link if one was sent. If
  no link was sent, re-send it from the same panel. There is no CLI or API path
  that bypasses this — verification is intentionally manual.

  After verifying, confirm the status changed:
  ```bash
  curl -s -H "Authorization: Bearer \$(gcloud auth print-access-token)" \
    "https://monitoring.googleapis.com/v3/projects/gym-progress-ai-lcherouri/notificationChannels" \
    | python3 -c "import json,sys; [print(c['name'].split('/')[-1], c.get('verificationStatus')) for c in json.load(sys.stdin).get('notificationChannels',[])]"
  ```
  The channel in the policy file is `16757130955440014131`; its
  `verificationStatus` must show `VERIFIED`.

### Verify by hand

Do this after any change to the monitor, and before believing an alert:

1. Confirm the endpoint still answers:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST \
     https://gym-progress-ai-lcherouri.web.app/__boot \
     -H 'Content-Type: text/plain' \
     --data '{"buildId":"manual-probe","stage":"boot","message":"manual"}'
   ```
   Expect `202`.

2. Confirm the metric is being written (an empty list means the check is not
   running, regardless of what the console shows):
   ```bash
   curl -s -H "Authorization: Bearer \$(gcloud auth print-access-token)" \
     "https://monitoring.googleapis.com/v3/projects/gym-progress-ai-lcherouri/timeSeries?filter=metric.type%3D%22monitoring.googleapis.com/uptime_check/check_passed%22"
   ```
   This project's `gcloud` does not expose `monitoring time-series list`, so use
   the REST endpoint directly. Look for `timeSeries` entries with
   `metric.type = monitoring.googleapis.com/uptime_check/check_passed` and
   `resource.labels.host = gym-progress-ai-lcherouri.web.app`.

3. Confirm the channel is `VERIFIED`:
   ```bash
   curl -s -H "Authorization: Bearer \$(gcloud auth print-access-token)" \
     "https://monitoring.googleapis.com/v3/projects/gym-progress-ai-lcherouri/notificationChannels" \
     | python3 -c "import json,sys; [print(c['name'].split('/')[-1], c.get('verificationStatus')) for c in json.load(sys.stdin).get('notificationChannels',[])]"
   ```
   The channel in the policy file is `16757130955440014131`; its
   `verificationStatus` must be `VERIFIED`, not `UNVERIFIED`. If it is
   unverified, click the link GCP emailed when the channel was created.

4. Confirm the policy exists and names the right channel:
   ```bash
   curl -s -H "Authorization: Bearer \$(gcloud auth print-access-token)" \
     "https://monitoring.googleapis.com/v3/projects/gym-progress-ai-lcherouri/alertPolicies" \
     | python3 -c "import json,sys; [print(p.get('displayName'), [n.split('/')[-1] for n in p.get('notificationChannels',[])]) for p in json.load(sys.stdin).get('alertPolicies',[])]"
   ```
   There should be a policy whose `displayName` is `boot-intake-liveness` and
   whose channel list includes `16757130955440014131`. If the list is empty, run
   `monitoring/provision.sh` — the check now has a data point, so the policy can
   be created.

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
