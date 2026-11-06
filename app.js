'use strict';

// AniFoX — AniList catalogue + official Muse/Ani-One feeds
const ANILIST_API = 'https://graphql.anilist.co';
const $ = id => document.getElementById(id);
const WATCH_KEY = 'anifox_watchlist_v3';

const state = {
  anime: new Map(),
  current: null,
  featured: null,
  watchlist: [],
  videos: { muse: [], anione: [] },
  feedsPromise: null,
  currentEpisode: 1,
  previousPage: 'home',
  searchTimer: null,
  searchRequest: 0,
  toastTimer: null,
  splashTimer: null
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
  title { romaji english native }
  coverImage { large extraLarge }
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
          type: ANIME,
          season: $season,
          seasonYear: $year,
          sort: POPULARITY_DESC,
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }`;

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
        media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
          ${MEDIA_FIELDS}
        }
      }
    }`;

  const data = await anilist(query);

  return data.Page.media || [];
}

async function searchAnime(keyword) {
  const query = `
    query ($search: String) {
      Page(perPage: 24) {
        media(
          type: ANIME,
          search: $search,
          sort: SEARCH_MATCH,
          isAdult: false
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }`;

  const data = await anilist(query, { search: keyword });

  return data.Page.media || [];
}

async function getAnimeDetail(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        tags { name }
        studios { nodes { name } }
      }
    }`;

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
    <article class="anime-card"
      data-id="${Number(anime.id)}"
      tabindex="0"
      role="button"
      aria-label="Detail ${title}">

      <div class="poster-wrap">
        <img src="${image}"
          alt="${title}"
          loading="lazy"
          onerror="this.style.opacity='.2'">

        <span class="poster-score">★ ${score}</span>
      </div>

      <h3 class="poster-title">${title}</h3>

      <p class="poster-meta">
        ${esc(anime.seasonYear || anime.format || 'Anime')}
        · ${anime.episodes ?? '?'} eps
      </p>
    </article>`;
}

function renderCards(target, items, emptyMessage = 'Anime belum tersedia.') {
  const element = $(target);
  if (!element) return;

  if (!items?.length) {
    element.innerHTML =
      `<div class="empty-message">${esc(emptyMessage)}</div>`;
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
  $('season-list').innerHTML =
    '<div class="empty-message">Memuat season anime...</div>';

  $('popular-list').innerHTML =
    '<div class="empty-message">Memuat anime populer...</div>';

  const results = await Promise.allSettled([
    getSeasonAnime(),
    getPopularAnime()
  ]);

  const season = results[0];
  const popular = results[1];

  if (season.status === 'fulfilled') {
    remember(season.value);
    renderCards('season-list', season.value.slice(0, 10));
  } else {
    $('season-list').innerHTML =
      `<div class="empty-message">${esc(season.reason?.message || 'Season gagal dimuat.')}</div>`;
  }

  if (popular.status === 'fulfilled') {
    remember(popular.value);
    renderCards('popular-list', popular.value.slice(0, 10));
    state.featured = popular.value[0] || null;
  } else {
    $('popular-list').innerHTML =
      `<div class="empty-message">${esc(popular.reason?.message || 'Anime populer gagal dimuat.')}</div>`;
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

    const art = state.featured.bannerImage || imageOf(state.featured);

    $('hero-art').style.backgroundImage =
      art ? `url("${art}")` : '';
  } else {
    $('hero-title').textContent = 'Temukan anime favoritmu';
    $('hero-meta').textContent =
      'Katalog sedang tidak dapat dimuat. Coba lagi nanti.';
  }

  loadOfficialVideos();
  loadGenres();
}

async function loadSeason(full = false) {
  const target = full ? 'season-full' : 'season-list';

  $(target).innerHTML =
    '<div class="empty-message">Memuat anime...</div>';

  try {
    const items = await getSeasonAnime();

    remember(items);

    renderCards(target, full ? items : items.slice(0, 10));
  } catch (error) {
    $(target).innerHTML =
      `<div class="empty-message">${esc(error.message)}</div>`;
  }
}

async function loadPopular(full = false) {
  const target = full ? 'popular-full' : 'popular-list';

  $(target).innerHTML =
    '<div class="empty-message">Memuat anime populer...</div>';

  try {
    const items = await getPopularAnime();

    remember(items);

    renderCards(target, full ? items : items.slice(0, 10));
  } catch (error) {
    $(target).innerHTML =
      `<div class="empty-message">${esc(error.message)}</div>`;
  }
}

// ========================================
// GENRES
// ========================================

function loadGenres() {
  const genres = [
    'Action', 'Adventure', 'Comedy', 'Drama',
    'Fantasy', 'Romance', 'Sci-Fi', 'Slice of Life',
    'Sports', 'Supernatural', 'Mystery', 'Horror'
  ];

  const host = $('genre-list');
  if (!host) return;

  host.innerHTML = genres.map(genre => `
    <button class="genre-chip"
      data-genre="${esc(genre)}"
      type="button">
      ${esc(genre)}
    </button>
  `).join('');

  host.querySelectorAll('[data-genre]').forEach(button => {
    button.addEventListener('click', () => {
      navigate('search');

      $('search-input').value = button.dataset.genre;

      runSearch(button.dataset.genre);
    });
  });
}

// ========================================
// SEARCH
// ========================================

function onSearchInput() {
  clearTimeout(state.searchTimer);

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

  $('search-results').innerHTML =
    '<div class="empty-message">Mencari anime...</div>';

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

    $('search-results').innerHTML =
      `<div class="empty-message">${esc(error.message)}</div>`;
  }
}

// ========================================
// ANIME DETAIL
// ========================================

async function openDetail(anime) {
  state.previousPage =
    document.querySelector('.page.active')?.id.replace('page-', '') || 'home';

  state.current = anime;

  navigate('detail');

  $('detail-image').src = imageOf(anime);
  $('detail-image').alt = `Poster ${titleOf(anime)}`;

  $('detail-title').textContent = titleOf(anime);

  $('detail-score').textContent =
    `★ ${anime.averageScore ? (anime.averageScore / 10).toFixed(1) : 'Belum ada rating'}`;

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
    (anime.genres || []).map(genre =>
      `<span class="genre-tag">${esc(genre)}</span>`
    ).join('');

  $('episode-list').innerHTML =
    '<div class="empty-message">Menyiapkan daftar episode...</div>';

  updateWatchButton();

  try {
    const results = await Promise.allSettled([
      getAnimeDetail(anime.id),
      loadOfficialVideos()
    ]);

    if (state.current?.id !== anime.id) return;

    const detailResult = results[0];

    if (detailResult.status === 'fulfilled') {
      const detail = detailResult.value;

      state.current = detail;
      state.anime.set(detail.id, detail);

      $('detail-synopsis').textContent = detail.description
        ? detail.description
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : 'Sinopsis belum tersedia.';

      $('detail-genres').innerHTML =
        (detail.genres || []).map(genre =>
          `<span class="genre-tag">${esc(genre)}</span>`
        ).join('');

      $('detail-score').textContent =
        `★ ${detail.averageScore ? (detail.averageScore / 10).toFixed(1) : 'Belum ada rating'}`;

      $('detail-status').textContent =
        detail.status || 'Status tidak diketahui';

      $('detail-episodes').textContent =
        `${detail.episodes ?? '?'} episode`;

      renderEpisodes(detail);
      updateWatchButton();
    } else {
      $('detail-synopsis').textContent =
        'Sinopsis belum berhasil dimuat.';

      renderEpisodes(anime);
    }
  } catch (error) {
    console.error('Detail error:', error);
    renderEpisodes(anime);
  }
}

// ========================================
// OFFICIAL EPISODE LIST
// ========================================

function getEpisodeNumber(title) {
  const patterns = [
    /(?:episode|ep\.?|eps\.?|#)\s*0*(\d{1,3})(?!\d)/i,
    /\bE\s*0*(\d{1,3})(?!\d)/i,
    /第\s*0*(\d{1,3})\s*話/
  ];

  for (const pattern of patterns) {
    const match = String(title).match(pattern);

    if (match) return Number(match[1]);
  }

  return null;
}

function renderEpisodes(anime) {
  const host = $('episode-list');
  if (!host) return;

  const matched = findAnimeVideos(anime)
    .map(video => ({
      video,
      episode: getEpisodeNumber(video.title || '')
    }))
    .filter(item => item.episode !== null)
    .sort((a, b) => {
      return a.episode - b.episode ||
        String(a.video.source).localeCompare(String(b.video.source));
    });

  if (!matched.length) {
    host.innerHTML = `
      <div class="empty-message">
        Belum ada episode yang cocok di feed Muse atau Ani-One.
        <br><br>
        Coba cek lagi nanti saat kanal resmi mengunggah episode baru.
      </div>
    `;
    return;
  }

  host.innerHTML = matched.map(({ video, episode }) => `
    <button
      type="button"
      class="episode-button episode-video-button"
      data-video-id="${esc(video.videoId)}">

      <span class="episode-number">
        Episode ${episode}
      </span>

      <span class="episode-source">
        ${esc(video.source || 'YouTube Resmi')}
      </span>

      <span class="episode-play">▶</span>
    </button>
  `).join('');
}

function handleEpisodeClick(event) {
  const button = event.target.closest('[data-video-id]');

  if (!button || !state.current) return;

  const allVideos = [
    ...state.videos.muse,
    ...state.videos.anione
  ];

  const video = allVideos.find(item =>
    item.videoId === button.dataset.videoId
  );

  if (!video) {
    toast('Video tidak ditemukan. Coba muat ulang halaman.');
    return;
  }

  const episode = getEpisodeNumber(video.title || '');

  state.previousPage = 'detail';
  state.currentEpisode = episode || 1;

  $('player-title').textContent = titleOf(state.current);

  $('player-episode').textContent =
    `Episode ${episode || ''} · ${video.source || 'YouTube Resmi'}`;

  navigate('player');

  renderSourceChoices([video]);

  playYouTube(video);
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
// MUSE & ANI-ONE FEEDS
// ========================================

async function loadFeed(endpoint) {
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Feed ${endpoint} tidak tersedia.`);
  }

  const result = await response.json();

  return Array.isArray(result.videos)
    ? result.videos
    : [];
}

async function loadOfficialVideos() {
  if (state.feedsPromise) {
    return state.feedsPromise;
  }

  const host = $('muse-list');

  if (host) {
    host.innerHTML =
      '<p class="empty-message">Memuat video resmi...</p>';
  }

  state.feedsPromise = (async () => {
    const results = await Promise.allSettled([
      loadFeed('/api/muse'),
      loadFeed('/api/anione')
    ]);

    state.videos.muse =
      results[0].status === 'fulfilled'
        ? results[0].value
        : [];

    state.videos.anione =
      results[1].status === 'fulfilled'
        ? results[1].value
        : [];

    renderOfficialVideos();

    if (
      results[0].status === 'rejected' &&
      results[1].status === 'rejected'
    ) {
      state.feedsPromise = null;
    }
  })();

  return state.feedsPromise;
}

function renderOfficialVideos() {
  const host = $('muse-list');
  if (!host) return;

  const videos = [
    ...state.videos.muse,
    ...state.videos.anione
  ];

  if (!videos.length) {
    host.innerHTML = `
      <p class="empty-message">
        Video resmi belum berhasil dimuat.
        Katalog anime tetap bisa digunakan.
      </p>
    `;
    return;
  }

  host.innerHTML = videos.map((video, index) => `
    <article
      class="muse-card"
      data-video-index="${index}"
      tabindex="0"
      role="button">

      <img
        src="${esc(video.thumbnail || '')}"
        alt="${esc(video.title || 'Video anime')}"
        loading="lazy">

      <div class="muse-card-info">
        <h3>${esc(video.title || 'Video anime')}</h3>
        <p>${esc(video.source || 'Official YouTube')}</p>
      </div>
    </article>
  `).join('');

  host.querySelectorAll('[data-video-index]').forEach(card => {
    const open = () => {
      const video = videos[Number(card.dataset.videoIndex)];

      if (!video) return;

      state.previousPage =
        document.querySelector('.page.active')
          ?.id.replace('page-', '') || 'home';

      $('player-title').textContent =
        video.title || 'Video Resmi';

      $('player-episode').textContent =
        video.source || 'Official YouTube';

      navigate('player');

      renderSourceChoices([video]);

      playYouTube(video);
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
// MATCH ANIME TITLES
// ========================================

function normalizeTitle(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/season\s+\d+/g, ' ')
    .replace(/season\s+[ivx]+/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function getAnimeTitleVariants(anime) {
  return [
    anime?.title?.english,
    anime?.title?.romaji,
    anime?.title?.native
  ]
    .filter(Boolean)
    .map(normalizeTitle)
    .filter(title => title.length >= 4);
}

function findAnimeVideos(anime) {
  const titles = getAnimeTitleVariants(anime);

  const all = [
    ...state.videos.muse,
    ...state.videos.anione
  ];

  return all.filter(video => {
    const videoTitle = normalizeTitle(video.title || '');

    return titles.some(title =>
      videoTitle.includes(title)
    );
  });
}

// ========================================
// VIDEO PLAYER
// ========================================

function findEpisodeVideo(videos, episode) {
  return videos.filter(video =>
    getEpisodeNumber(video.title || '') === Number(episode)
  );
}

function openPlayer(episode = 1) {
  if (!state.current) return;

  state.previousPage = 'detail';
  state.currentEpisode = episode;

  $('player-title').textContent = titleOf(state.current);
  $('player-episode').textContent = `Episode ${episode}`;

  const videos = findAnimeVideos(state.current);
  const episodeVideos = findEpisodeVideo(videos, episode);

  showPlayerSources(episodeVideos, videos);

  navigate('player');
}

function showPlayerSources(episodeVideos, allVideos) {
  stopYouTube();

  const host = $('video-empty');

  if (!episodeVideos.length && !allVideos.length) {
    host.style.display = 'flex';

    host.innerHTML = `
      <div class="empty-play">▶</div>
      <strong>Video belum tersedia</strong>
      <p>
        Anime ini belum ditemukan di feed Muse atau Ani-One terbaru.
      </p>
    `;

    $('youtube-link').href =
      'https://www.youtube.com/@MuseIndonesia';

    $('youtube-link').textContent =
      'Buka Muse Indonesia di YouTube ↗';

    return;
  }

  if (!episodeVideos.length) {
    host.style.display = 'flex';

    host.innerHTML = `
      <div class="empty-play">⌕</div>
      <strong>Episode ${state.currentEpisode} belum ditemukan</strong>
      <p>Ada video lain untuk judul ini. Pilih sumber di bawah.</p>
    `;

    renderSourceChoices(allVideos);

    return;
  }

  host.style.display = 'none';

  renderSourceChoices(episodeVideos);

  playYouTube(episodeVideos[0]);
}

function renderSourceChoices(videos) {
  const host = $('video-source-list');
  if (!host) return;

  host.innerHTML = `
    <h2>Sumber Video</h2>

    <div class="source-list">
      ${videos.map((video, index) => `
        <button
          type="button"
          data-source-index="${index}"
          class="episode-button">

          ${esc(video.source || 'YouTube')}
          · ${esc(video.title || 'Video anime')}

        </button>
      `).join('')}
    </div>
  `;

  host.querySelectorAll('[data-source-index]').forEach(button => {
    button.addEventListener('click', () => {
      const video = videos[Number(button.dataset.sourceIndex)];

      if (video) playYouTube(video);
    });
  });
}

function playYouTube(video) {
  if (!video?.videoId) {
    toast('ID video tidak tersedia.');
    return;
  }

  const videoId = String(video.videoId);

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    toast('ID YouTube tidak valid.');
    return;
  }

  const iframe = $('youtube-player');

  iframe.src =
    `https://www.youtube-nocookie.com/embed/${videoId}`;

  iframe.classList.remove('hidden');

  $('video-player')?.classList.add('hidden');

  $('video-empty').style.display = 'none';

  $('youtube-link').href =
    video.url || `https://www.youtube.com/watch?v=${videoId}`;

  $('youtube-link').textContent =
    `Buka ${video.source || 'YouTube'} ↗`;
}

function stopYouTube() {
  const iframe = $('youtube-player');

  if (iframe) {
    iframe.src = '';
    iframe.classList.add('hidden');
  }

  const video = $('video-player');

  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.classList.add('hidden');
  }

  const host = $('video-source-list');

  if (host) host.innerHTML = '';

  if ($('video-empty')) {
    $('video-empty').style.display = 'flex';
  }
}

// ========================================
// START
// ========================================
