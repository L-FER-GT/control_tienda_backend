import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { config,requireValues } from './config.mjs';
requireValues('SUPABASE_DB_URL');
const local=['localhost','127.0.0.1','::1'].includes(new URL(config.db).hostname);
const client=new pg.Client({connectionString:config.db,ssl:local?false:{rejectUnauthorized:true}});
await client.connect();
try {
 await client.query('create schema if not exists private');
 await client.query('create table if not exists private.schema_migrations(name text primary key,sha256 text not null,applied_at timestamptz default now())');
 for(const name of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
  const sql=await readFile('supabase/migrations/'+name,'utf8');const hash=createHash('sha256').update(sql).digest('hex');
  const existing=(await client.query('select sha256 from private.schema_migrations where name=$1',[name])).rows[0];
  if(existing){if(existing.sha256!==hash) throw new Error(`Migración ya aplicada fue modificada: ${name}`);continue}
  await client.query('begin');
  try{await client.query(sql);await client.query('insert into private.schema_migrations(name,sha256) values($1,$2)',[name,hash]);await client.query('commit');console.log(`Aplicada ${name}`)}
  catch(e){await client.query('rollback');throw e}
 }
}finally{await client.end()}
