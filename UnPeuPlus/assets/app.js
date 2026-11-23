'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => new Intl.NumberFormat('fr-CA', {style:'currency',currency:'CAD'}).format(value);
const dateText = value => new Intl.DateTimeFormat('fr-CA',{day:'numeric',month:'long',year:'numeric'}).format(new Date(value + 'T12:00:00'));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const state = {data:null,user:null,csrf:null,cart:[],orderToken:null,receipt:null,renderId:0};
const palette = {17:0,36:1,9:2,18:3,38:4,20:5,22:6,40:7};
try {
  const stored = JSON.parse(localStorage.getItem('upp-cart-v1') || '{}');
  if (Array.isArray(stored.items)) {
    state.cart = stored.items.filter(x=>x && Number.isInteger(x.id) && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 99).slice(0,50);
    state.cart = state.cart.filter((x,index,list)=>list.findIndex(y=>y.id === x.id) === index);
  }
  state.orderToken = /^[a-zA-Z0-9-]{16,64}$/.test(stored.token || '') ? stored.token : null;
} catch { /* Le panier reste utilisable si le stockage local est désactivé. */ }
const main = $('#contenu');
let toastTimeout;
function toast(message) { const t=$('#toast'); t.textContent=message; t.classList.add('visible'); clearTimeout(toastTimeout); toastTimeout=setTimeout(()=>t.classList.remove('visible'),4000); }
async function api(action, body) {
  const response = await fetch(`api.ashx?action=${action}`, {method:body === undefined ? 'GET':'POST',credentials:'same-origin',headers:body === undefined ? {} : {'Content-Type':'application/json','X-CSRF-Token':state.csrf || ''},body:body === undefined ? undefined : JSON.stringify(body)});
  let data;
  try { data=await response.json(); } catch { throw new Error('Le serveur ne répond pas correctement. Relancez le site avec Lancer-le-site.cmd.'); }
  if (!response.ok) { const error=new Error(data.error || 'Une erreur est survenue.'); error.status=response.status; throw error; }
  return data;
}
function setSession(data) { state.user=data.user; state.csrf=data.csrf; updateHeader(); }
function updateHeader() {
  const count=state.cart.reduce((sum,item)=>sum+item.quantity,0);
  $('#cart-count').textContent=count;
  $('.cart-button').setAttribute('aria-label',`Panier, ${count} article${count>1?'s':''}`);
  $('#account-button span').textContent=state.user ? state.user.firstName : 'Connexion';
  $('#account-button').setAttribute('aria-label',state.user ? 'Mon compte':'Se connecter');
}
function saveCart(changed=true) {
  if(changed) state.orderToken=crypto.randomUUID();
  try { localStorage.setItem('upp-cart-v1',JSON.stringify({items:state.cart,token:state.orderToken})); } catch { /* Session courante uniquement. */ }
  updateHeader();
}
const bookById = id => state.data.books.find(b=>b.id===Number(id));
function addBook(id, quantity=1) {
  const b=bookById(id); if (!b) return;
  const current=state.cart.find(x=>x.id===b.id);
  if(!Number.isInteger(quantity) || quantity<1 || quantity+(current?.quantity || 0)>Math.min(b.stock,99)) { toast('Cette quantité dépasse le stock disponible ou la limite de 99 exemplaires.'); return; }
  if(current) current.quantity+=quantity; else state.cart.push({id:b.id,quantity});
  saveCart(); toast(`${quantity>1?quantity+' exemplaires ajoutés':'Livre ajouté'} au panier.`);
}
function cover(b, extra='') {
  return `<div class="book-cover cover-v${palette[b.id] ?? b.id%8} ${extra}" aria-hidden="true"><span class="cover-cat">${escapeHtml(b.category)} · UnPeuPlus</span><strong class="cover-title ${b.title.length>38?'long':''}">${escapeHtml(b.title)}</strong><span class="cover-art"></span><span class="cover-author">${escapeHtml(b.author)}</span></div>`;
}
function bookCard(b) {
  return `<article class="book-card"><a class="cover-link" href="#livre/${b.id}" aria-label="Voir ${escapeHtml(b.title)}">${b.isNew?'<span class="book-tag">Nouveauté</span>':b.condition==='Occasion'?'<span class="book-tag">Occasion</span>':''}${cover(b)}</a><div class="book-info"><span class="book-category">${escapeHtml(b.category)}</span><h3><a href="#livre/${b.id}">${escapeHtml(b.title)}</a></h3><p class="book-author">${escapeHtml(b.author)}</p><div class="book-bottom"><span class="price">${money(b.price)}</span><button class="add-book" data-add="${b.id}" aria-label="Ajouter ${escapeHtml(b.title)} au panier" ${b.stock<1?'disabled':''}>${icon('plus')}</button></div></div></article>`;
}
function pageHeading(title,subtitle,crumb=title) { return `<section class="page-heading"><div class="wrap"><div class="breadcrumb"><a href="#accueil">Accueil</a><span>/</span><span>${escapeHtml(crumb)}</span></div><h1>${escapeHtml(title)}</h1>${subtitle?`<p>${escapeHtml(subtitle)}</p>`:''}</div></section>`; }
function empty(title,text,links='',symbol='book') { return `<div class="empty-state">${icon(symbol)}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${links?`<div class="button-row">${links}</div>`:''}</div>`; }
function home() {
  const selected=[17,36,9,18].map(bookById).filter(Boolean);
  return `<section class="hero"><div class="wrap hero-inner"><div class="hero-copy"><div class="eyebrow">Pour ceux qui veulent en savoir plus</div><h1>Une page de plus,<br><em>un monde en plus.</em></h1><p>Des livres pour nourrir votre curiosité, faire grandir vos idées et ouvrir de nouvelles perspectives.</p><div class="button-row"><a class="button" href="#livres">Explorer la librairie</a><a class="text-link" href="#nouveautes">Voir les nouveautés</a></div><div class="hero-note">${icon('book')} ${state.data.books.length} livres à découvrir · 3 univers à explorer</div></div><div class="hero-art" aria-label="Composition de couvertures graphiques inspirées du catalogue"><div class="art-shelf"></div><span class="art-star" aria-hidden="true">✳</span><span class="art-label">Les grandes idées<br>commencent ici.</span><div class="hero-book one" aria-hidden="true"><span class="mini">L’art de s’organiser</span><strong>Getting<br>Things<br>Done.</strong><span class="book-orbit"></span><span class="byline">David Allen</span></div><div class="hero-book three" aria-hidden="true"><span class="mini">Une vie d’idées</span><strong>Steve<br>Jobs</strong><span class="book-orbit"></span><span class="byline">Walter Isaacson</span></div><div class="hero-book two" aria-hidden="true"><span class="mini">Informatique / Les essentiels</span><strong>Introduction<br>to Algorithms</strong><span class="book-orbit"></span><span class="byline">Thomas H. Cormen</span></div><span class="art-caption">Créations graphiques UnPeuPlus</span></div></div></section>
  <div class="values-strip"><div class="wrap values-inner"><div class="value">${icon('book')} Des connaissances à portée de main</div><div class="value">${icon('leaf')} Des livres neufs et d’occasion</div><div class="value">${icon('bag')} Vos lectures, dans un seul panier</div></div></div>
  <section class="wrap section"><div class="section-head"><div><div class="eyebrow">À chaque curiosité, son univers</div><h2>Qu’allez-vous découvrir ?</h2></div></div><div class="category-grid">${state.data.categories.map(c=>`<a class="category-card" href="#livres?categorie=${encodeURIComponent(c.name)}"><span class="category-icon">${icon(c.icon)}</span><div><h3>${escapeHtml(c.name)}</h3><p>${state.data.books.filter(b=>b.category===c.name).length} livres à explorer</p></div></a>`).join('')}</div></section>
  <section class="selection-section"><div class="wrap section"><div class="section-head"><div><div class="eyebrow">La sélection UnPeuPlus</div><h2>De belles idées entre les pages.</h2><p>Quatre portes d’entrée pour votre prochaine découverte.</p></div><a class="text-link" href="#livres">Tout le catalogue</a></div><div class="books-grid">${selected.map(bookCard).join('')}</div></div></section>
  <section class="wrap membership"><div><div class="eyebrow">Un peu plus qu’une librairie</div><h2>Votre curiosité mérite un espace.</h2><p>Créez votre compte pour passer commande et retrouver toutes vos lectures au même endroit.</p></div><div class="button-row">${state.user?'<a class="button light" href="#compte">Mon espace lecteur</a>':'<button class="button light" data-auth="register">Créer mon compte</button><button class="text-button text-link" data-auth="login">Déjà membre ?</button>'}</div></section>`;
}
function getRoute() { const raw=location.hash.slice(1)||'accueil'; const [path,search='']=raw.split('?'); return {path,params:new URLSearchParams(search)}; }
function setFilter(key,value) {
  const {path,params}=getRoute(); if(value) params.set(key,value); else params.delete(key); if(key!=='page') params.delete('page');
  location.hash=path+(params.size?'?'+params.toString():'');
}
function catalogue(path,params) {
  const news=path==='nouveautes', archive=path==='archives';
  let base=state.data.books.filter(b=>news?b.isNew:archive?b.newsDate&&!b.isNew:true);
  let category=params.get('categorie')||'', query=params.get('q')||'', condition=params.get('etat')||'', stock=params.get('stock')||'', sort=params.get('tri')||'title';
  const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let books=base.filter(b=>(!category||b.category===category)&&(!condition||b.condition===condition)&&(!stock||b.stock>0)&&(!query||fold(`${b.title} ${b.author} ${b.isbn}`).includes(fold(query))));
  const sorts={title:(a,b)=>a.title.localeCompare(b.title,'fr'),priceAsc:(a,b)=>a.price-b.price,priceDesc:(a,b)=>b.price-a.price,recent:(a,b)=>(b.newsDate||b.published||'').localeCompare(a.newsDate||a.published||'')};
  books.sort(sorts[sort]||sorts.title);
  const pages=Math.max(1,Math.ceil(books.length/12)); const page=Math.min(pages,Math.max(1,parseInt(params.get('page')||'1',10)||1));
  const title=news?'Les nouveautés':archive?'Les découvertes d’hier':'À chaque envie, un livre.';
  const subtitle=news?'Les livres apparus dans les six derniers mois, accompagnés de leurs informations exclusives.':archive?'Retrouvez les anciennes sélections de la librairie, toujours disponibles dans le catalogue.':'Informatique, affaires, technologie : trouvez la lecture qui fera avancer vos idées.';
  return pageHeading(title,subtitle,news?'Nouveautés':archive?'Archives':'Tous les livres')+`<div class="wrap catalog-layout"><aside class="filter-panel" aria-label="Filtrer les livres"><div class="filter-group"><h2>Les univers</h2><div class="filter-list">${['',...state.data.categories.map(c=>c.name)].map(c=>`<button class="filter-button ${c===category?'selected':''}" data-category="${escapeHtml(c)}" aria-pressed="${c===category}">${c||'Tous les livres'}<span>${base.filter(b=>!c||b.category===c).length}</span></button>`).join('')}</div></div><div class="filter-group field"><label for="condition">État du livre</label><select id="condition" data-filter="etat"><option value="">Tous les états</option><option ${condition==='Neuf'?'selected':''}>Neuf</option><option ${condition==='Occasion'?'selected':''}>Occasion</option></select></div><div class="filter-group field"><label for="stock-filter">Disponibilité</label><select id="stock-filter" data-filter="stock"><option value="">Tous les livres</option><option value="oui" ${stock?'selected':''}>En stock seulement</option></select></div><p class="filter-note">« La curiosité est<br>un beau début. »</p></aside><section aria-label="Résultats du catalogue">
  ${news?`<div class="notice"><p>Période : du ${dateText(state.data.cutoff)} au ${dateText(state.data.today)}. Les sélections plus anciennes sont conservées dans les <a class="text-link" href="#archives">archives</a>.</p></div>`:''}
  ${archive?'<div class="notice"><p>Ces anciennes nouveautés ne font plus partie de la sélection des six derniers mois. Les dates d’origine sont conservées.</p></div>':''}
  ${query?`<div class="search-summary">Recherche : « ${escapeHtml(query)} » <button class="text-button" data-clear-search>Effacer</button></div>`:''}
  <div class="catalog-toolbar"><p><strong>${books.length}</strong> livre${books.length>1?'s':''} ${category?'en '+escapeHtml(category.toLowerCase()):'à découvrir'}</p><div><label class="sr-only" for="sort">Trier les livres</label><select id="sort" data-filter="tri">${[['title','Titre : A à Z'],['priceAsc','Prix croissant'],['priceDesc','Prix décroissant'],['recent','Les plus récents']].map(([v,l])=>`<option value="${v}" ${sort===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
  ${books.length?`<div class="books-grid">${books.slice((page-1)*12,page*12).map(bookCard).join('')}</div>${pages>1?`<nav class="pagination" aria-label="Pages du catalogue">${Array.from({length:pages},(_,i)=>`<button data-page="${i+1}" ${page===i+1?'aria-current="page"':''} aria-label="Page ${i+1}">${i+1}</button>`).join('')}</nav>`:''}`:empty(news&&base.length===0?'Les prochaines découvertes se préparent.':'Aucun livre trouvé.',news&&base.length===0?'Aucune nouveauté n’a été enregistrée sur cette période. En attendant, explorez nos livres et nos anciennes sélections.':'Essayez un autre mot-clé ou retirez quelques filtres.',`<a class="button" href="#livres">Explorer le catalogue</a>${news?'<a class="button secondary" href="#archives">Voir les archives</a>':'<button class="button secondary" data-reset-filters>Réinitialiser les filtres</button>'}`)}
  </section></div>`;
}
function detail(id) {
  const b=bookById(id); if(!b) return `<div class="wrap section">${empty('Livre introuvable','Ce livre n’est pas disponible dans notre catalogue.','<a class="button" href="#livres">Retour au catalogue</a>')}</div>`;
  const related=state.data.books.filter(x=>x.category===b.category&&x.id!==b.id).slice(0,4);
  return `<div class="wrap"><div class="breadcrumb section-breadcrumb"><a href="#accueil">Accueil</a><span>/</span><a href="#livres">Livres</a><span>/</span><a href="#livres?categorie=${encodeURIComponent(b.category)}">${escapeHtml(b.category)}</a></div><article class="book-detail"><div class="detail-cover">${cover(b)}<span class="cover-disclaimer">Interprétation graphique · couverture non contractuelle</span></div><div class="detail-copy"><span class="book-category">${escapeHtml(b.category)} · ${escapeHtml(b.condition)}</span><h1>${escapeHtml(b.title)}</h1><p class="detail-author">par ${escapeHtml(b.author)}</p><div class="detail-price">${money(b.price)}</div><div class="stock">${icon(b.stock?'check':'clock')}${b.stock?`En stock · ${b.stock} exemplaires disponibles`:'Actuellement indisponible'}</div><p class="description" lang="en">${escapeHtml(b.description)}</p><form id="add-detail" data-book="${b.id}" class="purchase-row"><label class="sr-only" for="detail-quantity">Quantité</label><input id="detail-quantity" class="quantity-input" type="number" min="1" max="${Math.min(99,b.stock)||1}" step="1" value="1" required><button class="button" ${b.stock?'':'disabled'}>${icon('bag')} Ajouter au panier</button></form><dl><dt>ISBN</dt><dd>${escapeHtml(b.isbn)}</dd><dt>Éditeur</dt><dd>${escapeHtml(b.publisher)}</dd><dt>Édition</dt><dd>${b.published?dateText(b.published):'Non précisée'}</dd><dt>État</dt><dd>${escapeHtml(b.condition)}</dd></dl>${b.newsDate?`<div class="exclusive"><h2>${b.isNew?'Le petit plus':'Dans nos archives'}</h2><p>${b.isNew?'Nouveauté':'Ancienne nouveauté'} du ${dateText(b.newsDate)}.</p><p lang="en">${escapeHtml(b.exclusive)}</p></div>`:''}</div></article></div><section class="selection-section"><div class="wrap section"><div class="section-head"><h2>La curiosité continue.</h2><a class="text-link" href="#livres?categorie=${encodeURIComponent(b.category)}">Explorer cet univers</a></div><div class="books-grid">${related.map(bookCard).join('')}</div></div></section>`;
}
async function cartPage(renderId) {
  const items=state.cart.map(i=>({...i,book:bookById(i.id)})).filter(i=>i.book);
  if(!items.length) return pageHeading('Votre panier','Les belles découvertes commencent souvent par un premier livre.','Panier')+`<div class="wrap section">${empty('Votre prochaine lecture vous attend.','Votre panier est encore vide. Faites un tour dans la librairie pour trouver votre prochain livre.','<a class="button" href="#livres">Explorer la librairie</a>','bag')}</div>`;
  let profile=null,profileError='';
  if(state.user) try { profile=(await api('orders')).profile; } catch(error) { profileError=error.message; }
  if(renderId!==state.renderId) return null;
  const total=items.reduce((sum,i)=>sum+i.book.price*i.quantity,0);
  return pageHeading('Un peu plus dans votre panier.',`${items.reduce((sum,i)=>sum+i.quantity,0)} article(s) pour nourrir votre curiosité.`,'Panier')+`<div class="wrap cart-layout"><section aria-label="Articles du panier">${items.map(i=>`<article class="cart-line"><a class="mini-cover" href="#livre/${i.id}" aria-label="Voir ${escapeHtml(i.book.title)}">${cover(i.book)}</a><div><h2><a href="#livre/${i.id}">${escapeHtml(i.book.title)}</a></h2><p>${escapeHtml(i.book.author)}</p><p>${escapeHtml(i.book.condition)} · ${money(i.book.price)} / livre</p><button class="text-button remove" data-remove="${i.id}">Retirer du panier</button></div><div class="line-actions"><strong class="price">${money(i.book.price*i.quantity)}</strong><div class="stepper"><button data-quantity="${i.id}" data-delta="-1" aria-label="Diminuer la quantité de ${escapeHtml(i.book.title)}" ${i.quantity<=1?'disabled':''}>${icon('minus')}</button><span aria-label="Quantité">${i.quantity}</span><button data-quantity="${i.id}" data-delta="1" aria-label="Augmenter la quantité de ${escapeHtml(i.book.title)}" ${i.quantity>=Math.min(99,i.book.stock)?'disabled':''}>${icon('plus')}</button></div></div></article>`).join('')}<div class="button-row section"><a class="text-link" href="#livres">Continuer mes découvertes</a></div></section><aside class="summary-card"><h2>Votre commande</h2><div class="summary-row"><span>Livres</span><span>${money(total)}</span></div><div class="summary-row"><span>Frais supplémentaires</span><span>Aucuns</span></div><div class="summary-row summary-total"><span>Total</span><span>${money(total)}</span></div><p class="fine-print">Projet pédagogique : aucun paiement n’est prélevé et aucune expédition réelle n’est déclenchée. Le total correspond aux prix du catalogue.</p>${profile?`<div class="delivery-address"><h3>Adresse de livraison</h3><p>${escapeHtml(profile.prenom)} ${escapeHtml(profile.nom)}<br>${escapeHtml(profile.rue)}<br>${escapeHtml(profile.ville)}, ${escapeHtml(profile.province)} ${escapeHtml(profile.codePostal)}</p></div><form id="checkout"><label class="checkbox-label"><input type="checkbox" name="confirm" required><span>Je confirme les articles, les quantités et mon adresse de livraison.</span></label><div id="checkout-error" class="form-error" role="alert"></div><button class="button" type="submit">Confirmer ma commande</button></form>`:state.user?`<div class="form-error" role="alert">${escapeHtml(profileError||'Votre adresse n’est pas disponible.')}</div><button class="button" data-retry>Réessayer</button>`:'<button class="button" data-auth="login">Me connecter pour commander</button><p class="fine-print">Pas encore de compte ? <button class="text-button" data-auth="register">Inscrivez-vous</button> en quelques instants.</p>'}</aside></div>`;
}
async function accountPage(renderId) {
  if(!state.user) return pageHeading('Votre espace lecteur','Vos livres, vos commandes, vos prochaines découvertes.','Mon compte')+`<div class="wrap section">${empty('Ravi de vous retrouver.','Connectez-vous pour consulter vos commandes ou créez votre compte pour commencer.','<button class="button" data-auth="login">Me connecter</button><button class="button secondary" data-auth="register">Créer mon compte</button>','user')}</div>`;
  const data=await api('orders'); if(renderId!==state.renderId) return null;
  return pageHeading(`Bonjour, ${state.user.firstName}.`,'Bienvenue dans votre espace. Retrouvez ici l’historique de vos commandes.','Mon compte')+`<div class="wrap account-layout"><section aria-label="Historique des commandes">${state.receipt?`<div class="success-box" role="status">${icon('check')}<h2>Votre commande est enregistrée.</h2><p>Référence <strong>${escapeHtml(state.receipt.reference)}</strong> · ${money(state.receipt.total)}<br>Merci de cultiver votre curiosité avec nous.</p></div>`:''}${data.orders.length?data.orders.map(o=>`<article class="order-card"><header class="order-header"><div><h2>${escapeHtml(o.reference)}</h2><p>${dateText(o.date)} · ${o.items.reduce((s,i)=>s+i.quantity,0)} article(s)</p></div><span class="status-pill">${escapeHtml(o.status)}</span><strong>${money(o.total)}</strong></header><div class="order-body">${o.items.map(i=>`<div class="order-line"><span><a href="#livre/${i.id}">${escapeHtml(i.title)}</a><br><small>${i.quantity} × ${money(i.price)}</small></span><span>${money(i.price*i.quantity)}</span></div>`).join('')}<p class="order-address">Adresse enregistrée : ${escapeHtml(o.address)}</p></div></article>`).join(''):empty('Votre histoire commence ici.','Vous n’avez pas encore passé de commande. Le catalogue vous attend.','<a class="button" href="#livres">Découvrir les livres</a>')}</section><aside class="account-panel"><h2>Mes coordonnées</h2><p><strong>${escapeHtml(state.user.firstName)} ${escapeHtml(state.user.lastName)}</strong><br>@${escapeHtml(state.user.login)}</p>${data.profile?`<p>${escapeHtml(data.profile.rue)}<br>${escapeHtml(data.profile.ville)}, ${escapeHtml(data.profile.province)}<br>${escapeHtml(data.profile.codePostal)}<br>${escapeHtml(data.profile.tel)}</p>`:''}<button class="text-button" id="logout">Me déconnecter</button></aside></div>`;
}
function resources() { return pageHeading('Le coin des curieux','Une lecture ouvre souvent une autre porte. Voici quelques ressources pour continuer à apprendre.','Ressources')+`<section class="wrap section"><div class="resource-grid">${state.data.links.map(l=>`<article class="resource-card"><span class="domain">${escapeHtml(new URL(l.lienSite).hostname)}</span>${icon('book')}<h2>${escapeHtml(l.nomSite)}</h2><p>${escapeHtml(l.description)}</p><a class="text-link" href="${escapeHtml(l.lienSite)}" target="_blank" rel="noopener noreferrer">Explorer le site <span class="sr-only">(nouvel onglet)</span></a></article>`).join('')}</div></section>`; }
async function render(options={}) {
  if(!state.data) return;
  const id=++state.renderId; const {path,params}=getRoute();
  const active=path.startsWith('livre/')||path==='archives'?'livres':path;
  $$('[data-nav]').forEach(a=>{if(a.dataset.nav===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  let content;
  try {
    if(path==='accueil') content=home();
    else if(['livres','nouveautes','archives'].includes(path)) content=catalogue(path,params);
    else if(path.startsWith('livre/')) content=detail(path.split('/')[1]);
    else if(path==='panier') content=await cartPage(id);
    else if(path==='compte') content=await accountPage(id);
    else if(path==='ressources') content=resources();
    else content=`<div class="wrap section">${empty('Cette page s’est égarée.','Retrouvez votre chemin vers la librairie.','<a class="button" href="#accueil">Revenir à l’accueil</a>')}</div>`;
  } catch(error) { if(error.status===401){state.user=null;updateHeader();} content=`<div class="wrap section">${empty('Un instant, s’il vous plaît.',error.message,'<button class="button" data-retry>Réessayer</button>')}</div>`; }
  if(id!==state.renderId || content===null) return;
  main.innerHTML=content;
  const title=$('h1',main)?.textContent||'La librairie'; document.title=`${title} — UnPeuPlus`;
  if(options.scroll!==false) { window.scrollTo({top:0,behavior:'instant'}); main.focus({preventScroll:true}); }
  $('#search').value=params.get('q')||'';
}
function openAuth(mode='login') {
  const dialog=$('#auth-dialog'); const register=mode==='register';
  dialog.classList.toggle('register-dialog',register);
  $('#auth-content').innerHTML=`<div class="auth-heading"><div class="eyebrow">Votre espace UnPeuPlus</div><h2 id="auth-title">${register?'Bienvenue parmi les curieux.':'Heureux de vous retrouver.'}</h2><p>${register?'Quelques informations et votre prochaine lecture se rapproche.':'Connectez-vous pour retrouver vos commandes et continuer vos découvertes.'}</p></div><form id="auth-form" data-mode="${mode}">${register?`<div class="form-grid"><div class="field"><label for="firstName">Prénom</label><input id="firstName" name="firstName" autocomplete="given-name" maxlength="60" required></div><div class="field"><label for="lastName">Nom</label><input id="lastName" name="lastName" autocomplete="family-name" maxlength="60" required></div><div class="field full"><label for="street">Adresse</label><input id="street" name="street" autocomplete="street-address" maxlength="100" placeholder="Numéro et nom de rue" required></div><div class="field"><label for="city">Ville</label><input id="city" name="city" autocomplete="address-level2" maxlength="60" required></div><div class="field"><label for="province">Province ou territoire</label><select id="province" name="province" autocomplete="address-level1" required><option value="">Choisir</option>${Object.entries({AB:'Alberta',BC:'Colombie-Britannique',PE:'Île-du-Prince-Édouard',MB:'Manitoba',NB:'Nouveau-Brunswick',NS:'Nouvelle-Écosse',NU:'Nunavut',ON:'Ontario',QC:'Québec',SK:'Saskatchewan',NL:'Terre-Neuve-et-Labrador',NT:'Territoires du Nord-Ouest',YT:'Yukon'}).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="field"><label for="postalCode">Code postal</label><input id="postalCode" name="postalCode" autocomplete="postal-code" maxlength="7" placeholder="A1A 1A1" required></div><div class="field"><label for="phone">Téléphone</label><input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="24" placeholder="506 555-0123" required></div><div class="field full"><label for="login">Nom d’utilisateur</label><input id="login" name="login" autocomplete="username" minlength="3" maxlength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,39}" aria-describedby="login-help" required><small id="login-help">3 à 40 caractères : lettres, chiffres, point, tiret ou soulignement.</small></div><div class="field full"><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" aria-describedby="password-help" required><small id="password-help">Au moins 10 caractères. Une phrase facile à retenir convient aussi.</small></div><div class="field full"><label for="confirmPassword">Confirmer le mot de passe</label><input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></div></div>`:`<div class="field"><label for="login">Nom d’utilisateur</label><input id="login" name="login" autocomplete="username" maxlength="40" required></div><div class="field"><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required></div>`}<div class="form-error" id="auth-error" role="alert"></div><button class="button form-submit" type="submit">${register?'Créer mon compte':'Me connecter'}</button>${register?'<p class="auth-hint">Vos coordonnées servent à enregistrer vos commandes dans cette librairie pédagogique.</p>':''}</form><p class="auth-switch">${register?'Déjà un compte ?':'Pas encore membre ?'} <button class="text-button" data-auth="${register?'login':'register'}">${register?'Me connecter':'Créer mon compte'}</button></p>`;
  if(!dialog.open) dialog.showModal();
  setTimeout(()=>$('input',dialog)?.focus(),0);
}
document.addEventListener('click',async event=>{
  if(event.target.closest('.skip-link')) {event.preventDefault();main.focus();main.scrollIntoView({block:'start'});return;}
  const button=event.target.closest('button'); if(!button) return;
  if(button.dataset.auth) {openAuth(button.dataset.auth);return;}
  if(button.matches('.close-dialog')) {$('#auth-dialog').close();return;}
  if(button.id==='account-button') {if(state.user)location.hash='compte';else openAuth();return;}
  if(button.dataset.add) {addBook(Number(button.dataset.add));return;}
  if(button.hasAttribute('data-category')) {setFilter('categorie',button.dataset.category);return;}
  if(button.dataset.page) {setFilter('page',button.dataset.page);return;}
  if(button.hasAttribute('data-clear-search')) {setFilter('q','');return;}
  if(button.hasAttribute('data-reset-filters')) {location.hash=getRoute().path;return;}
  if(button.hasAttribute('data-retry')) {render({scroll:false});return;}
  if(button.dataset.remove) {state.cart=state.cart.filter(i=>i.id!==Number(button.dataset.remove));saveCart();render({scroll:false});return;}
  if(button.dataset.quantity) {const item=state.cart.find(i=>i.id===Number(button.dataset.quantity)); if(!item)return;const n=item.quantity+Number(button.dataset.delta);if(n>=1&&n<=Math.min(99,bookById(item.id).stock)){item.quantity=n;saveCart();render({scroll:false});}return;}
  if(button.id==='logout') {
    button.disabled=true;
    try {setSession(await api('logout',{}));state.receipt=null;toast('Vous êtes déconnecté. À bientôt !');await render({scroll:false});}catch(error){toast(error.message);button.disabled=false;}
  }
});
document.addEventListener('change',event=>{if(event.target.dataset.filter)setFilter(event.target.dataset.filter,event.target.value);});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(form.id==='global-search') {event.preventDefault();const query=$('#search').value.trim();location.hash='livres'+(query?'?q='+encodeURIComponent(query):'');return;}
  if(form.id==='add-detail') {event.preventDefault();addBook(Number(form.dataset.book),Number($('#detail-quantity').value));return;}
  if(form.id==='auth-form') {
    event.preventDefault();const body=Object.fromEntries(new FormData(form));const error=$('#auth-error');error.textContent='';
    if(form.dataset.mode==='register'&&body.password!==body.confirmPassword){error.textContent='Les deux mots de passe ne correspondent pas.';$('#confirmPassword').focus();return;}
    const submit=$('[type=submit]',form);submit.disabled=true;submit.textContent='Un instant…';
    try {setSession(await api(form.dataset.mode,body));$('#auth-dialog').close();state.receipt=null;toast(form.dataset.mode==='register'?'Votre compte est créé. Bienvenue !':'Connexion réussie.');await render({scroll:false});}
    catch(e){error.textContent=e.message;submit.disabled=false;submit.textContent=form.dataset.mode==='register'?'Créer mon compte':'Me connecter';}
    return;
  }
  if(form.id==='checkout') {
    event.preventDefault();const submit=$('[type=submit]',form);submit.disabled=true;submit.textContent='Enregistrement…';$('#checkout-error').textContent='';
    if(!state.orderToken)saveCart();
    try {
      const receipt=await api('order',{token:state.orderToken,items:state.cart.map(i=>({id:i.id,quantity:i.quantity}))});
      state.receipt=receipt;state.cart=[];saveCart();
      try{state.data=await api('catalogue');}catch{/* La commande confirmée reste consultable même si le rafraîchissement échoue. */}
      location.hash='compte';
    } catch(e){$('#checkout-error').textContent=e.message;submit.disabled=false;submit.textContent='Confirmer ma commande';if(e.status===401)openAuth();}
  }
});
window.addEventListener('hashchange',()=>render());
$('#auth-dialog').addEventListener('click',event=>{if(event.target===$('#auth-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
async function boot() {
  $('#year').textContent=new Date().getFullYear();
  try {
    const [data,session]=await Promise.all([api('catalogue'),api('session')]);state.data=data;setSession(session);
    state.cart=state.cart.filter(i=>bookById(i.id));saveCart(false);await render({scroll:false});
  } catch(error) {main.innerHTML=`<div class="wrap section">${empty('La librairie n’a pas pu ouvrir.',error.message,'<button class="button" id="reload">Réessayer</button>')}</div>`;$('#reload').addEventListener('click',boot);}
}
boot();
