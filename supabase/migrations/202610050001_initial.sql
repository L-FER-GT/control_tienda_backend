-- Supabase-only backend. JSONB preserves the app's domain documents; all writes
-- pass through a validated, atomic RPC. The private schema is NOT exposed by API.
create schema if not exists private;
revoke all on schema private from public;
create table public.documents (
  path text primary key check (length(path) <= 700),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create index documents_parent on public.documents ((regexp_replace(path, '/[^/]+$', '')));
create index documents_data on public.documents using gin(data);
create table private.receipts (
  uid uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null, operations jsonb not null,
  created_at timestamptz not null default now(), primary key(uid, operation_id)
);
create table private.file_cleanup (path text primary key, created_at timestamptz default now());
alter table public.documents enable row level security;
revoke all on public.documents from anon, authenticated;
grant select on public.documents to authenticated;

create function private.millis() returns bigint language sql volatile
set search_path = '' as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;
create function private.doc(p text) returns jsonb language sql stable security definer
set search_path = '' as $$ select data from public.documents where path = p $$;
create function private.enabled() returns boolean language sql stable security definer
set search_path = '' as $$ select auth.uid() is not null and exists (
 select 1 from auth.users where id = auth.uid() and (banned_until is null or banned_until < now())
) and not coalesce((private.doc('users/' || auth.uid()) ->> 'disabled')::boolean, false) $$;
create function private.is_super() returns boolean language sql stable security definer
set search_path = '' as $$ select private.enabled() and coalesce(
 (select (raw_app_meta_data ->> 'superadmin')::boolean from auth.users where id = auth.uid()), false) $$;
create function private.member(s text) returns jsonb language sql stable security definer
set search_path = '' as $$ select private.doc('stores/' || s || '/members/' || auth.uid()) $$;
create function private.can(s text, permission text) returns boolean language sql stable security definer
set search_path = '' as $$ select private.enabled() and coalesce((private.member(s)->>'active')::boolean, false)
 and (private.member(s)->>'role' = 'owner' or
 (private.member(s)->>'role' = 'employee' and (permission = 'staff' or private.member(s)->'permissions' ? permission))) $$;
create function private.visible(s text) returns boolean language sql stable security definer
set search_path = '' as $$ select private.enabled() and (private.is_super() or
 coalesce((private.doc('stores/' || s)->>'isPublic')::boolean, false) or
 coalesce((private.member(s)->>'active')::boolean, false)) $$;
create function private.readable(p text, d jsonb) returns boolean language plpgsql stable security definer
set search_path = '' as $$
declare a text[] := string_to_array(p, '/'); s text := a[2];
begin
 if not private.enabled() then return false; end if;
 if a[1] = 'users' then return s = auth.uid()::text or (array_length(a,1)=2 and private.is_super()); end if;
 if a[1] in ('publicProfiles', 'userCodes') then return array_length(a,1)=2; end if;
 if a[1] <> 'stores' then return false; end if;
 if array_length(a,1)=2 then return private.visible(s); end if;
 return case a[3]
  when 'members' then a[4] = auth.uid()::text or private.can(s,'members') or private.is_super()
  when 'invitations' then d->>'toUid'=auth.uid()::text or private.can(s,'members')
  when 'categories' then private.visible(s)
  when 'products' then case when array_length(a,1)=4 then private.visible(s)
    else private.can(s,'manage_products') or private.can(s,'reports') end
  when 'orders' then private.is_super() or private.can(s,'reports') or
    (d->>'createdBy'=auth.uid()::text and private.can(s,'staff'))
  when 'suppliers' then private.can(s,'suppliers') or private.can(s,'receptions') or private.can(s,'reports')
  when 'receptions' then private.can(s,'receptions') or private.can(s,'reports')
  else false end;
end $$;
create policy documents_read on public.documents for select to authenticated using (private.readable(path,data));

create function private.put(p text, d jsonb) returns void language sql security definer
set search_path = '' as $$ insert into public.documents(path,data) values(p,d)
 on conflict(path) do update set data=excluded.data, updated_at=now() $$;
create function private.require(ok boolean, message text default 'Sin permiso') returns void language plpgsql
set search_path = '' as $$ begin if ok is distinct from true then raise exception '%', message using errcode='42501'; end if; end $$;
create function private.valid_text(d jsonb, k text, max_len integer) returns boolean language sql immutable
set search_path = '' as $$ select jsonb_typeof(d->k)='string' and length(btrim(d->>k)) between 1 and max_len $$;
create function private.money(v jsonb) returns boolean language sql immutable
set search_path = '' as $$ select coalesce(jsonb_typeof(v)='number' and v::text ~ '^[0-9]+$', false) $$;
create function private.changed_only(old jsonb, new jsonb, keys text[]) returns boolean language sql immutable
set search_path = '' as $$ select (old - keys) = (new - keys) $$;

create function private.bootstrap(u uuid, email text, name text, superadmin boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d jsonb; code text; t bigint := private.millis();
begin
 d := private.doc('users/'||u);
 if d is not null then return d || jsonb_build_object('uid',u); end if;
 loop
  code := lpad(floor(random()*10000000000)::bigint::text,10,'0');
  exit when private.doc('userCodes/'||code) is null;
 end loop;
 name := left(coalesce(nullif(btrim(name),''),split_part(email,'@',1),'Usuario'),80);
 d := jsonb_build_object('displayName',name,'email',email,'phone',null,'photoPath',null,
  'code',code,'isSuperadmin',superadmin,'disabled',false,'createdAt',t,'updatedAt',t);
 perform private.put('users/'||u,d);
 perform private.put('publicProfiles/'||u,jsonb_build_object('displayName',name,'displayNameLower',lower(name),
  'photoPath',null,'code',code,'disabled',false,'updatedAt',t));
 perform private.put('userCodes/'||code,jsonb_build_object('uid',u,'createdAt',t));
 return d || jsonb_build_object('uid',u);
end $$;
create function private.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 perform pg_advisory_xact_lock(740105);
 perform private.bootstrap(new.id,new.email,coalesce(new.raw_user_meta_data->>'displayName',new.raw_user_meta_data->>'full_name'),
  coalesce((new.raw_app_meta_data->>'superadmin')::boolean,false));
 return new;
end $$;
create trigger ct_signup after insert on auth.users for each row execute function private.on_signup();

-- Server-authoritative stock, reception deltas, invitations, profile propagation.
create function private.effects(p text, old jsonb, d jsonb) returns jsonb language plpgsql security definer
set search_path = '' as $$
declare a text[]:=string_to_array(p,'/'); s text:=a[2]; item jsonb; product jsonb; product_path text;
 id text; qty numeric; cost jsonb; previous_cost jsonb; seq bigint; t bigint:=private.millis();
begin
 if a[1]='stores' and a[3]='orders' and old is null then
  seq:=coalesce((private.doc('stores/'||s||'/meta/counters')->>'orderSeq')::bigint,0)+1;
  perform private.put('stores/'||s||'/meta/counters',jsonb_build_object('orderSeq',seq));
  for item in select value from jsonb_array_elements(d->'items') loop
   if item->>'productId' is not null and not coalesce((item->>'manual')::boolean,false) then
    product_path:='stores/'||s||'/products/'||(item->>'productId'); product:=private.doc(product_path);
    if jsonb_typeof(product->'stock')='number' then
     perform private.put(product_path,product||jsonb_build_object('stock',round((product->>'stock')::numeric-(item->>'quantity')::numeric,3),'updatedAt',t));
    end if;
   end if;
  end loop;
  d:=d||jsonb_build_object('number',seq,'status','confirmed','stockApplied',true,'syncedAt',t);
 elsif a[1]='stores' and a[3]='receptions' then
  for id in select distinct v->>'productId' from (
   select value v from jsonb_array_elements(coalesce(old->'lines','[]'))
   union all select value v from jsonb_array_elements(coalesce(d->'lines','[]'))) items loop
   select coalesce(sum((v->>'quantity')::numeric),0) into qty from jsonb_array_elements(coalesce(d->'lines','[]')) v where v->>'productId'=id;
   select qty-coalesce(sum((v->>'quantity')::numeric),0) into qty from jsonb_array_elements(coalesce(old->'lines','[]')) v where v->>'productId'=id;
   product_path:='stores/'||s||'/products/'||id; product:=private.doc(product_path);
   if product is null then continue; end if;
   if jsonb_typeof(product->'stock')='number' then product:=product||jsonb_build_object('stock',round((product->>'stock')::numeric+qty,3)); end if;
   select v->'unitCostCents' into cost from jsonb_array_elements(coalesce(d->'lines','[]')) with ordinality x(v,n) where v->>'productId'=id order by n desc limit 1;
   select v->'unitCostCents' into previous_cost from jsonb_array_elements(coalesce(old->'lines','[]')) with ordinality x(v,n) where v->>'productId'=id order by n desc limit 1;
   if jsonb_typeof(cost)='number' and cost is distinct from previous_cost and cost is distinct from product->'purchaseCostCents' then
    product:=product||jsonb_build_object('purchaseCostCents',cost);
    perform private.put(product_path||'/priceHistory/'||gen_random_uuid(),jsonb_build_object('salePriceCents',product->'salePriceCents',
     'purchaseCostCents',cost,'source','reception','refId',a[4],'changedBy',auth.uid(),'changedByName',d->>'updatedByName','at',t));
   end if;
   perform private.put(product_path,product||jsonb_build_object('updatedAt',t));
  end loop;
 elsif a[1]='stores' and a[3]='invitations' then
  if old is null then
   perform private.put('users/'||(d->>'toUid')||'/notifications/'||a[4],jsonb_build_object('type','invitation','title','Invitación a tienda',
    'body',(d->>'fromName')||' te invita a '||(d->>'storeName'),'fromUid',d->>'fromUid','fromName',d->>'fromName',
    'storeId',s,'invitationId',a[4],'invitationStatus','pending','read',false,'createdAt',t));
  else
   product_path:='users/'||(d->>'toUid')||'/notifications/'||a[4];
   perform private.put(product_path,coalesce(private.doc(product_path),'{}')||jsonb_build_object('invitationStatus',d->>'status'));
  end if;
 elsif a[1]='publicProfiles' and array_length(a,1)=2 then
  update public.documents set data=data||jsonb_build_object('displayName',d->>'displayName','photoPath',d->'photoPath'),updated_at=now()
   where path ~ '^stores/[^/]+/members/[^/]+$' and data->>'uid'=a[2];
 end if;
 -- Queue replaced files. A maintenance script deletes them through Storage API, never SQL.
 for id in select value from jsonb_array_elements_text(
  coalesce(old->'invoicePhotos','[]') || case when old->>'photoPath' is not null then jsonb_build_array(old->>'photoPath') else '[]'::jsonb end)
 loop
  if not coalesce(d->'invoicePhotos','[]') ? id and (d->>'photoPath') is distinct from id then
   insert into private.file_cleanup(path) values(id) on conflict do nothing;
  end if;
 end loop;
 return d;
end $$;

create function private.apply(p text, kind text, patch jsonb) returns void language plpgsql security definer
set search_path = '' as $$
declare a text[]:=string_to_array(p,'/'); s text:=a[2]; old jsonb:=private.doc(p); d jsonb;
 deleting boolean:=kind='delete'; n integer:=array_length(a,1); item jsonb; total bigint:=0;
begin
 perform private.require(p ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)+$' and n in (2,4,6),'Ruta no válida');
 perform private.require(kind in ('set','update','delete'),'Operación no válida');
 perform private.require(kind<>'update' or old is not null,'El registro ya no existe');
 d:=case when deleting then null when kind='update' then old||patch else patch end;
 if not deleting then
  perform private.require(jsonb_typeof(d)='object','Documento no válido');
  -- Resolve server timestamps; dates supplied by the device remain epoch milliseconds.
  select jsonb_object_agg(key,case when value='{"$serverTime":true}'::jsonb then to_jsonb(private.millis()) else value end) into d from jsonb_each(d);
 end if;
 if not deleting and d->>'photoPath' is not null then
  perform private.require(case when a[1] in ('users','publicProfiles') then
   d->>'photoPath' ~ ('^users/'||s||'/[A-Za-z0-9_.-]+$')
   when a[1]='stores' then d->>'photoPath' ~ ('^stores/'||s||'/'||case when n=2 then 'store' else a[3] end||'/[A-Za-z0-9_.-]+$')
   else false end,'Ruta de foto no válida');
 end if;
 if not deleting and a[1]='stores' and a[3]='receptions' then
  for item in select value from jsonb_array_elements(coalesce(d->'invoicePhotos','[]')) loop
   perform private.require(jsonb_typeof(item)='string' and (item #>> '{}') ~ ('^stores/'||s||'/receptions/[A-Za-z0-9_.-]+$'),'Ruta de factura no válida');
  end loop;
 end if;
 if a[1]='users' and n=2 then
  perform private.require(s=auth.uid()::text and old is not null and not deleting and
   private.changed_only(old,d,array['displayName','phone','photoPath','updatedAt']) and private.valid_text(d,'displayName',80));
 elsif a[1]='publicProfiles' and n=2 then
  perform private.require(s=auth.uid()::text and old is not null and not deleting and
   private.changed_only(old,d,array['displayName','displayNameLower','photoPath','updatedAt']) and private.valid_text(d,'displayName',80)
   and d->>'displayNameLower'=lower(d->>'displayName'));
 elsif a[1]='users' and a[3]='notifications' and n=4 then
  perform private.require(s=auth.uid()::text and old is not null and (deleting or
   (private.changed_only(old,d,array['read']) and jsonb_typeof(d->'read')='boolean')));
 elsif a[1]='stores' then
  perform private.require(not coalesce((private.doc('stores/'||s)->>'disabledBySystem')::boolean,false),'Tienda deshabilitada');
  if n=2 then
   perform private.require(not deleting and private.valid_text(d,'name',80) and private.valid_text(d,'address',200)
    and d->>'nameLower'=lower(d->>'name') and jsonb_typeof(d->'isPublic')='boolean' and length(d->>'currency')=3,'Tienda no válida');
   if old is null then
    perform private.require(d->>'ownerId'=auth.uid()::text and not coalesce((d->>'disabledBySystem')::boolean,false));
   else
    perform private.require(private.can(s,'edit_store') and private.changed_only(old,d,array['name','nameLower','address','photoPath','isPublic','currency','updatedAt']));
   end if;
  elsif n=4 and a[3]='members' then
   if old is null then
    perform private.require(not deleting and a[4]=auth.uid()::text and d->>'uid'=auth.uid()::text and
     private.doc('stores/'||s)->>'ownerId'=auth.uid()::text and d->>'role'='owner' and d->'active'='true'::jsonb);
   else
    perform private.require(not deleting and private.can(s,'members') and a[4]<>auth.uid()::text and old->>'role'<>'owner'
     and private.changed_only(old,d,array['active','permissions','updatedAt']) and jsonb_typeof(d->'active')='boolean'
     and jsonb_typeof(d->'permissions')='array' and (old->>'role'='employee' or d->'permissions'='[]'::jsonb));
   end if;
  elsif n=4 and a[3]='invitations' then
   perform private.require(not deleting and private.can(s,'members'));
   if old is null then
    perform private.require(d->>'fromUid'=auth.uid()::text and d->>'toUid'<>auth.uid()::text and
     private.doc('publicProfiles/'||(d->>'toUid')) is not null and d->>'storeId'=s and d->>'status'='pending' and d->>'role' in ('employee','client'));
   else
    perform private.require(old->>'status'='pending' and d->>'status'='cancelled' and private.changed_only(old,d,array['status','respondedAt']));
   end if;
  elsif n=4 and a[3]='categories' then
   perform private.require(private.can(s,'manage_categories') and (deleting or private.valid_text(d,'name',60)));
  elsif n=4 and a[3]='products' then
   perform private.require(private.can(s,'manage_products') or (old is null and private.can(s,'receptions')) or
    (not deleting and old is not null and private.can(s,'manage_categories') and private.changed_only(old,d,array['categoryId','updatedAt','updatedBy'])));
   if not deleting then
    perform private.require(private.valid_text(d,'name',120) and d->>'nameLower'=lower(d->>'name') and private.money(d->'salePriceCents')
     and (coalesce(d->'purchaseCostCents','null')='null'::jsonb or private.money(d->'purchaseCostCents'))
     and (coalesce(d->'stock','null')='null'::jsonb or jsonb_typeof(d->'stock')='number')
     and (coalesce(d->'stockAlert','null')='null'::jsonb or (d->>'stockAlert')::numeric>0),'Producto no válido');
   end if;
  elsif n=6 and a[3]='products' and a[5]='priceHistory' then
   perform private.require(not deleting and old is null and (private.can(s,'manage_products') or private.can(s,'receptions'))
    and d->>'changedBy'=auth.uid()::text);
  elsif n=4 and a[3]='orders' then
   perform private.require(not deleting and old is null and private.can(s,'staff') and d->>'createdBy'=auth.uid()::text
    and coalesce(d->'number','null')='null'::jsonb and d->>'status'='pending' and not coalesce((d->>'stockApplied')::boolean,false));
   perform private.require(jsonb_typeof(d->'items')='array' and jsonb_array_length(d->'items') between 1 and 300
    and private.money(d->'totalCents') and jsonb_typeof(d->'createdAt')='number','Venta no válida');
   for item in select value from jsonb_array_elements(d->'items') loop
    perform private.require(jsonb_typeof(item->'quantity')='number' and (item->>'quantity')::numeric>0 and
     private.money(item->'unitPriceCents') and private.valid_text(item,'description',300),'Detalle de venta no válido');
    total:=total+round((item->>'quantity')::numeric*(item->>'unitPriceCents')::numeric)::bigint;
   end loop;
   perform private.require(total=(d->>'totalCents')::bigint,'Total de venta incorrecto');
  elsif n=4 and a[3]='suppliers' then
   perform private.require(private.can(s,'suppliers') and a[4]<>'otros' and (deleting or private.valid_text(d,'companyName',120)));
  elsif n=4 and a[3]='receptions' then
   perform private.require(not deleting and private.can(s,'receptions') and
    case when old is null then d->>'createdBy'=auth.uid()::text else d->'createdBy'=old->'createdBy' and d->'createdAt'=old->'createdAt' end);
   perform private.require(private.valid_text(d,'supplierName',120) and jsonb_typeof(d->'lines')='array' and jsonb_array_length(d->'lines')<=300
    and jsonb_typeof(d->'invoicePhotos')='array' and jsonb_array_length(d->'invoicePhotos')<=10 and jsonb_typeof(d->'receivedAt')='number'
    and (coalesce(d->'invoiceTotalCents','null')='null'::jsonb or private.money(d->'invoiceTotalCents')),'Recepción no válida');
   for item in select value from jsonb_array_elements(d->'lines') loop
    perform private.require(private.valid_text(item,'productId',128) and jsonb_typeof(item->'quantity')='number' and (item->>'quantity')::numeric>0
     and (coalesce(item->'unitCostCents','null')='null'::jsonb or private.money(item->'unitCostCents')),'Detalle de recepción no válido');
   end loop;
  else perform private.require(false); end if;
 else perform private.require(false); end if;
 d:=private.effects(p,old,d);
 if deleting then delete from public.documents where path=p; else perform private.put(p,d); end if;
end $$;

create function public.ct_commit(operation_id uuid, operations jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare op jsonb; previous jsonb;
begin
 perform private.require(private.enabled(),'Debes iniciar sesión con una cuenta habilitada');
 perform private.require(jsonb_typeof(operations)='array' and jsonb_array_length(operations) between 1 and 500,'Lote no válido');
 -- Small demo: one short transaction at a time makes cross-document stock and
 -- permission checks serializable, including writes from different devices.
 perform pg_advisory_xact_lock(740105);
 select r.operations into previous from private.receipts r where r.uid=auth.uid() and r.operation_id=ct_commit.operation_id;
 if previous is not null then
  perform private.require(previous=operations,'Identificador de operación reutilizado');
  return jsonb_build_object('ok',true,'replayed',true);
 end if;
 for op in select value from jsonb_array_elements(operations) loop
  perform private.apply(op->>'path',op->>'kind',op->'data');
 end loop;
 insert into private.receipts(uid,operation_id,operations) values(auth.uid(),operation_id,operations);
 return jsonb_build_object('ok',true);
end $$;

create function private.matches(d jsonb, filters jsonb) returns boolean language plpgsql immutable
set search_path = '' as $$ declare f jsonb; v jsonb; begin
 for f in select value from jsonb_array_elements(coalesce(filters,'[]')) loop
  v:=d->(f->>'field');
  if not coalesce(case f->>'op' when 'eq' then v=f->'value' when 'gte' then v>=f->'value'
   when 'lt' then v<f->'value' else false end,false) then return false; end if;
 end loop; return true;
end $$;
create function public.ct_query(query jsonb) returns jsonb language sql stable security invoker
set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object('path',path,'data',data)), '[]'::jsonb) from (
  select path,data from public.documents
  where case when query->>'document' is not null then path=query->>'document'
   when query->>'group' is not null then split_part(path,'/',array_length(string_to_array(path,'/'),1)-1)=query->>'group'
   else regexp_replace(path,'/[^/]+$','')=query->>'path' end
  and private.matches(data,query->'filters')
  and (query->>'start' is null or data->>(query->>'order')>=query->>'start')
  and (query->>'end' is null or data->>(query->>'order')<=query->>'end')
  order by case when coalesce((query->>'descending')::boolean,false) then data->(query->>'order') end desc,
   case when not coalesce((query->>'descending')::boolean,false) then data->(query->>'order') end asc, path
  limit least(greatest(coalesce((query->>'limit')::int,500),1),500)
  offset greatest(coalesce((query->>'offset')::int,0),0)
 ) rows
$$;
