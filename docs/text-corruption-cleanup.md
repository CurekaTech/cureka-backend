# Text-corruption cleanup runner

The runner inspects `public.product_faqs`, `public.product_variants`, `public.products`, and `public.blog_posts`. Known UTF-8 / Windows-1252 mojibake is restored to the original Unicode character. Ambiguous leftovers are reported and left unchanged — never deleted. JSON/JSONB fields are traversed recursively through string values; object keys and non-string values are preserved. Updates are keyed by each table's primary key and guarded by the original field value inside a transaction.

The SQL scan and JavaScript repair share the detector from `text-corruption-repair.ts`. Apply explicitly serializes JSON and JSONB `before`/`after` values as JSON text before binding them, including root-level JSON strings; this avoids passing unquoted string contents to PostgreSQL's JSON parser. Updates and post-update verification remain in one transaction, and the committed success summary is printed only after `COMMIT` succeeds.

The runner requires an explicit `--dry-run` or `--apply` mode. It never creates, overwrites, restores, truncates, or deletes a backup or database.

## Remote target gate

Remote access is disabled unless all of these are set in the process environment:

```text
TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE=true
TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM=I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE
TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST=8.231.74.20
TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE=<exact database name from DATABASE_URL>
```

The host must match the runner's sole remote allowlist entry (`8.231.74.20`), and the database name parsed from `DATABASE_URL` must exactly match the expected database variable. Credentials belong only in `DATABASE_URL`; the runner does not print that URL. `TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL=true` grants no remote access.

Local dry-run remains available without an opt-in. Local apply separately requires `TEXT_CORRUPTION_CLEANUP_ALLOW_LOCAL=true`.

## Backup requirement for apply

Before apply, configure:

```text
TEXT_CORRUPTION_CLEANUP_BACKUP_PATH=<absolute path to the existing backup file>
```

The file must be a non-empty regular file with a modification time before the cleanup run. The runner executes `pg_restore --list <path>` and requires a custom-format archive whose recorded database name matches the selected database. This checks archive readability/listing only; it does **not** prove that a full restore will succeed. Do not overwrite or regenerate the backup as part of this procedure. Ensure the file is available on the machine running the script. For the backup reported on 23 October 2026, the supplied path was `/home/tech/cureka-db-backups-23-oct/cureka_full_backup_20261023.dump`; use it only if that exact artifact is present and validated on the runner host.

PostgreSQL client binaries should be compatible with the PostgreSQL 18.4 source. The Node `pg` package is used for the connection; `pg_restore` is used only with `--list`. Do not downgrade either client to work around an archive or server-version issue.

The `pg` dependency remains at the repository's installed version (`^8.12.0`); the runner uses its normal PostgreSQL wire-protocol connection and follows the app's `NODE_ENV=production` SSL setting. Use a PostgreSQL 18-compatible `pg_restore` binary to inspect the PostgreSQL 18.4 archive. This tool does not perform a restore or claim that the archive is fully restorable.

## Operator procedure

1. Confirm the intended host and exact database name independently. Do not assume that a remote endpoint is safe because it is reachable; do not run automatically against production or beta.
2. Set the remote gate variables above and supply the database credential only through `DATABASE_URL` in the environment.
3. Run the dry-run command below. Review candidate counts grouped by table and column, the limited primary-key references, the before/after field samples, and any unresolved review items. Save the printed preview ID.
4. Verify the backup path, size, timestamp, and successful `pg_restore --list` result. A restore rehearsal in a separately approved scratch database is recommended when full restorability must be established; this runner never performs that restore.
5. Obtain human approval for the exact host/database, preview counts, preview ID, and backup artifact.
6. For apply, set `TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET` to `<host>/<database>` and `TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW` to the preview ID. Apply performs a fresh scan and refuses to write if the scan's fingerprint differs. Review that fresh preview before accepting the command's guarded apply.
7. Save the logs and verify the transaction summary. On any failed row-level comparison or post-update scan, the transaction rolls back.

Dry-run command template:

```bash
TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE=true \
TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM=I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE \
TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST=8.231.74.20 \
TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE='<exact-db-name>' \
npm run db:text-corruption:dry-run
```

Apply command template:

```bash
TEXT_CORRUPTION_CLEANUP_ALLOW_REMOTE=true \
TEXT_CORRUPTION_CLEANUP_REMOTE_CONFIRM=I_UNDERSTAND_THIS_IS_REMOTE_CUREKA_DATABASE \
TEXT_CORRUPTION_CLEANUP_EXPECTED_HOST=8.231.74.20 \
TEXT_CORRUPTION_CLEANUP_EXPECTED_DATABASE='<exact-db-name>' \
TEXT_CORRUPTION_CLEANUP_BACKUP_PATH='<absolute-existing-dump-path>' \
TEXT_CORRUPTION_CLEANUP_CONFIRM_TARGET='8.231.74.20/<exact-db-name>' \
TEXT_CORRUPTION_CLEANUP_CONFIRM_PREVIEW='<preview-id-from-reviewed-dry-run>' \
npm run db:text-corruption:apply
```

The apply command is a template only. Do not run it until the backup and preview have been reviewed and the target has been approved.

Any separately approved production or beta operation requires its own backup from that exact target and independent review. A local or test database backup does not authorize production or beta changes.
