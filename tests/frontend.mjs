// Contrôles de la logique et du HTML généré, sans automatisation de navigateur.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const base=process.argv[2]||'http://localhost:8085';
const data=await (await fetch(base+'/api.ashx?action=catalogue')).json();
const nodes=new Map();
function node(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',value:'',open:false,disabled:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},querySelector:node});return nodes.get(selector);}
const context=vm.createContext({console,Intl,URL,URLSearchParams,crypto:webcrypto,setTimeout:()=>0,clearTimeout(){},testData:data,location:{hash:'#accueil'},window:{addEventListener(){},scrollTo(){}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},fetch,FormData});
const source=await readFile(new URL('../UnPeuPlus/assets/app.js',import.meta.url),'utf8');
vm.runInContext(source.replace(/\nboot\(\);\s*$/,'\n'),context);
vm.runInContext('state.data=testData;',context);
let count=0;
const evaluate=expression=>vm.runInContext(expression,context);
function test(name,fn){fn();console.log(`OK interface ${++count} — ${name}`);}
function validate(html,label){
  const stack=[];const voids=new Set(['input','img','br','hr','meta','link','area','base','col','embed','param','source','track','wbr']);
  const ids=[];
  for(const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){
    const tag=match[1].toLowerCase(),text=match[0];
    if(text.startsWith('</')) {assert.match(text,/^<\/[a-z][\w-]*\s*>$/i,`${label}: fermeture invalide ${text}`);assert.equal(stack.pop(),tag,`${label}: imbrication ${tag}`);}
    else {if(!voids.has(tag)&&!text.endsWith('/>'))stack.push(tag);const id=/\bid="([^"]+)"/.exec(text);if(id)ids.push(id[1]);}
  }
  assert.equal(stack.length,0,`${label}: balises non fermées ${stack}`);assert.equal(new Set(ids).size,ids.length,`${label}: identifiants dupliqués`);
  for(const match of html.matchAll(/<label[^>]*\bfor="([^"]+)"/g))assert.ok(ids.includes(match[1]),`${label}: champ ${match[1]} absent`);
}
for(const [name,expression] of [['Accueil','home()'],['Catalogue',"catalogue('livres',new URLSearchParams())"],['Nouveautés',"catalogue('nouveautes',new URLSearchParams())"],['Archives',"catalogue('archives',new URLSearchParams())"],['Fiche livre','detail(17)'],['Fiche absente','detail(9999)'],['Ressources','resources()']])test(`Structure HTML : ${name}`,()=>validate(evaluate(expression),name));
test('12 livres sur la première page du catalogue',()=>assert.equal((evaluate("catalogue('livres',new URLSearchParams())").match(/class="book-card"/g)||[]).length,12));
test('Filtre de catégorie appliqué',()=>{const html=evaluate("catalogue('livres',new URLSearchParams('categorie=Affaires'))");assert.equal((html.match(/class="book-card"/g)||[]).length,data.books.filter(b=>b.category==='Affaires').length);});
test('Recherche par ISBN',()=>assert.equal((evaluate("catalogue('livres',new URLSearchParams('q=0262033844'))").match(/class="book-card"/g)||[]).length,1));
test('Recherche insensible à la casse',()=>assert.ok(evaluate("catalogue('livres',new URLSearchParams('q=PROGRAMMING+PEARLS'))").includes('Programming Pearls')));
test('Filtres état et disponibilité valides',()=>{const html=evaluate("catalogue('livres',new URLSearchParams('etat=Neuf&stock=oui'))");validate(html,'Filtres');assert.match(html,/<option selected>Neuf<\/option>/);assert.match(html,/<option value="oui" selected>En stock seulement<\/option>/);});
test('Recherche sans résultat',()=>assert.ok(evaluate("catalogue('livres',new URLSearchParams('q=inexistant-abc-9876'))").includes('Aucun livre trouvé.')));
test('Les valeurs HTML potentiellement actives sont échappées',()=>assert.equal(evaluate('escapeHtml(\'<script>alert("x")</script>\')'),'&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
evaluate("openAuth('login')");test('Formulaire de connexion structuré',()=>validate(nodes.get('#auth-content').innerHTML,'Connexion'));
evaluate("openAuth('register')");test('Formulaire d’inscription et champs associés',()=>{validate(nodes.get('#auth-content').innerHTML,'Inscription');assert.ok(nodes.get('#auth-content').innerHTML.includes('confirmPassword'));});
evaluate('addBook(17,2)');test('Ajout au panier',()=>assert.equal(evaluate('state.cart[0].quantity'),2));
evaluate('addBook(17,100)');test('Quantité excessive refusée côté interface',()=>assert.equal(evaluate('state.cart[0].quantity'),2));
let html=await evaluate('cartPage(0)');test('Panier anonyme structuré',()=>{validate(html,'Panier');assert.ok(html.includes('Me connecter pour commander'));});
evaluate('state.cart=[]');html=await evaluate('cartPage(0)');test('Panier vide explicite',()=>{validate(html,'Panier vide');assert.ok(html.includes('Votre prochaine lecture vous attend.'));});
html=await evaluate('accountPage(0)');test('Espace visiteur structuré',()=>validate(html,'Compte anonyme'));
evaluate("state.user={firstName:'Élodie',lastName:'Essai',login:'test'};api=async()=>({profile:{prenom:'Élodie',nom:'Essai',rue:'12 rue des Livres',ville:'Moncton',province:'NB',codePostal:'E1A 1A1',tel:'5065550123'},orders:[{reference:'UPP-TEST',date:'2026-11-20',total:78.09,status:'Enregistrée',address:'Adresse de test',items:[{id:17,title:'Introduction to Algorithms',quantity:1,price:78.09}]}]});");
html=await evaluate('accountPage(0)');test('Historique connecté structuré',()=>{validate(html,'Historique');assert.ok(html.includes('UPP-TEST'));});
evaluate('addBook(17,1)');html=await evaluate('cartPage(0)');test('Confirmation et adresse présentes au panier connecté',()=>{validate(html,'Commande');assert.ok(html.includes('id="checkout"'));assert.ok(html.includes('Adresse de livraison'));});
for(const filename of ['index.html','remise.html']){const html=await readFile(new URL('../UnPeuPlus/'+filename,import.meta.url),'utf8');test(`Structure du document ${filename}`,()=>validate(html,filename));}
console.log(`\n${count} contrôles de logique et de structure HTML réussis. Le rendu visuel n’est pas testé par ce script.`);
