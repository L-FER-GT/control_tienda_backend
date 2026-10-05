import { mkdir,writeFile } from 'node:fs/promises';
import { api,requireValues } from './config.mjs';
requireValues('SUPABASE_SERVICE_ROLE_KEY');
const rows=[];
for(let offset=0;;offset+=500){const batch=await api(`/rest/v1/documents?select=*&order=path&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)break}
await mkdir('backups',{recursive:true});
const file='backups/documents-'+new Date().toISOString().replaceAll(':','-')+'.json';
await writeFile(file,JSON.stringify({format:1,exportedAt:new Date().toISOString(),documents:rows},null,2));
console.log(`Exportados ${rows.length} documentos a ${file}. Auth y archivos requieren respaldo separado; ver docs/05-pruebas-y-respaldos.md.`);
