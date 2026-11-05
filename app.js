'use strict';

const API = 'https://api.jikan.moe/v4';

const $ = id => document.getElementById(id);

const state = {
  anime: new Map(),
  current: null,
  featured: null,
  episode: 1,
  searchPage: 1,
  searchQuery: '',
  searchResults: [],
  searchRequestId: 0,
  episodePage: 1,
  episodeHasNext: false,
  previousPage: 'home',
  toastTimer: null
};

const WATCH_KEY = 'anifox_watchlist_v2';
const CACHE_PREFIX = 'anifox_api_';

const cache = new Map();

let searchTimer = null;
let activeObjectUrl = null;


// ========================================
// INITIALIZATION
// ========================================

window.addEventListener('load', () => {

  const bar = $('progress-bar');
  let progress = 0;

  const timer = setInterval(() => {
    progress = Math.min(100, progress + 10);

    if (bar) bar.style.width = progress + '%';

    if (progress >= 100) {
      clearInterval(timer);
      enterApp();
    }
  }, 70);

  $('btn-skip')?.addEventListener('click', () => {
    clearInterval(timer);
    enterApp();
  });

  $('quick-search')?.addEventListener('click', () => {
    navigate('search');
  });

  $('profile-button')?.addEventListener('click', () => {
    toast('Watchlist tersimpan di perangkat ini.');
  });

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      navigate(button.dataset.page);
    });
  });

  document.querySelectorAll('[data-go]').forEach(button => {
    button.addEventListener('click', () => {
      navigate(button.dataset.go);
    });
  });

  document.querySelectorAll('[data-back]').forEach(button => {
    button.addEventListener('click', goBack);
  });

  $('search-input')?.addEventListener('input', onSearchInput);

  $('clear-search')?.addEventListener('click', () => {
    $('search-input').value = '';
    $('search-input').focus();
    onSearchInput();
  });

  $('search-order')?.addEventListener('change', sortSearch);

  $('load-more')?.addEventListener('click', loadMoreSearch);

  $('hero-open')?.addEventListener('click', () => {
    if (state.featured) openDetail(state.featured);
  });

  $('detail-watchlist')?.addEventListener('click', toggleWatchlist);

  $('episodes-more')?.addEventListener('click', loadMoreEpisodes);

  $('load-video')?.addEventListener('click', loadVideoUrl);

  $('video-file')?.addEventListener('change', loadLocalVideo);

  $('prev-episode')?.addEventListener('click', () => {
    changeEpisode(-1);
  });

  $('next-episode')?.addEventListener('click', () => {
    changeEpisode(1);
  });

  document.querySelectorAll('[data-genre]').forEach(button => {
    button.addEventListener('click', () => {
      navigate('search');

      $('search-input').value = button.dataset.genre;

      runSearch(button.dataset.genre, 1);
    });
  });

  $('video-player')?.addEventListener('error', () => {
    toast('Video gagal diputar. Periksa sumber videonya.');
  });

  enterApp();
});


// ========================================
// APP NAVIGATION
// ========================================

function enterApp() {
  if (!$('app') || !$('splash')) return;

  if (!$('app').classList.contains('hidden')) return;

  $('splash').classList.add('fade-out');
  $('app').classList.remove('hidden');

  loadHome();
}

function navigate(page) {

  document.querySelectorAll('.page').forEach(element => {
    element.classList.remove('active');
  });

  const target = $('page-' + page);

  if (!target) return;

  target.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.page === page
    );
  });

  if (page === 'list') {
    renderWatchlist();
  }

  if (page === 'season' && !$('season-full').dataset.loaded) {
    loadSeason(true);
  }

  if (page === 'popular' && !$('popular-full').dataset.loaded) {
    loadPopular(true);
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function goBack() {
  navigate(state.previousPage || 'home');
}


// ========================================
// GENERAL HELPERS
// ========================================

function toast(message) {

  const element = $('toast');

  if (!element) return;

  element.textContent = message;
  element.classList.add('show');

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    element.classList.remove('show');
  }, 2500);
}

function esc(value = '') {

  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

}

function imageOf(anime) {

  return anime?.images?.webp?.large_image_url ||
    anime?.images?.jpg?.large_image_url ||
    '';

}

function remember(items) {

  (items || []).forEach(anime => {
    if (anime?.mal_id) {
      state.anime.set(anime.mal_id, anime);
    }
  });

}


// ========================================
// API SYSTEM
// RETRY + TIMEOUT + LOCAL CACHE
// ========================================

async function api(path) {

  // Gunakan cache RAM terlebih dahulu
  if (cache.has(path)) {
    return cache.get(path);
  }

  const storageKey = CACHE_PREFIX + path;

  let saved = null;

  // Ambil cache dari penyimpanan HP
  try {

    const raw = localStorage.getItem(storageKey);

    if (raw) {
      saved = JSON.parse(raw);
    }

  } catch (error) {
    console.warn('Cache lokal tidak bisa dibaca:', error);
  }

  let lastError = null;

  // Maksimal 3 percobaan
  for (let attempt = 1; attempt <= 3; attempt++) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 10000);

    try {

      const response = await fetch(API + path, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {

        if (response.status === 429) {
          throw new Error(
            'Server katalog sedang ramai. Coba lagi sebentar.'
          );
        }

        throw new Error(
          `Koneksi katalog gagal (${response.status}).`
        );

      }

      const data = await response.json();

      if (!data || !Array.isArray(data.data)) {
        throw new Error('Format data katalog tidak valid.');
      }

      // Simpan cache RAM
      cache.set(path, data);

      // Simpan cache HP
      try {

        localStorage.setItem(
          storageKey,
          JSON.stringify({
            time: Date.now(),
            data: data
          })
        );

      } catch (error) {
        console.warn('Cache HP penuh atau tidak tersedia:', error);
      }

      return data;

    } catch (error) {

      lastError = error;

      console.warn(
        `API gagal (${attempt}/3):`,
        error.message
      );

      if (attempt < 3) {

        await new Promise(resolve => {
          setTimeout(resolve, attempt * 1500);
        });

      }

    } finally {

      clearTimeout(timeout);

    }

  }

  // Jika API gagal, gunakan cache lama
  if (saved?.data && Array.isArray(saved.data.data)) {

    console.warn('Menggunakan katalog tersimpan.');

    cache.set(path, saved.data);

    return saved.data;

  }

  throw lastError || new Error('Katalog gagal dimuat.');

}


// ========================================
// ANIME CARDS
// ========================================

function cardHTML(anime) {

  const image = imageOf(anime);

  const title = esc(
    anime.title_english || anime.title || 'Untitled'
  );

  return `
    <article
      class="anime-card"
      data-id="${anime.mal_id}"
      tabindex="0"
      role="button"
      aria-label="Detail ${title}"
    >

      <div class="poster-wrap">

        <img
          src="${esc(image)}"
          alt="${title}"
          loading="lazy"
          onerror="this.style.opacity='.2'"
        >

        <span class="poster-score">
          ${anime.score ?? 'N/A'}
        </span>

      </div>

      <h3 class="poster-title">${title}</h3>

      <p class="poster-meta">
        ${esc(anime.year || anime.season || anime.type || 'Anime')}
        · ${anime.episodes ?? '?'} eps
      </p>

    </article>
  `;

}

function bindCards(root) {

  root.querySelectorAll('.anime-card').forEach(card => {

    const open = () => {

      const anime = state.anime.get(
        Number(card.dataset.id)
      );

      if (anime) openDetail(anime);

    };

    card.addEventListener('click', open);

    card.addEventListener('keydown', event => {

      if (event.key === 'Enter' || event.key === ' ') {

        event.preventDefault();

        open();

      }

    });

  });

}

function renderCards(target, items, empty = 'Belum ada anime untuk ditampilkan.') {

  const element = typeof target === 'string'
    ? $(target)
    : target;

  if (!element) return;

  if (!items?.length) {

    element.innerHTML = `
      <div class="empty-message">
        ${esc(empty)}
      </div>
    `;

    return;

  }

  element.innerHTML = items.map(cardHTML).join('');

  bindCards(element);

}


// ========================================
// HOME PAGE
// ========================================

async function loadHome() {

  $('season-list').innerHTML = `
    <div class="empty-message">
      Memuat katalog anime...
    </div>
  `;

  $('popular-list').innerHTML = `
    <div class="empty-message">
      Menyiapkan anime populer...
    </div>
  `;

  // Jangan biarkan satu API gagal membatalkan API lainnya
  const results = await Promise.allSettled([

    api('/top/anime?limit=18'),

    api('/seasons/now?limit=12')

  ]);

  const top = results[0];
  const season = results[1];

  let featured = null;

  if (top.status === 'fulfilled') {

    remember(top.value.data);

    featured = top.value.data[0] || null;

    renderCards(
      'popular-list',
      top.value.data.slice(1, 11)
    );

  } else {

    $('popular-list').innerHTML = `
      <div class="empty-message">
        ${esc(top.reason.message)}
      </div>
    `;

  }

  if (season.status === 'fulfilled') {

    remember(season.value.data);

    renderCards(
      'season-list',
      season.value.data.slice(0, 10)
    );

    if (!featured) {
      featured = season.value.data[0] || null;
    }

  } else {

    $('season-list').innerHTML = `
      <div class="empty-message">
        ${esc(season.reason.message)}
      </div>
    `;

  }

  if (featured) {

    state.featured = featured;

    $('hero-title').textContent =
      featured.title_english || featured.title;

    $('hero-meta').textContent =
      `${featured.year || 'Anime'} · ★ ${featured.score || '—'} · ${featured.type || 'Series'}`;

    $('hero-art').style.backgroundImage =
      `url("${imageOf(featured)}")`;

  }

}


// ========================================
// SEASON PAGE
// ========================================

async function loadSeason(full = false) {

  const target = full ? 'season-full' : 'season-list';

  $(target).innerHTML = `
    <div class="empty-message">
      Memuat katalog musim ini...
    </div>
  `;

  try {

    const data = await api('/seasons/now?limit=24');

    remember(data.data);

    renderCards(
      target,
      full ? data.data : data.data.slice(0, 10)
    );

    if (full) {
      $(target).dataset.loaded = '1';
    }

  } catch (error) {

    $(target).innerHTML = `
      <div class="empty-message">
        ${esc(error.message)}
      </div>
    `;

  }

}


// ========================================
// POPULAR PAGE
// ========================================

async function loadPopular(full = false) {

  const target = full ? 'popular-full' : 'popular-list';

  $(target).innerHTML = `
    <div class="empty-message">
      Memuat anime populer...
    </div>
  `;

  try {

    const data = await api('/top/anime?limit=24');

    remember(data.data);

    renderCards(target, data.data);

    if (full) {
      $(target).dataset.loaded = '1';
    }

  } catch (error) {

    $(target).innerHTML = `
      <div class="empty-message">
        ${esc(error.message)}
      </div>
    `;

  }

}


// ========================================
// SEARCH
// ========================================

function onSearchInput() {

  clearTimeout(searchTimer);

  const query = $('search-input').value.trim();

  $('clear-search').style.visibility =
    query ? 'visible' : 'hidden';

  if (!query) {

    state.searchRequestId++;

    $('search-results').innerHTML = '';

    $('search-caption').textContent =
      'MULAI DENGAN SEBUAH JUDUL';

    $('load-more').classList.add('hidden');

    return;

  }

  searchTimer = setTimeout(() => {
    runSearch(query, 1);
  }, 500);

}

async function runSearch(query, page = 1) {

  const requestId = ++state.searchRequestId;

  state.searchQuery = query;
  state.searchPage = page;

  $('search-caption').textContent =
    'SEARCHING THE INDEX...';

  $('search-results').innerHTML = `
    <div class="empty-message">
      Mencari anime...
    </div>
  `;

  $('load-more').classList.add('hidden');

  try {

    const data = await api(
      `/anime?q=${encodeURIComponent(query)}&page=${page}&limit=15&sfw=true`
    );

    // Abaikan hasil pencarian yang sudah kedaluwarsa
    if (requestId !== state.searchRequestId) return;

    remember(data.data);

    state.searchResults = page === 1
      ? data.data
      : state.searchResults.concat(data.data);

    renderCards(
      'search-results',
      state.searchResults,
      'Tidak ada judul yang cocok. Coba kata kunci lain.'
    );

    $('search-caption').textContent =
      `${data.pagination?.items?.total ?? state.searchResults.length} HASIL DITEMUKAN`;

    $('load-more').classList.toggle(
      'hidden',
      !data.pagination?.has_next_page
    );

  } catch (error) {

    if (requestId !== state.searchRequestId) return;

    $('search-results').innerHTML = `
      <div class="empty-message">
        ${esc(error.message)}
        <br><br>
        <button onclick="runSearch(state.searchQuery, 1)">
          Coba Lagi
        </button>
      </div>
    `;

    $('search-caption').textContent =
      'SEARCH UNAVAILABLE';

  }

}

async function loadMoreSearch() {

  if (!state.searchQuery) return;

  const next = state.searchPage + 1;

  try {

    const data = await api(
      `/anime?q=${encodeURIComponent(state.searchQuery)}&page=${next}&limit=15&sfw=true`
    );

    remember(data.data);

    state.searchPage = next;

    state.searchResults =
      state.searchResults.concat(data.data);

    renderCards('search-results', state.searchResults);

    $('load-more').classList.toggle(
      'hidden',
      !data.pagination?.has_next_page
    );

  } catch (error) {

    toast(error.message);

  }

}

function sortSearch() {

  const key = $('search-order').value;

  const list = [...state.searchResults];

  list.sort((a, b) => {

    if (key === 'title') {

      return (a.title || '').localeCompare(
        b.title || ''
      );

    }

    if (key === 'episodes') {

      return (b.episodes || 0) - (a.episodes || 0);

    }

    return (b.score || 0) - (a.score || 0);

  });

  renderCards('search-results', list);

}


// ========================================
// ANIME DETAIL
// ========================================

function openDetail(anime) {

  state.current = anime;

  state.previousPage =
    document.querySelector('.page.active')
      ?.id.replace('page-', '') || 'home';

  $('detail-img').src = imageOf(anime);

  $('detail-poster').src = imageOf(anime);

  $('detail-title').textContent =
    anime.title_english || anime.title;

  $('detail-type').textContent =
    (anime.type || 'ANIME PROFILE').toUpperCase();

  $('detail-stats').innerHTML = [

    `★ ${anime.score ?? 'N/A'}`,

    anime.year || anime.aired?.string || 'Year unknown',

    anime.episodes ?? '? episodes',

    anime.status || 'Unknown'

  ].map(value => `
    <span>${esc(value)}</span>
  `).join('');

  $('detail-synopsis').textContent =
    anime.synopsis ||
    'Sinopsis belum tersedia pada katalog.';

  $('detail-genres').innerHTML =
    (anime.genres || [])
      .concat(anime.themes || [])
      .map(genre => `
        <button
          type="button"
          data-detail-genre="${esc(genre.name)}"
        >
          ${esc(genre.name)}
        </button>
      `).join('') ||
    '<span class="muted-note">Genre belum tersedia.</span>';

  $('detail-genres')
    .querySelectorAll('[data-detail-genre]')
    .forEach(button => {

      button.addEventListener('click', () => {

        navigate('search');

        $('search-input').value =
          button.dataset.detailGenre;

        runSearch(button.dataset.detailGenre, 1);

      });

    });

  const facts = [

    ['Japanese', anime.title_japanese],

    ['Type', anime.type],

    ['Source', anime.source],

    [
      'Season',
      anime.season && anime.year
        ? `${anime.season} ${anime.year}`
        : null
    ],

    ['Episodes', anime.episodes],

    ['Duration', anime.duration],

    ['Rating', anime.rating],

    [
      'Studio',
      (anime.studios || [])
        .map(studio => studio.name)
        .join(', ')
    ]

  ];

  $('detail-facts').innerHTML =
    facts
      .filter(item => item[1])
      .map(item => `
        <div class="fact">
          <span>${esc(item[0])}</span>
          <span>${esc(item[1])}</span>
        </div>
      `).join('');

  $('detail-official').href =
    anime.url || 'https://myanimelist.net/';

  updateWatchButton();

  $('detail-episodes-list').innerHTML = `
    <div class="empty-message">
      Memuat daftar episode...
    </div>
  `;

  $('episodes-more').classList.add('hidden');

  state.episodePage = 1;

  loadEpisodes(anime.mal_id, 1, true);

  navigate('detail');

}


// ========================================
// WATCHLIST
// ========================================

function getWatchlist() {

  try {

    return JSON.parse(
      localStorage.getItem(WATCH_KEY) || '[]'
    );

  } catch {

    return [];

  }

}

function saveWatchlist(list) {

  try {

    localStorage.setItem(
      WATCH_KEY,
      JSON.stringify(list)
    );

  } catch {

    toast('Watchlist gagal disimpan.');

  }

}

function isSaved(id) {

  return getWatchlist().some(
    anime => anime.mal_id === id
  );

}

function updateWatchButton() {

  if (!state.current) return;

  $('detail-watchlist').textContent =
    isSaved(state.current.mal_id)
      ? '✓ Tersimpan'
      : '＋ Watchlist';

}

function toggleWatchlist() {

  if (!state.current) return;

  let list = getWatchlist();

  if (isSaved(state.current.mal_id)) {

    list = list.filter(
      anime => anime.mal_id !== state.current.mal_id
    );

    toast('Dihapus dari watchlist.');

  } else {

    list.unshift({

      mal_id: state.current.mal_id,

      title: state.current.title,

      title_english: state.current.title_english,

      images: state.current.images,

      score: state.current.score,

      episodes: state.current.episodes,

      type: state.current.type,

      year: state.current.year

    });

    toast('Disimpan ke watchlist.');

  }

  saveWatchlist(list);

  updateWatchButton();

}

function renderWatchlist() {

  const list = getWatchlist();

  list.forEach(anime => {
    state.anime.set(anime.mal_id, anime);
  });

  renderCards(
    'watchlist',
    list,
    'Watchlist masih kosong. Simpan anime dari halaman detail.'
  );

}


// ========================================
// EPISODES
// ========================================

async function loadEpisodes(id, page = 1, replace = false) {

  try {

    const data = await api(
      `/anime/${id}/episodes?page=${page}`
    );

    const host = $('detail-episodes-list');

    const html = (data.data || []).map(episode => {

      return `
        <button
          type="button"
          data-number="${Number(episode.episode) || 1}"
        >
          Ep ${esc(episode.episode ?? '?')}
        </button>
      `;

    }).join('');

    if (replace) {

      host.innerHTML = html ||
        '<div class="empty-message">Daftar episode belum tersedia dari katalog.</div>';

    } else {

      host.insertAdjacentHTML('beforeend', html);

    }

    host.querySelectorAll('button').forEach(button => {

      if (button.dataset.bound) return;

      button.dataset.bound = '1';

      button.addEventListener('click', () => {

        openPlayer(
          Number(button.dataset.number) || 1
        );

      });

    });

    state.episodeHasNext =
      !!data.pagination?.has_next_page;

    state.episodePage = page;

    $('episodes-more').classList.toggle(
      'hidden',
      !state.episodeHasNext
    );

    $('episode-note').textContent =
      'Nomor dan judul episode mengikuti data katalog; video perlu sumber legal terpisah.';

  } catch (error) {

    $('detail-episodes-list').innerHTML = `
      <div class="empty-message">
        Data episode belum tersedia.
        Kamu tetap bisa memilih nomor episode di pemutar.
      </div>
    `;

  }

}

async function loadMoreEpisodes() {

  if (!state.episodeHasNext || !state.current) return;

  loadEpisodes(
    state.current.mal_id,
    state.episodePage + 1,
    false
  );

}


// ========================================
// VIDEO PLAYER
// ========================================

function openPlayer(episode = 1) {

  if (!state.current) return;

  state.episode = Math.max(1, episode);

  $('player-title').textContent =
    state.current.title_english ||
    state.current.title;

  $('player-episode').textContent =
    `Episode ${state.episode}`;

  const count = Math.min(
    state.current.episodes || 24,
    100
  );

  $('player-episodes-list').innerHTML =
    Array.from({ length: count }, (_, index) => {

      const number = index + 1;

      return `
        <button
          class="${number === state.episode ? 'active' : ''}"
          data-episode="${number}"
        >
          ${number}
        </button>
      `;

    }).join('');

  $('player-episodes-list')
    .querySelectorAll('button')
    .forEach(button => {

      button.addEventListener('click', () => {

        openPlayer(
          Number(button.dataset.episode)
        );

      });

    });

  $('video-url').value = '';

  $('video-file').value = '';

  stopVideo();

  $('video-empty').style.display = 'flex';

  navigate('player');

  updatePlayerNav();

}

function updatePlayerNav() {

  $('prev-episode').disabled =
    state.episode <= 1;

  $('next-episode').disabled =
    !!(
      state.current.episodes &&
      state.episode >= state.current.episodes
    );

}

function changeEpisode(delta) {

  const next = state.episode + delta;

  if (next < 1) return;

  if (
    state.current.episodes &&
    next > state.current.episodes
  ) return;

  openPlayer(next);

}

function stopVideo() {

  const video = $('video-player');

  if (!video) return;

  video.pause();

  video.removeAttribute('src');

  video.load();

  video.classList.remove('visible');

  if (activeObjectUrl) {

    URL.revokeObjectURL(activeObjectUrl);

    activeObjectUrl = null;

  }

}

function playSource(url) {

  try {

    const parsed = new URL(url);

    if (!['https:', 'http:', 'blob:'].includes(parsed.protocol)) {
      throw new Error('URL tidak didukung.');
    }

  } catch {

    toast('URL video tidak valid.');

    return;

  }

  const video = $('video-player');

  stopVideo();

  video.src = url;

  video.classList.add('visible');

  $('video-empty').style.display = 'none';

  video.play().catch(() => {

    toast(
      'Tekan tombol play pada pemutar untuk mulai.'
    );

  });

}

function loadVideoUrl() {

  const url = $('video-url').value.trim();

  if (!url) {

    toast('Masukkan URL video terlebih dahulu.');

    return;

  }

  playSource(url);

}

function loadLocalVideo(event) {

  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith('video/')) {

    toast('Pilih file video yang didukung.');

    return;

  }

  stopVideo();

  activeObjectUrl = URL.createObjectURL(file);

  const video = $('video-player');

  video.src = activeObjectUrl;

  video.classList.add('visible');

  $('video-empty').style.display = 'none';

  video.play().catch(() => {

    toast(
      'Tekan tombol play pada pemutar untuk mulai.'
    );

  });

    }
