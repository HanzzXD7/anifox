
'use strict';

// ========================================
// AniFoX - ANILIST + MUSE + ANI-ONE
// ========================================

const ANILIST_API = 'https://graphql.anilist.co';

const $ = id => document.getElementById(id);

const state = {
  anime: new Map(),
  current: null,
  featured: null,
  watchlist: [],
  videos: {
    muse: [],
    anione: []
  },
  currentEpisode: 1,
  previousPage: 'home',
  searchTimer: null,
  searchRequest: 0,
  toastTimer: null
};

const WATCH_KEY = 'anifox_watchlist_v3';


// ========================================
// INITIALIZATION
// ========================================

window.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

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

  $('detail-watchlist')?.addEventListener(
    'click',
    toggleWatchlist
  );

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
    button.addEventListener('click', () => {
      navigate(button.dataset.page);
    });
  });

  $('detail-episodes-list')?.addEventListener(
    'click',
    handleEpisodeClick
  );

  $('episode-list')?.addEventListener(
    'click',
    handleEpisodeClick
  );
}


// ========================================
// SPLASH SCREEN
// ========================================

function showSplash() {
  const bar = $('loading-progress');
  let progress = 0;

  const timer = setInterval(() => {
    progress = Math.min(100, progress + 10);

    if (bar) {
      bar.style.width = progress + '%';
    }

    if (progress >= 100) {
      clearInterval(timer);
      enterApp();
    }
  }, 70);
}

let appStarted = false;

function enterApp() {
  if (appStarted) return;

  appStarted = true;

  $('splash')?.classList.add('fade-out');
  $('app')?.classList.remove('hidden');

  loadHome();
}


// ========================================
// NAVIGATION
// ========================================

function navigate(page) {
  document.querySelectorAll('.page').forEach(element => {
    element.classList.remove('active');
    element.classList.add('hidden');
  });

  const target = $('page-' + page);

  if (!target) return;

  target.classList.remove('hidden');
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

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function goBack() {
  navigate(state.previousPage || 'home');
}


// ========================================
// HELPERS
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
    anime?.coverImage?.large ||
    '';
}

function titleOf(anime) {
  return anime?.title?.english ||
    anime?.title?.romaji ||
    anime?.title?.native ||
    'Untitled';
}

function remember(items) {
  (items || []).forEach(anime => {
    if (anime?.id) {
      state.anime.set(anime.id, anime);
    }
  });
}

function seasonNow() {
  const month = new Date().getMonth() + 1;

  if (month >= 1 && month <= 3) return 'WINTER';
  if (month >= 4 && month <= 6) return 'SPRING';
  if (month >= 7 && month <= 9) return 'SUMMER';

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
    body: JSON.stringify({
      query,
      variables
    })
  });

  if (!response.ok) {
    throw new Error(
      `AniList gagal merespons (${response.status}).`
    );
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(
      result.errors[0].message || 'Kesalahan AniList.'
    );
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

  return data.Page.media;
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

  return data.Page.media;
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

  const data = await anilist(query, {
    search: keyword
  });

  return data.Page.media;
}

async function getAnimeDetail(id) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        ${MEDIA_FIELDS}
        genres
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

  const data = await anilist(query, {
    id: Number(id)
  });

  return data.Media;
}


// ========================================
// ANIME CARDS
// ========================================

function cardHTML(anime) {
  const title = esc(titleOf(anime));
  const image = esc(imageOf(anime));

  return `
    <article
      class="anime-card"
      data-id="${anime.id}"
      tabindex="0"
      role="button"
    >
      <div class="poster-wrap">
        <img
          src="${image}"
          alt="${title}"
          loading="lazy"
          onerror="this.style.opacity='.2'"
        >

        <span class="poster-score">
          ${anime.averageScore
            ? (anime.averageScore / 10).toFixed(1)
            : 'N/A'}
        </span>
      </div>

      <h3 class="poster-title">${title}</h3>

      <p class="poster-meta">
        ${esc(anime.seasonYear || anime.format || 'Anime')}
        · ${anime.episodes ?? '?'} eps
      </p>
    </article>
  `;
}

function renderCards(target, items, emptyMessage) {
  const element = $(target);

  if (!element) return;

  if (!items?.length) {
    element.innerHTML = `
      <div class="empty-message">
        ${esc(emptyMessage || 'Anime belum tersedia.')}
      </div>
    `;
    return;
  }

  element.innerHTML = items.map(cardHTML).join('');

  element.querySelectorAll('.anime-card').forEach(card => {
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
      '<div class="empty-message">Season gagal dimuat.</div>';
  }

  if (popular.status === 'fulfilled') {
    remember(popular.value);
    renderCards('popular-list', popular.value.slice(0, 10));

    state.featured = popular.value[0] || null;
  } else {
    $('popular-list').innerHTML =
      '<div class="empty-message">Anime populer gagal dimuat.</div>';
  }

  if (!state.featured && season.status === 'fulfilled') {
    state.featured = season.value[0] || null;
  }

  if (state.featured) {
    $('hero-title').textContent = titleOf(state.featured);

    $('hero-meta').textContent =
      `${state.featured.seasonYear || 'Anime'} · ` +
      `★ ${state.featured.averageScore
        ? (state.featured.averageScore / 10).toFixed(1)
        : '—'}`;

    if (state.featured.bannerImage) {
      $('hero-art').style.backgroundImage =
        `url("${state.featured.bannerImage}")`;
    } else {
      $('hero-art').style.backgroundImage =
        `url("${imageOf(state.featured)}")`;
    }
  }

  loadOfficialVideos();
  loadGenres();
}


// ========================================
// SEASON & POPULAR
// ========================================

async function loadSeason(full = false) {
  const target = full ? 'season-full' : 'season-list';

  $(target).innerHTML =
    '<div class="empty-message">Memuat anime...</div>';

  try {
    const items = await getSeasonAnime();

    remember(items);

    renderCards(
      target,
      full ? items : items.slice(0, 10)
    );
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

    renderCards(
      target,
      full ? items : items.slice(0, 10)
    );
  } catch (error) {
    $(target).innerHTML =
      `<div class="empty-message">${esc(error.message)}</div>`;
  }
}


// ========================================
// GENRES
// ========================================

async function loadGenres() {
  const genres = [
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Fantasy',
    'Romance',
    'Sci-Fi',
    'Slice of Life',
    'Sports',
    'Supernatural',
    'Mystery',
    'Horror'
  ];

  const host = $('genre-list');

  if (!host) return;

  host.innerHTML = genres.map(genre => `
    <button
      class="genre-chip"
      data-genre="${esc(genre)}"
    >
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
  }, 500);
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

    $('search-results').innerHTML = `
      <div class="empty-message">
        ${esc(error.message)}
      </div>
    `;
  }
}


// ========================================
// DETAIL
// ========================================

async function openDetail(anime) {
  state.previousPage =
    document.querySelector('.page.active')
      ?.id.replace('page-', '') || 'home';

  state.current = anime;

  navigate('detail');

  $('detail-image').src = imageOf(anime);

  $('detail-title').textContent = titleOf(anime);

  $('detail-score').textContent =
    `★ ${anime.averageScore
      ? (anime.averageScore / 10).toFixed(1)
      : 'Belum ada rating'}`;

  $('detail-status').textContent =
    anime.status || 'Status tidak diketahui';

  $('detail-episodes').textContent =
    `${anime.episodes ?? '?'} episode`;

  $('detail-synopsis').textContent =
    'Memuat sinopsis...';

  $('episode-list').innerHTML =
    '<div class="empty-message">Menyiapkan daftar episode...</div>';

  updateWatchButton();

  try {
    const detail = await getAnimeDetail(anime.id);

    if (state.current?.id !== anime.id) return;

    state.current = detail;
    state.anime.set(detail.id, detail);

    $('detail-synopsis').textContent =
      detail.description
        ? detail.description.replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
        : 'Sinopsis belum tersedia.';

    renderEpisodes(detail);
  } catch (error) {
    $('detail-synopsis').textContent =
      'Sinopsis belum berhasil dimuat.';

    renderEpisodes(anime);
  }
}

function renderEpisodes(anime) {
  const host = $('episode-list');

  if (!host) return;

  const count = Number(anime.episodes) || 0;

  if (!count) {
    host.innerHTML = `
      <div class="empty-message">
        Jumlah episode belum diketahui.
      </div>
    `;
    return;
  }

  const limit = Math.min(count, 100);

  host.innerHTML = Array.from(
    { length: limit },
    (_, index) => `
      <button
        type="button"
        data-episode="${index + 1}"
        class="episode-button"
      >
        Episode ${index + 1}
      </button>
    `
  ).join('');

  if (count > limit) {
    host.insertAdjacentHTML(
      'beforeend',
      '<p class="muted-note">Menampilkan 100 episode pertama.</p>'
    );
  }
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
    return JSON.parse(
      localStorage.getItem(WATCH_KEY) || '[]'
    );
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
    toast('Watchlist gagal disimpan.');
  }
}

function isSaved(id) {
  return state.watchlist.some(anime => anime.id === id);
}

function updateWatchButton() {
  if (!state.current) return;

  $('detail-watchlist').textContent =
    isSaved(state.current.id)
      ? '✓ Tersimpan'
      : '+ Watchlist';
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

    toast('Berhasil disimpan!');
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
    'Watchlist masih kosong. Simpan anime favoritmu!'
  );
}


// ========================================
// OFFICIAL VIDEO FEEDS
// ========================================

async function loadFeed(endpoint) {
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error('Feed tidak tersedia.');
  }

  const result = await response.json();

  return Array.isArray(result.videos)
    ? result.videos
    : [];
}

async function loadOfficialVideos() {
  const host = $('muse-list');

  if (host) {
    host.innerHTML =
      '<div class="empty-message">Memuat video resmi...</div>';
  }

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
      <div class="empty-message">
        Video resmi belum berhasil dimuat.
        Coba buka kembali nanti.
      </div>
    `;
    return;
  }

  host.innerHTML = videos.map((video, index) => `
    <article
      class="muse-card"
      data-video-index="${index}"
      tabindex="0"
      role="button"
    >
      <img
        src="${esc(video.thumbnail || '')}"
        alt="${esc(video.title || 'Video anime')}"
        loading="lazy"
      >

      <div class="muse-card-info">
        <h3>${esc(video.title || 'Video anime')}</h3>
        <p>${esc(video.source || 'Official YouTube')}</p>
      </div>
    </article>
  `).join('');

  host.querySelectorAll('[data-video-index]').forEach(card => {
    const open = () => {
      const video = videos[Number(card.dataset.videoIndex)];

      if (video) {
        playYouTube(video);
      }
    };

    card.addEventListener('click', open);

    card.addEventListener('keydown', event => {
      if (event.key === 'Enter') open();
    });
  });
}


// ========================================
// VIDEO TITLE MATCHING
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
    const videoTitle = normalizeTitle(video.title);

    return titles.some(title => videoTitle.includes(title));
  });
}

function findEpisodeVideo(videos, episode) {
  const patterns = [
    new RegExp(`episode\\s*0*${episode}(?!\\d)`, 'i'),
    new RegExp(`ep\\.?\\s*0*${episode}(?!\\d)`, 'i'),
    new RegExp(`eps\\.?\\s*0*${episode}(?!\\d)`, 'i')
  ];

  return videos.filter(video =>
    patterns.some(pattern => pattern.test(video.title || ''))
  );
}


// ========================================
// PLAYER
// ========================================

function openPlayer(episode = 1) {
  if (!state.current) return;

  state.previousPage = 'detail';
  state.currentEpisode = episode;

  $('player-title').textContent = titleOf(state.current);

  $('player-episode').textContent =
    `Episode ${episode}`;

  const videos = findAnimeVideos(state.current);

  const episodeVideos = findEpisodeVideo(
    videos,
    episode
  );

  showPlayerSources(
    episodeVideos,
    videos
  );

  navigate('player');
}

function showPlayerSources(episodeVideos, allVideos) {
  const host = $('video-empty');

  stopYouTube();

  if (!episodeVideos.length && !allVideos.length) {
    host.style.display = 'flex';

    host.innerHTML = `
      <div>
        <p>Video belum tersedia.</p>
        <small>
          Anime ini belum ditemukan di feed Muse atau Ani-One.
        </small>
      </div>
    `;

    $('youtube-link').href =
      'https://www.youtube.com/@MuseIndonesia';

    return;
  }

  if (!episodeVideos.length && allVideos.length) {
    host.style.display = 'flex';

    host.innerHTML = `
      <div>
        <p>Episode ${state.currentEpisode} belum ditemukan.</p>
        <small>
          Ada video lain untuk judul anime ini.
          Pilih video dari daftar di bawah.
        </small>
      </div>
    `;

    renderSourceChoices(allVideos);

    return;
  }

  host.style.display = 'none';

  renderSourceChoices(episodeVideos);

  playYouTube(episodeVideos[0]);
}

function renderSourceChoices(videos) {
  const old = $('video-source-list');

  if (old) old.remove();

  const host = document.createElement('section');

  host.id = 'video-source-list';
  host.className = 'content-section';

  host.innerHTML = `
    <h2>Sumber Video</h2>
    <div class="source-list">
      ${videos.map((video, index) => `
        <button
          type="button"
          data-source-index="${index}"
          class="episode-button"
        >
          ${esc(video.source || 'YouTube')}
          · ${esc(video.title)}
        </button>
      `).join('')}
    </div>
  `;

  $('page-player').appendChild(host);

  host.querySelectorAll('[data-source-index]').forEach(button => {
    button.addEventListener('click', () => {
      const video = videos[
        Number(button.dataset.sourceIndex)
      ];

      playYouTube(video);
    });
  });
}

function playYouTube(video) {
  if (!video?.videoId) {
    toast('ID video tidak tersedia.');
    return;
  }

  stopYouTube();

  const iframe = $('youtube-player');

  const videoId = String(video.videoId);

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    toast('ID YouTube tidak valid.');
    return;
  }

  iframe.src =
    `https://www.youtube-nocookie.com/embed/${videoId}`;

  iframe.classList.remove('hidden');

  $('video-player')?.classList.add('hidden');

  $('video-empty').style.display = 'none';

  $('youtube-link').href =
    video.url ||
    `https://www.youtube.com/watch?v=${videoId}`;

  $('youtube-link').textContent =
    `Buka ${video.source || 'YouTube'} ↗`;
}

function stopYouTube() {
  const iframe = $('youtube-player');

  if (!iframe) return;

  iframe.src = '';
  iframe.classList.add('hidden');

  const old = $('video-source-list');

  if (old) old.remove();
}


// ========================================
// START
// ========================================
