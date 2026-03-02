-- Enable real-time for scan_logs table securely

-- Set Replica Identity so DELETE/UPDATE events send the full row content if needed
alter table "public"."scan_logs" replica identity full;

-- Safely add to the publication without dropping it
DO $$
BEGIN
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'scan_logs'
    ) then
        alter publication supabase_realtime add table "public"."scan_logs";
    end if;
END
$$;
