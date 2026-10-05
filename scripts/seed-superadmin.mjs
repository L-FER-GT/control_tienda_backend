import { api,requireValues } from './config.mjs';
requireValues('SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPERADMIN_EMAIL','SUPERADMIN_PASSWORD');
const email=process.env.SUPERADMIN_EMAIL.trim();const password=process.env.SUPERADMIN_PASSWORD;
if(password.length<12) throw new Error('Usa una contraseña de al menos 12 caracteres');
let user;
for(let page=1;!user;page++){
 const result=await api(`/auth/v1/admin/users?page=${page}&per_page=100`);const users=result.users??[];
 user=users.find(u=>u.email?.toLowerCase()===email.toLowerCase());if(users.length<100)break;
}
const data={email,password,email_confirm:true,user_metadata:{...user?.user_metadata,displayName:process.env.SUPERADMIN_NAME||'Administrador'},app_metadata:{...user?.app_metadata,superadmin:true}};
user=await api('/auth/v1/admin/users'+(user?'/'+user.id:''),{method:user?'PUT':'POST',body:data});
const uid=user.id??user.user?.id;
const rows=await api('/rest/v1/documents?path=eq.'+encodeURIComponent('users/'+uid));
if(rows[0]) await api('/rest/v1/documents?path=eq.'+encodeURIComponent('users/'+uid),{method:'PATCH',body:{data:{...rows[0].data,isSuperadmin:true}}});
console.log('Administrador preparado. Inicia sesión con el correo configurado.');
