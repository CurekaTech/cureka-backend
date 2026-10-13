# Development release email

A Word playbook is emailed only when a pull request is merged into the `development` branch on GitHub. The workflow is `.github/workflows/development-release-note.yml`.

A local merge does not send this email. A merge into `feature/PR_review`, or any branch other than `development`, does not send it either.

The workflow file that runs is the copy already on `development`. Names added in this document take effect after that change is merged into `development`.

## Settings

The local `.env` names and the GitHub Actions names are the same credentials. GitHub does not read `.env`. Put the same values under the GitHub names.

| Local `.env` | GitHub Actions | Where it goes | Purpose |
| --- | --- | --- | --- |
| `SMTP_HOST` | `RELEASE_EMAIL_HOST` | Variable | SMTP server address |
| `SMTP_PORT` | `RELEASE_EMAIL_PORT` | Variable | SMTP port, commonly `587` for STARTTLS |
| `SMTP_USER` | `RELEASE_EMAIL_USER` | Variable | Email account used to send the message |
| `SMTP_FROM` | `RELEASE_EMAIL_FROM` | Variable | Approved sender address |
|  | `RELEASE_EMAIL_TO` | Variable | Recipient email addresses, separated by commas |
| `SMTP_PASS` | `RELEASE_EMAIL_PASSWORD` | Secret | SMTP password or app-specific password |
| `SMTP_SECURE` | `SMTP_SECURE` | Variable, optional | `true` only for implicit TLS, usually port `465` |

Set these on the GitHub repository: Settings → Secrets and variables → Actions. Do not put the password in the repository or in a Variable.

`RELEASE_EMAIL_PORT` may be left empty. The sender uses `587`. Leave `SMTP_SECURE` empty for port `587`.

For Gmail, use host `smtp.gmail.com`, port `587`, and a Google app password as `RELEASE_EMAIL_PASSWORD`. `RELEASE_EMAIL_FROM` must be the same Gmail address as `RELEASE_EMAIL_USER`.

If a GitHub Variable or Secret is already stored under the local name (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM`, or Secret `SMTP_PASS`), the workflow uses that when the `RELEASE_EMAIL_*` name is empty.

Set Variable `RELEASE_EMAIL_ENABLED` to the string `false` to stop sending without deleting the other settings. Any other value, including leaving it unset, allows sending when the table above is complete.

## What gets sent

The message has the playbook `release-note.docx` attached. It is a development review note. It is not approval to deploy to production.

If a required setting is missing, the workflow still uploads the playbook and writes `email-status.txt` in the Actions artifact. That file names the missing setting. No SMTP connection is opened.

The same merge commit is not emailed a second time.

## If no email arrives

1. Confirm the pull request was merged into `development` on GitHub, not only merged locally or into another branch.
2. Confirm the six settings above are on that repository, and that the password is a Secret rather than a Variable.
3. Open the Actions run named "Development release note" and read `email-status.txt`.
4. Confirm this workflow change is on the `development` branch. Until it is, GitHub still runs the previous workflow file from `development`.
