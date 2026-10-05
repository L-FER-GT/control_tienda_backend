import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL (WASM), with only Supabase-owned auth/storage schema stubbed.
// Exercise the actual migrations and database roles; no mocked stock/RLS logic.
let db;
const owner=randomUUID(), employee=randomUUID(), client=randomUUID(), outsider=randomUUID(), admin=randomUUID();
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,anon;
  grant execute on function auth.uid() to authenticated,anon;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const name of (await readdir('supabase/migrations')).sort()) await db.exec(await readFile('supabase/migrations/'+name,'utf8'));
 for(const [id,name] of [[owner,'Owner'],[employee,'Employee'],[client,'Client'],[outsider,'Outsider'],[admin,'Admin']])
  await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)',[id,name+'@example.test',{displayName:name},{superadmin:id===admin}]);
});
after(async()=>{await db?.close()});
async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid??'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function rpc(action,payload={}){return (await db.query('select public.ct_call($1,$2) value',[action,payload])).rows[0].value}
async function query(q){return (await db.query('select public.ct_query($1) value',[q])).rows[0].value}
async function doc(path){return (await query({document:path}))[0]?.data}
async function commit(ops,id=randomUUID()){return (await db.query('select public.ct_commit($1,$2) value',[id,ops])).rows[0].value}
const set=(path,data)=>({path,kind:'set',data});
const update=(path,data)=>({path,kind:'update',data});
const product={name:'Arroz',nameLower:'arroz',salePriceCents:250,purchaseCostCents:100,stock:20,stockAlert:null,unit:'unit',createdAt:1,updatedAt:1};
const sale=(uid,qty=2)=>({createdBy:uid,createdByName:'Vendedor',createdAt:100,number:null,status:'pending',stockApplied:false,
 paymentMethod:'cash',currency:'PEN',items:[{productId:'p1',description:'Arroz',quantity:qty,unitPriceCents:250,manual:false}],totalCents:qty*250});

test('full store lifecycle and security',async t=>{
 await t.test('anonymous callers and direct writes are denied',async()=>{
  await as(null);await assert.rejects(()=>query({path:'stores'}));await assert.rejects(()=>rpc('bootstrapUser'));
  await as(owner);await assert.rejects(()=>db.query("insert into public.documents values('stores/hack','{}',now())"));
  await assert.rejects(()=>db.query("select private.put('stores/hack','{}')"));
  await assert.rejects(()=>db.query('select public.ct_cleanup_files()'));
 });
 await t.test('signup creates unique profiles and cannot trust user metadata for admin',async()=>{
  await as(owner);const profile=await rpc('bootstrapUser');assert.match(profile.code,/^\d{10}$/);assert.equal(profile.isSuperadmin,false);
  await assert.rejects(()=>commit([update('users/'+owner,{isSuperadmin:true})]));
  await assert.rejects(()=>rpc('adminGetUsage'));
 });
 await t.test('store creation and owner membership are atomic',async()=>{
  await as(owner);
  await commit([update('users/'+owner,{photoPath:'users/'+owner+'/avatar.jpg'})]);
  await commit([set('stores/shop',{name:'Tienda',nameLower:'tienda',address:'Lima',isPublic:true,currency:'PEN',ownerId:owner,ownerName:'Owner',disabledBySystem:false,createdAt:1}),
   set('stores/shop/members/'+owner,{uid:owner,role:'owner',active:true,permissions:[],displayName:'Owner',code:'0000000001',photoPath:'users/'+owner+'/avatar.jpg'})]);
  await commit([set('stores/shop/products/p1',product)]);
  await assert.rejects(()=>commit([set('stores/shop/categories/c1',{name:'Test'}),update('users/'+owner,{isSuperadmin:true})]));
  assert.equal(await doc('stores/shop/categories/c1'),undefined);
 });
 await t.test('invite, accept, employee restrictions, delegation',async()=>{
  await as(owner);
  await commit([set('stores/shop/invitations/i1',{storeId:'shop',storeName:'Tienda',fromUid:owner,fromName:'Owner',toUid:employee,role:'employee',status:'pending',createdAt:1})]);
  await as(outsider);await assert.rejects(()=>rpc('respondInvitation',{storeId:'shop',invitationId:'i1',accept:true}));
  await as(employee);
  await commit([update('users/'+employee,{photoPath:'users/'+employee+'/avatar.jpg'}),update('publicProfiles/'+employee,{photoPath:'users/'+employee+'/avatar.jpg'})]);
  assert.equal((await query({path:'users/'+employee+'/notifications'})).length,1);
  await rpc('respondInvitation',{storeId:'shop',invitationId:'i1',accept:true});
  await rpc('respondInvitation',{storeId:'shop',invitationId:'i1',accept:true});
  await assert.rejects(()=>commit([update('stores/shop/products/p1',{salePriceCents:1})]));
  await assert.rejects(()=>commit([update('stores/shop/members/'+employee,{permissions:['members']})]));
  await as(owner);await commit([update('stores/shop/members/'+employee,{permissions:['receptions'],updatedAt:1})]);
  assert.equal((await doc('stores/shop/members/'+employee)).photoPath,'users/'+employee+'/avatar.jpg');
  await assert.rejects(()=>commit([update('stores/shop/members/'+employee,{photoPath:'users/'+owner+'/avatar.jpg'})]));
  await commit([update('stores/shop/members/'+employee,{active:false})]);
  await commit([update('stores/shop/members/'+employee,{active:true})]);
 });
 await t.test('sale assigns number and stock exactly once after a lost response',async()=>{
  await as(employee);const id=randomUUID(),ops=[set('stores/shop/orders/o1',sale(employee))];
  await commit(ops,id);await commit(ops,id);
  assert.equal((await doc('stores/shop/products/p1')).stock,18);
  assert.equal((await doc('stores/shop/orders/o1')).number,1);
  await assert.rejects(()=>commit([set('stores/shop/orders/o2',sale(employee))],id));
  await assert.rejects(()=>commit([update('stores/shop/orders/o1',{totalCents:1})]));
  await assert.rejects(()=>commit([set('stores/shop/orders/bad',{...sale(employee),totalCents:1})]));
  assert.equal((await doc('stores/shop/products/p1')).stock,18);
 });
 await t.test('reception edits apply only quantity differences and changed cost',async()=>{
  await as(employee);
  const r={supplierId:'otros',supplierName:'Otros',lines:[{productId:'p1',quantity:5,unitCostCents:110}],invoicePhotos:[],invoiceTotalCents:null,receivedAt:100,createdAt:100,createdBy:employee,updatedByName:'Employee'};
  await commit([set('stores/shop/receptions/r1',r)]);
  assert.equal((await doc('stores/shop/products/p1')).stock,23);
  const id=randomUUID(),ops=[update('stores/shop/receptions/r1',{lines:[{productId:'p1',quantity:8,unitCostCents:120}]})];
  await commit(ops,id);await commit(ops,id);
  assert.equal((await doc('stores/shop/products/p1')).stock,26);
  assert.equal((await doc('stores/shop/products/p1')).purchaseCostCents,120);
  await commit([update('stores/shop/receptions/r1',{lines:[]})]);assert.equal((await doc('stores/shop/products/p1')).stock,18);
 });
 await t.test('outsider can see public catalog but not sales, invoices or private profiles',async()=>{
  await as(outsider);assert.equal((await query({path:'stores/shop/products'})).length,1);
  assert.equal((await query({path:'stores/shop/orders'})).length,0);
  assert.equal(await doc('users/'+owner),undefined);
  await assert.rejects(()=>commit([set('stores/shop/orders/hack',sale(outsider))]));
  await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('media','stores/shop/receptions/hack.jpg')"));
  await as(owner);await db.query("insert into storage.objects(bucket_id,name,metadata) values('media','stores/shop/receptions/invoice.jpg','{\"size\":100}')");
  await as(outsider);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
 });
 await t.test('server timestamps, query filters and pagination',async()=>{
  await as(owner);await commit([update('stores/shop',{updatedAt:{$serverTime:true}})]);
  assert.equal(typeof(await doc('stores/shop')).updatedAt,'number');
  assert.equal((await query({path:'stores/shop/products',filters:[{field:'salePriceCents',op:'gte',value:200}]})).length,1);
  assert.equal((await query({path:'stores/shop/products',offset:1})).length,0);
  const first=(await db.query('select public.ct_poll($1,null) result',[{path:'stores/shop/products'}])).rows[0].result;
  const second=(await db.query('select public.ct_poll($1,$2) result',[{path:'stores/shop/products'},first.etag])).rows[0].result;
  assert.equal(second.rows,null);assert.equal(second.etag,first.etag);
  await assert.rejects(()=>commit([update('stores/shop/products/p1',{photoPath:'stores/other/products/stolen.jpg'})]));
 });
 await t.test('disabled accounts/stores cannot mutate through existing sessions',async()=>{
  await as(admin);await rpc('adminSetStoreDisabled',{storeId:'shop',disabled:true});
  await as(employee);await assert.rejects(()=>commit([set('stores/shop/orders/o3',sale(employee))]));
  await as(admin);await rpc('adminSetStoreDisabled',{storeId:'shop',disabled:false});await rpc('adminSetUserDisabled',{uid:employee,disabled:true});
  await as(employee);assert.equal((await query({path:'stores/shop/products'})).length,0);await assert.rejects(()=>commit([set('stores/shop/orders/o3',sale(employee))]));
  await as(admin);await rpc('adminSetUserDisabled',{uid:employee,disabled:false});
  const usage=await rpc('adminGetUsage');assert.equal(usage.source,'supabase');assert.ok(usage.metrics.length>0);
 });
 await t.test('account deletion removes identity and closes owned stores',async()=>{
  await as(owner);await rpc('deleteAccount');
  await db.exec('reset role');assert.equal((await db.query('select * from auth.users where id=$1',[owner])).rows.length,0);
  assert.equal((await db.query("select data->>'disabledBySystem' disabled from public.documents where path='stores/shop'")).rows[0].disabled,'true');
 });
});
