import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The Supabase GitHub integration applies only NEW versions: it silently ignores edits to an
// applied migration and rejects a version older than the last applied one. Catch both before merge.
// Usage: npm run migrations:check [-- <base-ref>]  (CI passes MIGRATIONS_BASE).
const dir='supabase/migrations', pattern=/^(\d{14})_[a-z0-9_]+\.sql$/, errors=[];
const versions=new Set();
for(const name of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort()){
 const version=pattern.exec(name)?.[1];
 if(!version){errors.push(`${name}: usa el formato AAAAMMDDHHMMSS_nombre.sql (supabase migration new)`);continue}
 if(versions.has(version)) errors.push(`${name}: versión ${version} repetida`);
 versions.add(version);
}

const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const base=(process.argv[2]??process.env.MIGRATIONS_BASE??'').trim();
let comparable=false;
if(base && !/^0+$/.test(base)) try{git('cat-file','-e',base+'^{commit}');comparable=true}catch{console.warn(`No existe ${base}; solo se validan los nombres.`)}
if(comparable){
 // Only files with a valid version can have been applied by the integration.
 const applied=git('ls-tree','--name-only',base,dir+'/').split('\n').map(p=>p.split('/').pop()).filter(f=>pattern.test(f));
 const last=applied.map(f=>pattern.exec(f)[1]).sort().pop()??'';
 for(const line of git('diff','--name-status','--no-renames',base+'...HEAD','--',dir).split('\n').filter(Boolean)){
  const [status,path]=line.split('\t'), name=path.split('/').pop();
  if(status!=='A' && applied.includes(name)) errors.push(`${name}: ya aplicada en producción; no se edita ni se borra, crea una migración nueva`);
  const version=pattern.exec(name)?.[1];
  if(status==='A' && version && version<=last) errors.push(`${name}: su versión debe ser posterior a ${last}`);
 }
}
if(errors.length){for(const e of errors) console.error(e);process.exit(1)}
console.log(`Migraciones válidas (${versions.size})${comparable?` frente a ${base}`:''}.`);
