'use strict';
const API = 'https://api.jikan.moe/v4';
const $ = (id) => document.getElementById(id);
const state = { anime: new Map(), current: null, episode: 1, searchPage: 1, searchQuery: '', searchResults: [], episodePage: 1, episodeHasNext: false, previousPage: 'home', toastTimer: null };
const WATCH_KEY = 'anifox_watchlist_v2';
const cache = new Map();
let searchTimer = null;
let activeObjectUrl = null;

window.addEventListener('load', () => {
  const bar = $('progress-bar'); let p = 0;
  const timer = setInterval(() => { p = Math.min(100, p + 8 + Math.random()*13); bar.style.width = p + '%'; if (p >= 100) { clearInterval(timer); setTimeout(enterApp, 250); } }, 55);
  $('btn-skip').addEventListener('click', enterApp);
  $('quick-search').addEventListener('click', () => navigate('search'));
  $('profile-button').addEventListener('click', () => toast('Watchlist tersimpan di perangkat ini.'));
  document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.page)));
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goBack));
  $('search-input').addEventListener('input', onSearchInput);
  $('clear-search').addEventListener('click', () => { $('search-input').value=''; $('search-input').focus(); onSearchInput(); });
  $('search-order').addEventListener('change', sortSearch);
  $('load-more').addEventListener('click', loadMoreSearch);
  $('hero-open').addEventListener('click', () => state.featured && openDetail(state.featured));
  $('detail-watchlist').addEventListener('click', toggleWatchlist);
  $('episodes-more').addEventListener('click', loadMoreEpisodes);
  $('load-video').addEventListener('click', loadVideoUrl);
  $('video-file').addEventListener('change', loadLocalVideo);
  $('prev-episode').addEventListener('click', () => changeEpisode(-1));
  $('next-episode').addEventListener('click', () => changeEpisode(1));
  document.querySelectorAll('[data-genre]').forEach(b => b.addEventListener('click', () => { navigate('search'); $('search-input').value=b.dataset.genre; runSearch(b.dataset.genre,1); }));
  enterApp();
});

function enterApp() {
  if (!$('app').classList.contains('hidden')) return;
  $('splash').classList.add('fade-out'); $('app').classList.remove('hidden');
  loadHome();
}
function toast(message) {
  const el=$('toast'); el.textContent=message; el.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove('show'),2300);
}
function navigate(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const target=$('page-'+page); if(!target) return;
  target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  if(page==='list') renderWatchlist();
  if(page==='season' && !$('season-full').dataset.loaded) loadSeason(true);
  if(page==='popular' && !$('popular-full').dataset.loaded) loadPopular(true);
  window.scrollTo({top:0,behavior:'smooth'});
}
function goBack() { navigate(state.previousPage || 'home'); }
function esc(s='') { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function imageOf(a) { return a?.images?.webp?.large_image_url || a?.images?.jpg?.large_image_url || ''; }
function remember(items) { (items||[]).forEach(a=>{ if(a?.mal_id) state.anime.set(a.mal_id,a); }); }
async function api(path) {
  if(cache.has(path)) return cache.get(path);
  const response=await fetch(API+path);
  if(!response.ok) throw new Error(response.status===429?'Server katalog sedang ramai. Coba lagi sebentar.':`Koneksi katalog gagal (${response.status}).`);
  const data=await response.json(); cache.set(path,data); return data;
}
function cardHTML(a) {
  const img=imageOf(a), title=esc(a.title_english||a.title||'Untitled');
  return `<article class="anime-card" data-id="${a.mal_id}" tabindex="0" role="button" aria-label="Detail ${title}">
    <div class="poster-wrap"><img src="${esc(img)}" alt="${title}" loading="lazy" onerror="this.style.opacity='.2'"><span class="poster-score">${a.score??'N/A'}</span></div>
    <h3 class="poster-title">${title}</h3><p class="poster-meta">${esc(a.year||a.season||a.type||'Anime')} · ${a.episodes??'?'} eps</p></article>`;
}
function bindCards(root) {
  root.querySelectorAll('.anime-card').forEach(card=>{
    const open=()=>{const a=state.anime.get(Number(card.dataset.id));if(a)openDetail(a);};
    card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
}
function renderCards(target,items,empty='Belum ada anime untuk ditampilkan.') {
  const el=typeof target==='string'?$(target):target;
  if(!items?.length){el.innerHTML=`<div class="empty-message">${esc(empty)}</div>`;return;}
  el.innerHTML=items.map(cardHTML).join('');bindCards(el);
}
async function loadHome() {
  try {
    const [top,season]=await Promise.all([api('/top/anime?limit=18'),api('/seasons/now?limit=12')]);
    remember(top.data);remember(season.data);
    const featured=top.data[0];state.featured=featured;
    $('hero-title').textContent=featured.title_english||featured.title;
    $('hero-meta').textContent=`${featured.year||'Anime'} · ★ ${featured.score||'—'} · ${featured.type||'Series'}`;
    $('hero-art').style.backgroundImage=`url("${imageOf(featured)}")`;
    renderCards('season-list',season.data.slice(0,10));
    renderCards('popular-list',top.data.slice(1,11));
  } catch(e) { $('season-list').innerHTML=`<div class="empty-message">${esc(e.message)}</div>`; $('popular-list').innerHTML='<div class="empty-message">Periksa koneksi internet lalu muat ulang halaman.</div>'; }
}
async function loadSeason(full=false) {
  const target=full?'season-full':'season-list'; $(target).innerHTML='<div class="empty-message">Memuat katalog musim ini…</div>';
  try {const d=await api('/seasons/now?limit=24');remember(d.data);renderCards(target,full?d.data:d.data.slice(0,10));if(full)$(target).dataset.loaded='1';}
  catch(e){$(target).innerHTML=`<div class="empty-message">${esc(e.message)}</div>`;}
}
async function loadPopular(full=false) {
  const target=full?'popular-full':'popular-list';$(target).innerHTML='<div class="empty-message">Memuat anime populer…</div>';
  try{const d=await api('/top/anime?limit=24');remember(d.data);renderCards(target,d.data);if(full)$(target).dataset.loaded='1';}
  catch(e){$(target).innerHTML=`<div class="empty-message">${esc(e.message)}</div>`;}
}
function onSearchInput(){clearTimeout(searchTimer);const q=$('search-input').value.trim();$('clear-search').style.visibility=q?'visible':'hidden';if(!q){$('search-results').innerHTML='';$('search-caption').textContent='MULAI DENGAN SEBUAH JUDUL';$('load-more').classList.add('hidden');return;}searchTimer=setTimeout(()=>runSearch(q,1),500);}
async function runSearch(q,page=1) {
  state.searchQuery=q;state.searchPage=page;
  $('search-caption').textContent='SEARCHING THE INDEX…';$('search-results').innerHTML='<div class="empty-message">Mencari anime…</div>';$('load-more').classList.add('hidden');
  try{const d=await api(`/anime?q=${encodeURIComponent(q)}&page=${page}&limit=15&sfw=true`);remember(d.data);state.searchResults=page===1?d.data:state.searchResults.concat(d.data);renderCards('search-results',state.searchResults,'Tidak ada judul yang cocok. Coba kata kunci lain.');$('search-caption').textContent=`${d.pagination.items.total??state.searchResults.length} HASIL DITEMUKAN`;$('load-more').classList.toggle('hidden',!d.pagination.has_next_page);}
  catch(e){$('search-results').innerHTML=`<div class="empty-message">${esc(e.message)}</div>`;$('search-caption').textContent='SEARCH UNAVAILABLE';}
}
async function loadMoreSearch(){if(!state.searchQuery)return;const next=state.searchPage+1;try{const d=await api(`/anime?q=${encodeURIComponent(state.searchQuery)}&page=${next}&limit=15&sfw=true`);remember(d.data);state.searchPage=next;state.searchResults=state.searchResults.concat(d.data);renderCards('search-results',state.searchResults);$('load-more').classList.toggle('hidden',!d.pagination.has_next_page);}catch(e){toast(e.message);}}
function sortSearch(){const key=$('search-order').value;const list=[...state.searchResults];list.sort((a,b)=>key==='title'?(a.title||'').localeCompare(b.title||''):key==='episodes'?(b.episodes||0)-(a.episodes||0):(b.score||0)-(a.score||0));renderCards('search-results',list);}
function openDetail(anime) {
  state.current=anime;state.previousPage=document.querySelector('.page.active')?.id.replace('page-','')||'home';
  $('detail-img').src=imageOf(anime);$('detail-poster').src=imageOf(anime);
  $('detail-title').textContent=anime.title_english||anime.title;
  $('detail-type').textContent=(anime.type||'ANIME PROFILE').toUpperCase();
  $('detail-stats').innerHTML=[`★ ${anime.score??'N/A'}`,anime.year||anime.aired?.string||'Year unknown',anime.episodes??'? episodes',anime.status||'Unknown'].map(x=>`<span>${esc(x)}</span>`).join('');
  $('detail-synopsis').textContent=anime.synopsis||'Sinopsis belum tersedia pada katalog.';
  $('detail-genres').innerHTML=(anime.genres||[]).concat(anime.themes||[]).map(g=>`<button type="button" data-detail-genre="${esc(g.name)}">${esc(g.name)}</button>`).join('')||'<span class="muted-note">Genre belum tersedia.</span>';
  $('detail-genres').querySelectorAll('[data-detail-genre]').forEach(b=>b.addEventListener('click',()=>{navigate('search');$('search-input').value=b.dataset.detailGenre;runSearch(b.dataset.detailGenre,1);}));
  const facts=[['Japanese',anime.title_japanese],['Type',anime.type],['Source',anime.source],['Season',anime.season&&anime.year?`${anime.season} ${anime.year}`:null],['Episodes',anime.episodes],['Duration',anime.duration],['Rating',anime.rating],['Studio',(anime.studios||[]).map(x=>x.name).join(', ')]];
  $('detail-facts').innerHTML=facts.filter(x=>x[1]).map(x=>`<div class="fact"><span>${esc(x[0])}</span><span>${esc(x[1])}</span></div>`).join('');
  $('detail-official').href=anime.url||'https://myanimelist.net/';
  updateWatchButton();$('detail-episodes-list').innerHTML='<div class="empty-message">Memuat daftar episode…</div>';
  $('episodes-more').classList.add('hidden');state.episodePage=1;loadEpisodes(anime.mal_id,1,true);
  navigate('detail');
}
function getWatchlist(){try{return JSON.parse(localStorage.getItem(WATCH_KEY)||'[]');}catch{return [];}}
function saveWatchlist(list){localStorage.setItem(WATCH_KEY,JSON.stringify(list));}
function isSaved(id){return getWatchlist().some(a=>a.mal_id===id);}
function updateWatchButton(){$('detail-watchlist').textContent=isSaved(state.current.mal_id)?'✓ Tersimpan':'＋ Watchlist';}
function toggleWatchlist(){if(!state.current)return;let list=getWatchlist();if(isSaved(state.current.mal_id)){list=list.filter(a=>a.mal_id!==state.current.mal_id);toast('Dihapus dari watchlist.');}else{list.unshift({mal_id:state.current.mal_id,title:state.current.title,title_english:state.current.title_english,images:state.current.images,score:state.current.score,episodes:state.current.episodes,type:state.current.type,year:state.current.year});toast('Disimpan ke watchlist.');}saveWatchlist(list);updateWatchButton();}
function renderWatchlist(){const list=getWatchlist();list.forEach(a=>state.anime.set(a.mal_id,a));renderCards('watchlist',list,'Watchlist masih kosong. Simpan anime dari halaman detail.');}
async function loadEpisodes(id,page=1,replace=false){
  try{const d=await api(`/anime/${id}/episodes?page=${page}`);const host=$('detail-episodes-list');const html=(d.data||[]).map(ep=>`<button type="button" data-ep="${ep.mal_id}" data-number="${ep.mal_id?ep.mal_id:ep.episode}">${esc(ep.mal_id?`Ep ${ep.episode}`:`${ep.episode}`)}</button>`).join('');
    if(replace)host.innerHTML=html||'<div class="empty-message">Daftar episode belum tersedia dari katalog.</div>';else host.insertAdjacentHTML('beforeend',html);
    host.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>openPlayer(Number(b.textContent.replace(/\D/g,''))||1)));
    state.episodeHasNext=!!d.pagination?.has_next_page;state.episodePage=page;$('episodes-more').classList.toggle('hidden',!state.episodeHasNext);
    $('episode-note').textContent='Nomor dan judul episode mengikuti data katalog; video perlu sumber legal terpisah.';
  }catch(e){$('detail-episodes-list').innerHTML='<div class="empty-message">Data episode belum tersedia. Kamu tetap bisa memilih nomor episode di pemutar.</div>';}
}
async function loadMoreEpisodes(){if(state.episodeHasNext&&state.current)loadEpisodes(state.current.mal_id,state.episodePage+1,false);}
function openPlayer(ep=1){
  state.episode=Math.max(1,ep);$('player-title').textContent=state.current.title_english||state.current.title;$('player-episode').textContent=`Episode ${state.episode}`;
  const count=Math.min(state.current.episodes||24,100);$('player-episodes-list').innerHTML=Array.from({length:count},(_,i)=>`<button class="${i+1===state.episode?'active':''}" data-episode="${i+1}">${i+1}</button>`).join('');
  $('player-episodes-list').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>openPlayer(Number(b.dataset.episode))));
  $('video-url').value='';stopVideo();$('video-empty').style.display='flex';navigate('player');updatePlayerNav();
}
function updatePlayerNav(){$('prev-episode').disabled=state.episode<=1;$('next-episode').disabled=!!(state.current.episodes&&state.episode>=state.current.episodes);}
function changeEpisode(delta){const next=state.episode+delta;if(next<1||(state.current.episodes&&next>state.current.episodes))return;openPlayer(next);}
function stopVideo(){const v=$('video-player');v.pause();v.removeAttribute('src');v.load();v.classList.remove('visible');if(activeObjectUrl){URL.revokeObjectURL(activeObjectUrl);activeObjectUrl=null;}}
function playSource(url){try{const parsed=new URL(url);if(!['https:','http:','blob:'].includes(parsed.protocol))throw new Error();}catch{toast('URL video tidak valid.');return;}
  const v=$('video-player');stopVideo();v.src=url;v.classList.add('visible');$('video-empty').style.display='none';v.play().catch(()=>toast('Tekan tombol play pada pemutar untuk mulai.'));
}
function loadVideoUrl(){const url=$('video-url').value.trim();if(!url){toast('Masukkan URL video terlebih dahulu.');return;}playSource(url);}
function loadLocalVideo(e){const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('video/')){toast('Pilih file video yang didukung.');return;}stopVideo();activeObjectUrl=URL.createObjectURL(file);const v=$('video-player');v.src=activeObjectUrl;v.classList.add('visible');$('video-empty').style.display='none';v.play().catch(()=>toast('Tekan tombol play pada pemutar untuk mulai.'));}
