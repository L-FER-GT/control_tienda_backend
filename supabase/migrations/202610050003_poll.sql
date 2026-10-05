-- Conditional polling avoids retransmitting unchanged catalogs on Free egress.
-- Both RPCs execute as the caller, so RLS is reapplied on EVERY poll, even if the
-- caller presents an old etag after a membership change.
create function public.ct_poll(query jsonb, etag text default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb; version text;
begin
 rows:=public.ct_query(query);
 version:=md5(rows::text);
 return jsonb_build_object('etag',version,'rows',case when version=etag then null else rows end);
end $$;
revoke all on function public.ct_poll(jsonb,text) from public,anon;
grant execute on function public.ct_poll(jsonb,text) to authenticated;
