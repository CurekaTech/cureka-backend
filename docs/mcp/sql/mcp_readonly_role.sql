-- =============================================================================
-- mcp_readonly — read-only, PII-masked PostgreSQL role for the MCP analysis agent
-- -----------------------------------------------------------------------------
-- Run as a Cloud SQL admin (member of cloudsqlsuperuser), connected to the
-- application database:
--
--   psql "host=127.0.0.1 port=5432 dbname=<app_db> user=postgres sslmode=disable" \
--     -v mcp_password="$(openssl rand -base64 24)" \
--     -f docs/mcp/sql/mcp_readonly_role.sql
--
-- Idempotent. Re-run after migrations that add tables or columns: new tables
-- are NOT readable until this runs again (on purpose — it re-applies masking).
--
-- Read-only guarantees, strongest first:
--   1. Only SELECT is granted. No INSERT/UPDATE/DELETE/TRUNCATE on anything.
--   2. default_transaction_read_only = on (a session could turn this off, so
--      it is defence in depth, not the guarantee).
--   3. statement_timeout / lock_timeout / connection limit so an expensive
--      agent query cannot hurt production.
-- Prefer pointing the agent at a read replica when one exists.
-- =============================================================================

\set ON_ERROR_STOP on

-- ── 1. Role ──────────────────────────────────────────────────────────────────
SELECT format('CREATE ROLE mcp_readonly LOGIN PASSWORD %L', :'mcp_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_readonly')
\gexec

ALTER ROLE mcp_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  CONNECTION LIMIT 3 PASSWORD :'mcp_password';
ALTER ROLE mcp_readonly SET default_transaction_read_only = on;
ALTER ROLE mcp_readonly SET statement_timeout = '15s';
ALTER ROLE mcp_readonly SET lock_timeout = '2s';
ALTER ROLE mcp_readonly SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE mcp_readonly SET application_name = 'mcp-analysis-agent';

SELECT format('GRANT CONNECT ON DATABASE %I TO mcp_readonly', current_database())
\gexec
GRANT USAGE ON SCHEMA public TO mcp_readonly;

-- ── 2. Stats views (pg_stat_activity, pg_stat_statements, locks) ─────────────
-- pg_monitor lets the agent see other sessions' queries and pg_stat_statements.
DO $$
BEGIN
  EXECUTE 'GRANT pg_monitor TO mcp_readonly';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Could not grant pg_monitor (%). Query/lock diagnostics will be limited.', SQLERRM;
END $$;

-- pg_stat_statements powers "slowest queries" analysis. Needs to exist once.
DO $$
BEGIN
  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_stat_statements not enabled (%).', SQLERRM;
END $$;

-- ── 3. Table grants with PII column masking ──────────────────────────────────
-- Columns whose name matches this pattern are never readable. Tables that
-- contain a matching column get a column-level grant for every OTHER column;
-- all other tables get a plain SELECT grant.
--
-- Covers users/user_addresses/orders guest fields, OTP codes, session and
-- claim tokens, bank details and raw gateway payloads (which carry phone and
-- address). sanitized_payload is intentionally readable (already scrubbed).
DO $$
DECLARE
  pii_pattern constant text :=
    '^(email|guest_email|mobile_number|phone_number|phone|first_name|last_name|full_name'
    '|guest_name|recipient_name|account_holder_name|address|address_line1|address_line2'
    '|landmark|date_of_birth|ip_address|otp_code|password|password_hash|refresh_token_hash'
    '|claim_token|process_token|masked_account_number|bank_account_number_encrypted|ifsc|utr'
    '|provider_payload|payload_snapshot)$';
  -- Tables the agent never needs.
  denied_tables constant text[] := ARRAY['otp_logs', 'user_sessions'];
  t record;
  safe_cols text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM mcp_readonly', t.relname);

    CONTINUE WHEN t.relname = ANY (denied_tables);

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.relname
        AND column_name ~ pii_pattern
    ) THEN
      SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinal_position)
      INTO safe_cols
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.relname
        AND column_name !~ pii_pattern;

      IF safe_cols IS NOT NULL THEN
        EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO mcp_readonly', safe_cols, t.relname);
      END IF;
    ELSE
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO mcp_readonly', t.relname);
    END IF;
  END LOOP;
END $$;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT r.rolname,
       r.rolconnlimit,
       r.rolconfig,
       (SELECT count(*) FROM information_schema.role_table_grants g
         WHERE g.grantee = 'mcp_readonly' AND g.privilege_type <> 'SELECT') AS non_select_grants
FROM pg_roles r
WHERE r.rolname = 'mcp_readonly';

-- Expected: non_select_grants = 0.
-- Masked columns (should list only PII):
SELECT table_name, string_agg(column_name, ', ') AS masked_columns
FROM information_schema.columns c
WHERE table_schema = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges p
    WHERE p.grantee = 'mcp_readonly' AND p.table_schema = 'public'
      AND p.table_name = c.table_name AND p.column_name = c.column_name
  )
GROUP BY table_name
ORDER BY table_name;
