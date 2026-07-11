# Custom Millwork Studio release-session notes

Copy this template into the secure, ignored `release-evidence-private/<rc-id>/<row-id>/`
directory for each observed row. Do not record participant names, credentials, private
keys, access tokens, or other unnecessary personal data.

## Release candidate

- RC ID:
- Commit SHA:
- Environment:
- Base URL:

## Evidence row

- Category (`scenario`, `template`, or `gate`):
- Row ID:
- Evidence kind:
- Outcome (`pass` or `fail`):

## Participant and consent

- Pseudonymous participant ID:
- Participant profile (`first_time`, `intermediate`, `professional`, or `returning`):
- First time with this template (`yes`, `no`, or `not applicable`):
- Recording consent confirmed:
- External/developer instructions used (`no` is required where applicable):

## Observer

- Name:
- Role:
- Organization:

## Device

- Device label and category:
- Operating system and version:
- Browser and version:
- Viewport width × height:
- Device scale factor:
- Assistive technology and version, if applicable:

## Timing

- Started at, ISO 8601 with offset:
- Completed at, ISO 8601 with offset:
- Elapsed seconds:

## Observed criteria

List every exact validator criterion ID completed during this row:

-

## Session account

- Tasks completed:
- Result notes (minimum ten characters):
- Hesitations, including timestamp or step:
- Unexpected behavior:

## Findings

For every finding, record:

- Severity (`critical`, `high`, `medium`, or `low`):
- Summary:
- Disposition (`open`, `resolved`, or `waived`):
- Durable HTTPS or `issue:` reference, when required:
- Product-owner waiver owner, role, rationale, and timestamp, if waived:

## Source artifacts

Finalize files before hashing. Do not edit them after recording the digest.

- Screen recording local path:
- Screen recording SHA-256:
- Session-notes local path:
- Session-notes SHA-256:
- Other required artifact kind/path/SHA-256:

Hash command:

```bash
shasum -a 256 path/to/finalized-artifact
```

## Observer attestation

- Actual frozen release-candidate run: yes
- Not derived from static, unit, fixture, or AI-generated evidence: yes
- Signed by (must exactly match observer name):
- Signed at, ISO 8601 with offset (must be at or after completion):
