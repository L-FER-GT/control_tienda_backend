-- Members reference their user avatar, not a store-owned media object.
-- Preserve all other write permissions and checks from the deployed function.
create or replace function private.apply(p text, kind text, patch jsonb) returns void language plpgsql security definer
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
   when a[1]='stores' and n=4 and a[3]='members' then
    d->>'photoPath' ~ ('^users/'||a[4]||'/[A-Za-z0-9_.-]+$')
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
