import { config,requireValues } from './config.mjs';
if(!process.argv.includes('--allow-empty')) requireValues('SUPABASE_URL','SUPABASE_ANON_KEY');
if(config.url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url) && !/^http:\/\/(localhost|127\.0\.0\.1):54321$/.test(config.url)) throw new Error('SUPABASE_URL debe ser la URL del proyecto');
if(config.anon.startsWith('sb_secret_') || (config.anon.startsWith('eyJ') && JSON.parse(Buffer.from(config.anon.split('.')[1],'base64url')).role!=='anon')) throw new Error('SUPABASE_ANON_KEY debe ser pública, nunca service_role');
if(config.bucket!=='media') throw new Error('Esta migración crea el bucket media; usa SUPABASE_STORAGE_BUCKET=media');
console.log(config.url && config.anon?'Configuración pública válida (sin mostrar claves).':'Configuración preparada; faltan URL y clave pública para conectar.');
