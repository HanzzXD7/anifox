'use strict';

// ========================================
// AniFoX — AniList + AniLab + Bstation
// ========================================

const ANILIST_API = 'https://graphql.anilist.co';
const ANILAB_API = 'https://anilab-beta.vercel.app/api';

const $ = id => document.getElementById(id);
const WATCH_KEY = 'anifox_watchlist_v3';

const state = {
  anime: new Map(),
  current: null,
  featured: null,
  watchlist: [],
  currentEpisode: 1,
  previousPage: 'home',
  searchTimer: null,
  searchRequest: 0,
  toastTimer: null,
  splashTimer: null,

  // Genre AniLab
  currentGenre: '',
  genrePage: 1,
  genreHasNextPage: false
};

document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
  state.watchlist = getWatchlist();
  bindEvents();
  showSplash();
}

function bindEvents() {
  $('skip-loading')?.addEventListener('click', enterApp);

  $('search-button')?.addEventListener('click', () => {
    navigate('search');
    $('search-input')?.focus();
  });

  $('hero-detail')?.addEventListener('click', () => {
    if (state.featured) openDetail(state.featured);
  });

  $('search-input')?.addEventListener('input', onSearchInput);
  $('detail-watchlist')?.addEventListener('click', toggleWatchlist);
  $('back-detail')?.addEventListener('click', goBack);
  $('back-player')?.addEventListener('click', goBack);

  $('see-season')?.addEventListener('click', () => {
    navigate('season');
    loadSeason(true);
  });

  $('see-popular')?.addEventListener('click', () => {
    navigate('popular');
    loadPopular(true);
  });

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      navigate(button.dataset.page);
    });
  });

  $('episode-list')?.addEventListener('click', handleEpisodeClick);
}

// ========================================
// SPLASH SCREEN
// ========================================

function showSplash() {
  let progress = 0;
  const bar = $('loading-progress');

  state.splashTimer = setInterval(() => {
    progress = Math.min(100, progress + 12);

    if (bar) bar.style.width = `${progress}%`;

    if (progress >= 100) {
      clearInterval(state.splashTimer);
      enterApp();
    }
  }, 65);
}

let appStarted = false;

function enterApp() {
  if (appStarted) return;

  appStarted = true;
  clearInterval(state.splashTimer);

  $('splash')?.classList.add('fade-out');
  $('app')?.classList.remove('hidden');

  loadHome();
}

function navigate(page) {
  const target = $('page-' + page);
  if (!target) return;

  document.querySelectorAll('.page').forEach(element => {
    element.classList.remove('active');
    element.classList.add('hidden');
  });

  target.classList.remove('hidden');
  target.classList.add('active');

  document.querySelectorAll('[data-page].nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  if (page === 'list') renderWatchlist();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  navigate(state.previousPage || 'home');
}

// ========================================
// UTILITIES
// ========================================

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function toast(message) {
  const element = $('toast');
  if (!element) return;

  element.textContent = message;
  element.classList.add('show');

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    element.classList.remove('show');
  }, 2600);
}

function imageOf(anime) {
  return anime?.coverImage?.extraLarge ||
    anime?.coverImage?.large || '';
}

function titleOf(anime) {
  return anime?.title?.english ||
    anime?.title?.romaji ||
    anime?.title?.native ||
    'Untitled';
}

function remember(items) {
  (items || []).forEach(anime => {
    if (anime?.id) state.anime.set(anime.id, anime);
  });
}

function seasonNow() {
  const month = new Date().getMonth() + 1;

  if (month <= 3) return 'WINTER';
  if (month <= 6) return 'SPRING';
  if (month <= 9) return 'SUMMER';

  return 'FALL';
}

// ========================================
// ANILIST API
// ========================================

async function anilist(query, variables = {}) {
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`AniList gagal merespons (${response.status}).`);
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(result.errors[0].message || 'Kesalahan AniList.');
  }

  return result.data;
}

const MEDIA_FIELDS = `
  id
  title {
    romaji
    english
    native
  }
  coverImage {
    large
    extraLarge
  }
  bannerImage
  description(asHtml: false)
  averageScore
  episodes
  season
  seasonYear
  format
  status
  genres
  siteUrl
`;

async function getSeasonAnime() {
  const query = `
    query ($season: MediaSeason, $year: Int) {
      Page(perPage: 18) {
        media(
          type: ANIME
          season: $season
          seasonYear: $year
          sort: POPULARITY_DESC
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilist(query, {
    season: seasonNow(),
    year: new Date().getFullYear()
  });

  return data.Page.media || [];
}

async function getPopularAnime() {
  const query = `
    query {
      Page(perPage: 18) {
        media(
          type: ANIME
          sort: SCORE_DESC
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilist(query);
  return data.Page.media || [];
}

async function searchAnime(keyword) {
  const query = `
    query ($search: String) {
      Page(perPage: 24) {
        media(
          type: ANIME
          search: $search
          sort: SEARCH_MATCH
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilist(query, { search: keyword });
  return data.Page.media || [];
}

async function getAnimeDetail(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        tags {
          name
        }
        studios {
          nodes {
            name
          }
        }
      }
    }
  `;

  const data = await anilist(query, { id: Number(id) });
  return data.Media;
}

// ========================================
// ANIME CARDS
// ========================================

function cardHTML(anime) {
  const title = esc(titleOf(anime));
  const image = esc(imageOf(anime));

  const score = anime.averageScore
    ? (anime.averageScore / 10).toFixed(1)
    : 'N/A';

  return `
    <article
      class="anime-card"
      data-id="${Number(anime.id)}"
      tabindex="0"
      role="button"
      aria-label="Detail ${title}"
    >
      <div class="poster-wrap">
        <img
          src="${image}"
          alt="${title}"
          loading="lazy"
          onerror="this.style.opacity='.2'"
        >
        <span class="poster-score">★ ${score}</span>
      </div>

      <h3 class="poster-title">${title}</h3>

      <p class="poster-meta">
        ${esc(anime.seasonYear || anime.format || 'Anime')}
        · ${anime.episodes ?? '?'} eps
      </p>
    </article>
  `;
}

function renderCards(target, items, emptyMessage = 'Anime belum tersedia.') {
  const element = $(target);
  if (!element) return;

  if (!items?.length) {
    element.innerHTML = `
      <div class="empty-message">${esc(emptyMessage)}</div>
    `;
    return;
  }

  element.innerHTML = items.map(cardHTML).join('');

  element.querySelectorAll('.anime-card').forEach(card => {
    const open = () => {
      const anime = state.anime.get(Number(card.dataset.id));
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

// ========================================
// HOME
// ========================================

async function loadHome() {
  $('season-list').innerHTML = `
    <div class="empty-message">Memuat season anime...</div>
  `;

  $('popular-list').innerHTML = `
    <div class="empty-message">Memuat anime populer...</div>
  `;

  const results = await Promise.allSettled([
    getSeasonAnime(),
    getPopularAnime()
  ]);

  const season = results[0];
  const popular = results[1];

  if (season.status === 'fulfilled') {
    remember(season.value);

    renderCards(
      'season-list',
      season.value.slice(0, 10)
    );
  } else {
    $('season-list').innerHTML = `
      <div class="empty-message">
        ${esc(season.reason?.message || 'Season gagal dimuat.')}
      </div>
    `;
  }

  if (popular.status === 'fulfilled') {
    remember(popular.value);

    renderCards(
      'popular-list',
      popular.value.slice(0, 10)
    );

    state.featured = popular.value[0] || null;
  } else {
    $('popular-list').innerHTML = `
      <div class="empty-message">
        ${esc(popular.reason?.message || 'Anime populer gagal dimuat.')}
      </div>
    `;
  }

  if (!state.featured && season.status === 'fulfilled') {
    state.featured = season.value[0] || null;
  }

  if (state.featured) {
    $('hero-title').textContent = titleOf(state.featured);

    $('hero-meta').textContent =
      `${state.featured.seasonYear || 'Anime'} · ★ ${
        state.featured.averageScore
          ? (state.featured.averageScore / 10).toFixed(1)
          : '—'
      }`;

    const art = state.featured.bannerImage ||
      imageOf(state.featured);

    $('hero-art').style.backgroundImage =
      art ? `url("${art}")` : '';

  } else {
    $('hero-title').textContent =
      'Temukan anime favoritmu';

    $('hero-meta').textContent =
      'Katalog sedang tidak dapat dimuat. Coba lagi nanti.';
  }

  loadGenres();
}

async function loadSeason(full = false) {
  const target = full ? 'season-full' : 'season-list';

  $(target).innerHTML = `
    <div class="empty-message">Memuat anime...</div>
  `;

  try {
    const items = await getSeasonAnime();

    remember(items);

    renderCards(
      target,
      full ? items : items.slice(0, 10)
    );

  } catch (error) {
    $(target).innerHTML = `
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

async function loadPopular(full = false) {
  const target = full ? 'popular-full' : 'popular-list';

  $(target).innerHTML = `
    <div class="empty-message">Memuat anime populer...</div>
  `;

  try {
    const items = await getPopularAnime();

    remember(items);

    renderCards(
      target,
      full ? items : items.slice(0, 10)
    );

  } catch (error) {
    $(target).innerHTML = `
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

// ========================================
// GENRE — ANILAB API
// ========================================

async function loadGenres() {
  const host = $('genre-list');
  if (!host) return;

  host.innerHTML = `
    <div class="empty-message">Memuat genre...</div>
  `;

  try {
    const response = await fetch(`${ANILAB_API}/genres`);

    if (!response.ok) {
      throw new Error('Gagal mengambil daftar genre.');
    }

    const result = await response.json();

    if (!result.status || !Array.isArray(result.data)) {
      throw new Error('Data genre tidak valid.');
    }

    // Genre yang tidak ditampilkan
    const excluded = ['Ecchi', 'Hentai'];

    const genres = result.data.filter(genre =>
      !excluded.includes(genre)
    );

    host.innerHTML = genres.map(genre => `
      <button
        class="genre-chip"
        data-genre="${esc(genre)}"
        type="button"
      >
        ${esc(genre)}
      </button>
    `).join('');

    host.querySelectorAll('[data-genre]').forEach(button => {
      button.addEventListener('click', () => {
        const genre = button.dataset.genre;

        state.currentGenre = genre;
        state.genrePage = 1;

        navigate('search');

        $('search-input').value = genre;

        loadGenreAnime(genre, 1);
      });
    });

  } catch (error) {
    host.innerHTML = `
      <div class="empty-message">
        ${esc(error.message)}
      </div>
    `;
  }
}

async function loadGenreAnime(genre, page = 1) {
  const host = $('search-results');
  if (!host) return;

  const request = ++state.searchRequest;

  host.innerHTML = `
    <div class="empty-message">
      Memuat anime genre ${esc(genre)}...
    </div>
  `;

  try {
    const url =
      `${ANILAB_API}/genre?name=${encodeURIComponent(genre)}&page=${page}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Gagal mengambil anime berdasarkan genre.');
    }

    const result = await response.json();

    if (request !== state.searchRequest) return;

    if (!result.status) {
      throw new Error(
        result.message || 'Data genre gagal dimuat.'
      );
    }

    state.currentGenre = genre;
    state.genrePage = result.page;
    state.genreHasNextPage = result.hasNextPage;

    const items = result.data || [];

    remember(items);

    renderCards(
      'search-results',
      items,
      `Belum ada anime untuk genre ${genre}.`
    );

    if (!items.length) return;

    const pagination = document.createElement('div');

    pagination.className = 'genre-pagination';

    pagination.innerHTML = `
      <button
        type="button"
        id="genre-prev"
        ${page <= 1 ? 'disabled' : ''}
      >
        ← Sebelumnya
      </button>

      <span>Halaman ${result.page}</span>

      <button
        type="button"
        id="genre-next"
        ${!result.hasNextPage ? 'disabled' : ''}
      >
        Berikutnya →
      </button>
    `;

    host.appendChild(pagination);

    $('genre-prev')?.addEventListener('click', () => {
      if (state.genrePage > 1) {
        loadGenreAnime(genre, state.genrePage - 1);
      }
    });

    $('genre-next')?.addEventListener('click', () => {
      if (state.genreHasNextPage) {
        loadGenreAnime(genre, state.genrePage + 1);
      }
    });

  } catch (error) {
    if (request !== state.searchRequest) return;

    host.innerHTML = `
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
  clearTimeout(state.searchTimer);

  // Ketika pengguna mengetik sendiri,
  // pencarian kembali menggunakan AniList.
  state.currentGenre = '';

  const keyword = $('search-input').value.trim();

  if (!keyword) {
    state.searchRequest++;
    $('search-results').innerHTML = '';
    return;
  }

  state.searchTimer = setTimeout(() => {
    runSearch(keyword);
  }, 450);
}

async function runSearch(keyword) {
  const request = ++state.searchRequest;

  $('search-results').innerHTML = `
    <div class="empty-message">Mencari anime...</div>
  `;

  try {
    const items = await searchAnime(keyword);

    if (request !== state.searchRequest) return;

    remember(items);

    renderCards(
      'search-results',
      items,
      'Anime tidak ditemukan. Coba judul lain.'
    );

  } catch (error) {
    if (request !== state.searchRequest) return;

    $('search-results').innerHTML = `
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

// ========================================
// ANIME DETAIL
// ========================================

async function openDetail(anime) {
  state.previousPage =
    document.querySelector('.page.active')?.id.replace('page-', '') ||
    'home';

  state.current = anime;

  navigate('detail');

  $('detail-image').src = imageOf(anime);
  $('detail-image').alt = `Poster ${titleOf(anime)}`;

  $('detail-title').textContent = titleOf(anime);

  $('detail-score').textContent =
    `★ ${
      anime.averageScore
        ? (anime.averageScore / 10).toFixed(1)
        : 'Belum ada rating'
    }`;

  $('detail-status').textContent =
    anime.status || 'Status tidak diketahui';

  $('detail-episodes').textContent =
    `${anime.episodes ?? '?'} episode`;

  $('detail-synopsis').textContent = 'Memuat sinopsis...';

  $('detail-banner-art').style.backgroundImage =
    anime.bannerImage
      ? `url("${anime.bannerImage}")`
      : `url("${imageOf(anime)}")`;

  $('detail-genres').innerHTML =
    (anime.genres || []).map(genre => `
      <span class="genre-tag">${esc(genre)}</span>
    `).join('');

  $('episode-list').innerHTML = `
    <div class="empty-message">Menyiapkan daftar episode...</div>
  `;

  updateWatchButton();

  try {
    const detail = await getAnimeDetail(anime.id);

    if (state.current?.id !== anime.id) return;

    state.current = detail;
    state.anime.set(detail.id, detail);

    $('detail-synopsis').textContent = detail.description
      ? detail.description
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : 'Sinopsis belum tersedia.';

    $('detail-genres').innerHTML =
      (detail.genres || []).map(genre => `
        <span class="genre-tag">${esc(genre)}</span>
      `).join('');

    $('detail-score').textContent =
      `★ ${
        detail.averageScore
          ? (detail.averageScore / 10).toFixed(1)
          : 'Belum ada rating'
      }`;

    $('detail-status').textContent =
      detail.status || 'Status tidak diketahui';

    $('detail-episodes').textContent =
      `${detail.episodes ?? '?'} episode`;

    renderEpisodes(detail);
    updateWatchButton();

  } catch {
    $('detail-synopsis').textContent =
      'Sinopsis belum berhasil dimuat.';

    renderEpisodes(anime);
  }
}

// ========================================
// BSTATION
// ========================================

function normalizeTitle(value = '') {
  return String(value).toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

// Hanya ID episode resmi yang sudah diverifikasi.
const BSTATION_SERIES = [
  {
    aliases: [
      'frierenbeyondjourneysend',
      'sousounofrieren'
    ],

    seasonId: '2090295',

    episodes: {
      1: '12975044'
    }
  }
];

function getBstationSeries(anime) {
  const titles = [
    anime?.title?.english,
    anime?.title?.romaji,
    anime?.title?.native
  ]
    .filter(Boolean)
    .map(normalizeTitle);

  return BSTATION_SERIES.find(series =>
    series.aliases.some(alias =>
      titles.some(title =>
        title.includes(alias) || alias.includes(title)
      )
    )
  ) || null;
}

function renderEpisodes(anime) {
  const host = $('episode-list');
  if (!host) return;

  const series = getBstationSeries(anime);

  if (!series) {
    host.innerHTML = `
      <div class="empty-message">
        Belum ada episode Bstation yang ID resminya
        terverifikasi untuk anime ini.
      </div>
    `;
    return;
  }

  const available = Object.entries(series.episodes)
    .map(([number, episodeId]) => ({
      number: Number(number),
      episodeId
    }))
    .sort((a, b) => a.number - b.number);

  if (!available.length) {
    host.innerHTML = `
      <div class="empty-message">
        Belum ada episode Bstation yang terdaftar.
      </div>
    `;
    return;
  }

  host.innerHTML = available.map(item => `
    <button
      type="button"
      data-episode="${item.number}"
      class="episode-button"
    >
      Episode ${item.number} · Bstation
    </button>
  `).join('');
}

function handleEpisodeClick(event) {
  const button = event.target.closest('[data-episode]');

  if (!button || !state.current) return;

  openPlayer(Number(button.dataset.episode));
}

// ========================================
// WATCHLIST
// ========================================

function getWatchlist() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(WATCH_KEY) || '[]'
    );

    return Array.isArray(saved) ? saved : [];

  } catch {
    return [];
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem(
      WATCH_KEY,
      JSON.stringify(state.watchlist)
    );

  } catch {
    toast('Watchlist gagal disimpan di perangkat ini.');
  }
}

function isSaved(id) {
  return state.watchlist.some(anime => anime.id === id);
}

function updateWatchButton() {
  if (!state.current) return;

  $('detail-watchlist').textContent =
    isSaved(state.current.id)
      ? '✓ Tersimpan di Watchlist'
      : '＋ Tambah ke Watchlist';
}

function toggleWatchlist() {
  if (!state.current) return;

  const id = state.current.id;

  if (isSaved(id)) {
    state.watchlist = state.watchlist.filter(
      anime => anime.id !== id
    );

    toast('Dihapus dari watchlist.');

  } else {
    state.watchlist.unshift(state.current);

    toast('Berhasil disimpan ke watchlist!');
  }

  saveWatchlist();
  updateWatchButton();
}

function renderWatchlist() {
  state.watchlist.forEach(anime => {
    state.anime.set(anime.id, anime);
  });

  renderCards(
    'watchlist',
    state.watchlist,
    'Watchlist masih kosong. Simpan anime favoritmu dari halaman detail.'
  );
}

// ========================================
// VIDEO PLAYER
// ========================================

function openPlayer(episode = 1) {
  if (!state.current) return;

  const series = getBstationSeries(state.current);
  const episodeId = series?.episodes?.[episode];

  state.previousPage = 'detail';
  state.currentEpisode = episode;

  $('player-title').textContent = titleOf(state.current);

  $('player-episode').textContent =
    `Episode ${episode} · Bstation`;

  navigate('player');

  stopBstation();

  const empty = $('video-empty');

  if (!series || !episodeId) {
    empty.style.display = 'flex';

    empty.innerHTML = `
      <div class="empty-play">▶</div>
      <strong>Episode belum tersedia</strong>
      <p>
        Belum ada ID episode Bstation yang terverifikasi
        untuk episode ini.
      </p>
    `;

    $('bstation-link').href =
      'https://www.bilibili.tv/anime';

    $('bstation-link').textContent =
      'Jelajahi anime di Bstation ↗';

    return;
  }

  const iframe = $('bilibili-player');

  iframe.src =
    `https://player.bilibili.com/player.html?seasonId=${
      encodeURIComponent(series.seasonId)
    }&episodeId=${
      encodeURIComponent(episodeId)
    }&autoplay=0&danmaku=0`;

  iframe.classList.remove('hidden');

  empty.style.display = 'none';

  $('bstation-link').href =
    `https://www.bilibili.tv/play/${series.seasonId}/${episodeId}`;

  $('bstation-link').textContent =
    'Buka episode resmi di Bstation ↗';
}

function stopBstation() {
  const iframe = $('bilibili-player');

  if (iframe) {
    iframe.src = '';
    iframe.classList.add('hidden');
  }

  if ($('video-empty')) {
    $('video-empty').style.display = 'flex';
  }
}

// ========================================
// START
// ========================================
