import assert from 'node:assert/strict';
const base=process.argv[2]||'http://localhost:8086';
let passed=0;
function check(name,fn){fn();passed++;console.log(`OK ${String(passed).padStart(2,'0')} — ${name}`);}
function client(){return {cookies:new Map(),csrf:'',async call(action,body,opts={}){
  const headers={Cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; ')};
  if(body!==undefined){headers['Content-Type']='application/json';headers['X-CSRF-Token']=opts.csrf??this.csrf;}
  const r=await fetch(`${base}/api.ashx?action=${action}`,{method:opts.method||(body===undefined?'GET':'POST'),headers,body:body===undefined?undefined:JSON.stringify(body)});
  const cookies=r.headers.getSetCookie?r.headers.getSetCookie():[r.headers.get('set-cookie')||''];
  for(const cookie of cookies){const pair=cookie.split(';')[0];const at=pair.indexOf('=');if(at>0)this.cookies.set(pair.slice(0,at),pair.slice(at+1));}
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{throw new Error(`Réponse invalide (${r.status}): ${text.slice(0,500)}`);}
  if(data.csrf)this.csrf=data.csrf;return {status:r.status,data};
}};}
const a=client(),b=client();
let r=await a.call('session');check('Session anonyme et jeton anti-CSRF',()=>{assert.equal(r.status,200);assert.equal(r.data.user,null);assert.equal(r.data.csrf.length,32);});
const original=(await a.call('catalogue')).data;
check('39 livres, trois catégories XML et trois liens Access',()=>{assert.equal(original.books.length,39);assert.equal(original.categories.length,3);assert.equal(original.links.length,3);assert.equal(original.books.find(x=>x.id===9).category,'Technologie');assert.ok(original.links[0].nomSite.includes('Bibliothèque'));});
check('Fenêtre de six mois, échéance et exclusion des dates futures',()=>{assert.equal(original.books.find(x=>x.id===17).isNew,true);assert.equal(original.books.find(x=>x.id===18).isNew,true);assert.equal(original.books.find(x=>x.id===19).isNew,false);assert.equal(original.books.find(x=>x.id===20).isNew,false);assert.equal(original.books.find(x=>x.id===21).isNew,false);});
r=await a.call('orders');check('Historique inaccessible sans connexion',()=>assert.equal(r.status,401));
r=await a.call('register',{}, {csrf:'invalide'});check('Rejet des modifications sans jeton valide',()=>assert.equal(r.status,403));
r=await a.call('logout');check('Déconnexion interdite par GET',()=>assert.equal(r.status,405));
const user={login:'test.lecteur',password:'Une-longue-phrase-2026!',firstName:'Élodie',lastName:"D'Essai",street:'12 rue des Livres',city:'Moncton',province:'NB',postalCode:'E1A 1A1',phone:'506-555-0123'};
r=await a.call('register',{...user,password:'court'});check('Mot de passe trop court refusé',()=>assert.equal(r.status,400));
r=await a.call('register',{...user,postalCode:'000000'});check('Code postal invalide refusé',()=>assert.equal(r.status,400));
r=await a.call('register',user);check('Inscription persistée, accents et apostrophe acceptés',()=>{assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.user.firstName,'Élodie');});
const firstId=r.data.user.id;
await b.call('session');r=await b.call('register',{...user,login:'TEST.LECTEUR'});check('Doublon de nom d’utilisateur refusé sans distinction de casse',()=>assert.equal(r.status,409));
r=await a.call('logout',{});check('Déconnexion de la session',()=>assert.equal(r.data.user,null));
r=await a.call('login',{login:user.login,password:'incorrect'});check('Mot de passe incorrect refusé',()=>assert.equal(r.status,401));
r=await a.call('login',{login:user.login,password:user.password});check('Reconnexion au compte Access',()=>{assert.equal(r.status,200);assert.equal(r.data.user.id,firstId);});
r=await a.call('orders');check('Coordonnées persistées avec numéro de dix chiffres',()=>{assert.equal(r.data.profile.tel,'5065550123');assert.equal(r.data.orders.length,0);});
const badOrder={token:crypto.randomUUID(),items:[{id:17,quantity:1},{id:36,quantity:99}]};
r=await a.call('order',badOrder);check('Stock insuffisant refusé pour une commande multiple',()=>assert.equal(r.status,409));
let cat=(await a.call('catalogue')).data;
check('Aucun stock modifié après un échec',()=>assert.equal(cat.books.find(x=>x.id===17).stock,original.books.find(x=>x.id===17).stock));
r=await a.call('order',{token:crypto.randomUUID(),items:[{id:17,quantity:-1}]});check('Quantité négative refusée',()=>assert.equal(r.status,400));
r=await a.call('order',{token:crypto.randomUUID(),items:[{id:17,quantity:1},{id:17,quantity:1}]});check('Lignes en double refusées',()=>assert.equal(r.status,400));
r=await a.call('order',{token:crypto.randomUUID(),items:[{id:999999,quantity:1}]});check('Livre inexistant refusé',()=>assert.equal(r.status,400));
const order={token:crypto.randomUUID(),items:[{id:17,quantity:2},{id:9,quantity:1}],total:0.01};
r=await a.call('order',order);const receipt=r.data;
check('Commande complète et total recalculé côté serveur',()=>{assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(receipt.total,166.63);assert.match(receipt.reference,/^UPP-/);});
r=await a.call('order',order);check('Rejeu sans double commande',()=>{assert.equal(r.status,200);assert.equal(r.data.reference,receipt.reference);assert.equal(r.data.repeated,true);});
cat=(await a.call('catalogue')).data;
check('Stock décrémenté une seule fois',()=>{assert.equal(cat.books.find(x=>x.id===17).stock,original.books.find(x=>x.id===17).stock-2);assert.equal(cat.books.find(x=>x.id===9).stock,original.books.find(x=>x.id===9).stock-1);});
r=await a.call('orders');check('Historique, lignes et prix figés enregistrés',()=>{assert.equal(r.data.orders.length,1);assert.equal(r.data.orders[0].items.length,2);assert.equal(r.data.orders[0].total,166.63);assert.equal(r.data.orders[0].items.find(x=>x.id===17).price,78.09);assert.ok(r.data.orders[0].address.includes("D'Essai"));});
r=await b.call('register',{...user,login:'autre.lecteur'});check('Second compte indépendant',()=>assert.equal(r.status,200));
r=await b.call('orders');check('Isolation des commandes entre clients',()=>assert.equal(r.data.orders.length,0));
const contenders=await Promise.all([a.call('order',{token:crypto.randomUUID(),items:[{id:37,quantity:1}]}),b.call('order',{token:crypto.randomUUID(),items:[{id:37,quantity:1}]})]);
check('Deux clients concurrents ne vendent pas deux fois le dernier exemplaire',()=>assert.deepEqual(contenders.map(x=>x.status).sort(),[200,409]));
cat=(await a.call('catalogue')).data;check('Stock final à zéro, jamais négatif',()=>assert.equal(cat.books.find(x=>x.id===37).stock,0));
await a.call('logout',{});await a.call('login',{login:user.login,password:user.password});r=await a.call('orders');check('Historique disponible après déconnexion et reconnexion',()=>assert.ok(r.data.orders.some(x=>x.reference===receipt.reference)));
const hidden=await fetch(base+'/App_Data/librairie.mdb');check('La MDB ne peut pas être téléchargée depuis le Web',()=>assert.equal(hidden.status,404));
const page=await fetch(base+'/');check('Accueil servi avec politique de sécurité',()=>{assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes("default-src 'self'"));});
await a.call('logout',{});
for(let n=0;n<10;n++)await a.call('login',{login:user.login,password:'incorrect'});
r=await a.call('login',{login:user.login,password:'incorrect'});check('Limitation des tentatives de connexion',()=>assert.equal(r.status,429));
console.log(`\n${passed} vérifications réussies. Base de test isolée.`);
