create function public.ct_call(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u text:=auth.uid()::text; p text; d jsonb; inv jsonb; member jsonb; profile jsonb;
 s text:=payload->>'storeId'; target text:=payload->>'uid'; status text; t bigint:=private.millis(); bytes bigint;
begin
 perform private.require(private.enabled(),'Cuenta no autenticada o deshabilitada');
 perform pg_advisory_xact_lock(740105);
 if action='bootstrapUser' then
  select private.bootstrap(id,email,coalesce(payload->>'displayName',raw_user_meta_data->>'displayName'),
   coalesce((raw_app_meta_data->>'superadmin')::boolean,false)) into d from auth.users where id=auth.uid();
  return d;
 elsif action='respondInvitation' then
  p:='stores/'||s||'/invitations/'||(payload->>'invitationId'); inv:=private.doc(p);
  perform private.require(inv is not null and inv->>'toUid'=u,'Invitación no disponible');
  status:=case when (payload->>'accept')::boolean then 'accepted' else 'rejected' end;
  if inv->>'status'=status then return jsonb_build_object('status',status); end if;
  perform private.require(inv->>'status'='pending','La invitación ya fue respondida o cancelada');
  perform private.require(private.doc('stores/'||s) is not null and not coalesce((private.doc('stores/'||s)->>'disabledBySystem')::boolean,false),'Tienda deshabilitada');
  -- Recheck inviter's current authority, rather than trusting an old invitation.
  member:=private.doc('stores/'||s||'/members/'||(inv->>'fromUid'));
  perform private.require(member->'active'='true'::jsonb and (member->>'role'='owner' or
   (member->>'role'='employee' and member->'permissions' ? 'members')),'El remitente ya no puede invitar');
  profile:=private.doc('publicProfiles/'||u);
  if status='accepted' then
   member:=private.doc('stores/'||s||'/members/'||u);
   perform private.require(coalesce(member->>'role','')<>'owner','Ya eres propietario');
   perform private.put('stores/'||s||'/members/'||u,jsonb_build_object('uid',u,'role',inv->>'role','active',true,
    'permissions',case when member->>'role'='employee' and inv->>'role'='employee' then member->'permissions' else '[]'::jsonb end,
    'displayName',profile->>'displayName','photoPath',profile->'photoPath','code',profile->>'code',
    'joinedAt',coalesce(member->'joinedAt',to_jsonb(t)),'updatedAt',t));
  end if;
  perform private.put(p,inv||jsonb_build_object('status',status,'respondedAt',t));
  p:='users/'||u||'/notifications/'||(payload->>'invitationId');
  perform private.put(p,coalesce(private.doc(p),'{}')||jsonb_build_object('invitationStatus',status,'read',true));
  perform private.put('users/'||(inv->>'fromUid')||'/notifications/response_'||(payload->>'invitationId'),jsonb_build_object(
   'type','invitation_response','title','Respuesta a invitación','body',(profile->>'displayName')||case when status='accepted' then ' aceptó tu invitación' else ' rechazó tu invitación' end,
   'fromUid',u,'fromName',profile->>'displayName','storeId',s,'read',false,'createdAt',t));
  return jsonb_build_object('status',status);
 elsif action='deleteAccount' then
  update public.documents set data=data||jsonb_build_object('isPublic',false,'disabledBySystem',true,'deletedAt',t)
   where path ~ '^stores/[^/]+$' and data->>'ownerId'=u;
  insert into private.file_cleanup(path) select name from storage.objects where bucket_id='media' and name like 'users/'||u||'/%' on conflict do nothing;
  delete from public.documents where path='publicProfiles/'||u or path='users/'||u or path like 'users/'||u||'/%'
   or (path ~ '^userCodes/[^/]+$' and data->>'uid'=u)
   or (path ~ '^stores/[^/]+/members/[^/]+$' and data->>'uid'=u);
  -- Storage ownership is metadata, files remain queued for API cleanup.
  update storage.objects set owner=null, owner_id=null where owner_id=u;
  delete from auth.users where id=auth.uid();
  return '{"ok":true}';
 end if;
 perform private.require(private.is_super(),'Solo el administrador del sistema');
 if action='adminSetUserDisabled' then
  perform private.require(target<>u,'No puedes deshabilitar tu propia cuenta');
  perform private.require(private.doc('users/'||target) is not null,'Usuario no encontrado');
  update auth.users set banned_until=case when (payload->>'disabled')::boolean then 'infinity'::timestamptz else null end where id=target::uuid;
  update public.documents set data=data||jsonb_build_object('disabled',(payload->>'disabled')::boolean,'updatedAt',t)
   where path in ('users/'||target,'publicProfiles/'||target);
 elsif action='adminSetStoreDisabled' then
  perform private.require(private.doc('stores/'||s) is not null,'Tienda no encontrada');
  perform private.put('stores/'||s,private.doc('stores/'||s)||jsonb_build_object('disabledBySystem',(payload->>'disabled')::boolean,'updatedAt',t));
 elsif action='adminGetUsage' then
  select coalesce(sum((metadata->>'size')::bigint),0) into bytes from storage.objects where bucket_id='media';
  return jsonb_build_object('source','supabase','generatedAt',t,'metrics',jsonb_build_array(
   jsonb_build_object('key','database_bytes','label','Base de datos (tamaño total)','used',pg_database_size(current_database()),'limit',500000000,'unit','bytes','period','TOTAL'),
   jsonb_build_object('key','storage_bytes','label','Archivos guardados','used',bytes,'limit',1000000000,'unit','bytes','period','TOTAL')));
 else raise exception 'Acción desconocida'; end if;
 return '{"ok":true}';
end $$;

-- A private bucket: invoice photos are never public. Limit matches Android.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('media','media',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create function private.storage_allowed(p text, writing boolean) returns boolean language plpgsql stable security definer
set search_path = '' as $$ declare a text[]:=string_to_array(p,'/'); begin
 if not private.enabled() then return false; end if;
 if a[1]='users' and array_length(a,1)=3 then return not writing or a[2]=auth.uid()::text; end if;
 if a[1]<>'stores' or array_length(a,1)<>4 then return false; end if;
 if not writing then
  return case when a[3]='receptions' then private.can(a[2],'receptions') or private.can(a[2],'reports')
   when a[3] in ('store','products','categories') then private.visible(a[2]) else false end;
 end if;
 if coalesce((private.doc('stores/'||a[2])->>'disabledBySystem')::boolean,false) then return false; end if;
 return case a[3] when 'store' then private.can(a[2],'edit_store') when 'categories' then private.can(a[2],'manage_categories')
  when 'products' then private.can(a[2],'manage_products') or private.can(a[2],'receptions')
  when 'receptions' then private.can(a[2],'receptions') else false end;
end $$;
create policy media_read on storage.objects for select to authenticated using(bucket_id='media' and private.storage_allowed(name,false));
create policy media_insert on storage.objects for insert to authenticated with check(bucket_id='media' and private.storage_allowed(name,true));
create policy media_update on storage.objects for update to authenticated using(bucket_id='media' and private.storage_allowed(name,true)) with check(bucket_id='media' and private.storage_allowed(name,true));

-- Only maintenance with service_role can inspect/acknowledge the cleanup queue.
create function public.ct_cleanup_files(completed text[] default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 delete from private.file_cleanup where path=any(completed);
 return (select coalesce(jsonb_agg(path),'[]') from (select path from private.file_cleanup order by created_at limit 100) q);
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.readable(text,jsonb), private.matches(jsonb,jsonb), private.storage_allowed(text,boolean) to authenticated;
revoke all on function public.ct_commit(uuid,jsonb),public.ct_query(jsonb),public.ct_call(text,jsonb),public.ct_cleanup_files(text[]) from public,anon,authenticated;
grant execute on function public.ct_commit(uuid,jsonb),public.ct_query(jsonb),public.ct_call(text,jsonb) to authenticated;
grant execute on function public.ct_cleanup_files(text[]) to service_role;
grant all on public.documents to service_role;
