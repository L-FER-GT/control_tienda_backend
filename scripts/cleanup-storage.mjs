import { api,config,requireValues } from './config.mjs';
requireValues('SUPABASE_SERVICE_ROLE_KEY');
let completed=[];let count=0;
for(;;){
 const paths=await api('/rest/v1/rpc/ct_cleanup_files',{method:'POST',body:{completed}});
 if(paths.length===0)break;
 await api('/storage/v1/object/'+config.bucket,{method:'DELETE',body:{prefixes:paths}});
 completed=paths;count+=paths.length;
}
console.log(`Limpieza terminada: ${count} archivos retirados.`);
