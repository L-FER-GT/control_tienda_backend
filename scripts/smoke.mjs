import { api,config,requireValues } from './config.mjs';
requireValues('SUPABASE_URL','SUPABASE_ANON_KEY','SUPERADMIN_EMAIL','SUPERADMIN_PASSWORD');
const session=await api('/auth/v1/token?grant_type=password',{method:'POST',key:config.anon,body:{email:process.env.SUPERADMIN_EMAIL,password:process.env.SUPERADMIN_PASSWORD}});
try{
 const profile=await api('/rest/v1/rpc/ct_call',{method:'POST',key:config.anon,token:session.access_token,body:{action:'bootstrapUser',payload:{}}});
 if(!profile.code || !profile.uid)throw new Error('Contrato de perfil incompatible');
 const query={path:'stores',limit:1};
 const rows=await api('/rest/v1/rpc/ct_query',{method:'POST',key:config.anon,token:session.access_token,body:{query}});
 if(!Array.isArray(rows))throw new Error('Contrato de consulta incompatible');
 const poll=await api('/rest/v1/rpc/ct_poll',{method:'POST',key:config.anon,token:session.access_token,body:{query,etag:null}});
 if(!Array.isArray(poll.rows) || typeof poll.etag!=='string')throw new Error('Falta aplicar la migración de consulta condicional');
 console.log('Auth + perfil + consulta RLS + sincronización condicional compatibles con Android.');
}finally{await api('/auth/v1/logout?scope=local',{method:'POST',key:config.anon,token:session.access_token,body:{}})}
