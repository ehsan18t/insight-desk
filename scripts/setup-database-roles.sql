-- InsightDesk Database Roles Setup
-- Run this script as a superuser after creating the database
-- This script sets up roles required for Row-Level Security (RLS)

-- ═══════════════════════════════════════════════════════════════════════════
-- CREATE ROLES
-- ═══════════════════════════════════════════════════════════════════════════

-- app_user: Main application role that respects RLS policies
-- Used by withTenant() for tenant-scoped queries
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user WITH LOGIN;
        RAISE NOTICE 'Created role: app_user';
    ELSE
        RAISE NOTICE 'Role already exists: app_user';
    END IF;
END
$$;

-- service_role: Background jobs and admin operations that bypass RLS
-- Used by adminDb for cross-tenant operations like SLA checks
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role WITH LOGIN BYPASSRLS;
        RAISE NOTICE 'Created role: service_role';
    ELSE
        -- Ensure BYPASSRLS is set
        ALTER ROLE service_role BYPASSRLS;
        RAISE NOTICE 'Role already exists, ensured BYPASSRLS: service_role';
    END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT ROLES TO MAIN USER
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow the main database user to switch to app_user via SET ROLE
-- Replace 'insightdesk' with your actual database user if different
DO $$
BEGIN
    EXECUTE 'GRANT app_user TO insightdesk';
    RAISE NOTICE 'Granted app_user to insightdesk';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant app_user to insightdesk: %', SQLERRM;
END
$$;

DO $$
BEGIN
    EXECUTE 'GRANT service_role TO insightdesk';
    RAISE NOTICE 'Granted service_role to insightdesk';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not grant service_role to insightdesk: %', SQLERRM;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT TABLE PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Grant schema access
GRANT USAGE ON SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant table permissions to app_user (respects RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Grant table permissions to service_role (bypasses RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure future tables also get permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE ON SEQUENCES TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

-- Show created roles and their attributes
SELECT 
    rolname,
    rolsuper,
    rolinherit,
    rolcreaterole,
    rolcreatedb,
    rolcanlogin,
    rolbypassrls
FROM pg_roles 
WHERE rolname IN ('app_user', 'service_role', 'insightdesk')
ORDER BY rolname;
