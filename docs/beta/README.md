# Private beta scorecard

Use this offline tool for the B07 operating review, after requirements and
voluntary check-in consent are agreed. It sends nothing and creates no tester
records. It is not telemetry, recruitment, a working support inbox or proof of
activation. Keep the source JSON and contact registry outside the repository.

```sh
node tools/beta-scorecard.mjs /absolute/private/cohort.json 2026-10-12T00:00:00Z
node --experimental-strip-types --test tools/beta-scorecard.test.mts
```

Output contains aggregate counts/rates only. Input is limited to 1 MiB and
1,000 historical households. Use one pseudonymous ID per installation/household,
8–64 lowercase letters, digits, underscores or hyphens. Two devices are one
household. Never use names, email addresses, paths, IPs or library titles here.
The tool rejects extra fields, duplicate IDs, impossible/future dates and
inconsistent ordering. Keep source data private even when publishing aggregates;
small cohorts can still identify people. Sharing any results requires review.

A synthetic shape example, **not an actual tester or approved consent text**:

```json
{
  "format": "synamp.beta-cohort/1",
  "households": [{
    "id": "sample_0001",
    "eligible": true,
    "consent_version": "approved-checkin-version",
    "consent_at": "2026-10-01T09:00:00Z",
    "attempt_at": "2026-10-01T10:00:00Z",
    "completed_at": "2026-10-01T11:00:00Z",
    "assisted": false,
    "smart_playlist_at": "2026-10-01T12:00:00Z",
    "ten_minutes_at": "2026-10-01T12:10:00Z",
    "w4_active_at": null,
    "w4_checked_at": null
  }]
}
```

Dates use UTC ISO timestamps (`YYYY-MM-DDTHH:mm:ssZ`, optionally three fractional
digits). Supply an explicit as-of timestamp for repeatable reporting. All input
events must already have occurred by that time; use a historical snapshot for an
earlier as-of report. Record consent for voluntary product check-ins separately
from launch-email, quotes, recordings and publication permission. The consent
version/date are a receipt reference, not a replacement for that process.

| Field | Meaning |
|---|---|
| `eligible` | Meets the candidate's current hardware/library requirements; retain ineligible records separately in totals |
| `attempt_at` | Start of an eligible cold-install attempt; never remove failures or abandonment |
| `completed_at` | Installation completion, or absent/null if not completed |
| `assisted` | true for live rescue/help, false for known unassisted, null for unknown; required even for incomplete attempts |
| `smart_playlist_at` | First supported smart playlist generated after installation, or absent/null |
| `ten_minutes_at` | Actual time reaching ten minutes of playback from that playlist; a manual playlist or merely pressing Play does not qualify |
| `w4_active_at` | A confirmed meaningful Brain interaction or ≥10-minute listening event in activation days 22–28; absent/null when unknown or none |
| `w4_checked_at` | Date of a completed follow-up covering the full W4 window; absent/null for no reply. With no active event, this explicitly means confirmed inactive |

Install success uses all eligible attempts aged seven days, and counts only
unassisted completions within their seven-day window. Assisted and
unknown-assistance completions stay separate. Activation uses all completed
eligible installs aged 72 hours; analysis wait is included. Only a supported
playlist plus ten minutes of playback within those 72 hours qualifies. Late
results and missing observations are reported separately; zero denominators
produce `null`, not a fabricated 0% rate.

For reproducible W4 arithmetic, day 1 is the first elapsed 24 hours from
activation. Days 22–28 are `[activation + 21 days, activation + 28 days)`;
wait until the complete 28-day window has elapsed before counting the household
in retention. A confirmed in-window activity is retained, a completed follow-up
with no activity is inactive, and no evidence is missing. Report confirmed/all
matured, retained/respondents and response coverage together. Six retained,
two inactive and two missing means 60% confirmed, 75% among respondents and
80% response coverage. Do not drop the two missing households.

The tool covers install, activation and W4 only. Track support minutes, issue
severity, eligibility/build details, first sync, recruitment/source, permission,
offer exposure, sales/refunds and deletion requests separately in the private
operating record described in [measurement and economics](../business/measurement-and-economics.md).
No retention/deletion policy, legal terms or support availability is approved by
this tool. No actual customer cohorts or release gates are claimed complete.
