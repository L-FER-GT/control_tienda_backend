import 'dotenv/config';
export const config = {
 url:(process.env.SUPABASE_URL??'').replace(/\/$/,''),
 anon:process.env.SUPABASE_ANON_KEY??'',
 secret:process.env.SUPABASE_SERVICE_ROLE_KEY??'',
 db:process.env.SUPABASE_DB_URL??'',
 bucket:process.env.SUPABASE_STORAGE_BUCKET||'media',
};
export function requireValues(...keys){for(const key of keys) if(!process.env[key]?.trim()) throw new Error(`Completa ${key} en .env`)}
export async function api(path,{method='GET',body,key=config.secret,token}={}){
 requireValues('SUPABASE_URL');
 if(!key) throw new Error('Falta la clave de Supabase');
 const headers={apikey:key,'Content-Type':'application/json'};
 if(token) headers.Authorization=`Bearer ${token}`;
 else if(key.startsWith('eyJ')) headers.Authorization=`Bearer ${key}`;
 const response=await fetch(config.url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
 if(!response.ok) throw new Error(`Supabase ${response.status}: ${data?.message??data?.msg??data?.error_description??'operación fallida'}`);
 return data;
}
