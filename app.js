'use strict';

// ========================================
// AniFoX — AniList + AniLab + Bstation
// + Supabase + Google Login + User Profile
// ========================================

const ANILIST_API = 'https://graphql.anilist.co';
const ANILAB_API = 'https://anilab-beta.vercel.app/api';

const SUPABASE_URL =
  'https://oomkaubthpchrsozhsma.supabase.co';

const SUPABASE_PUBLIC_KEY =
  'sb_publishable_BALnAwlkzVGciyVl5nTScQ_ER1PidyH';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const $ = id => document.getElementById(id);

const WATCH_KEY = 'anifox_watchlist_v3';
const ONBOARDING_KEY = 'anifox_onboarding_seen_v1';

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

  currentGenre: '',
  genrePage: 1,
  genreHasNextPage: false,

  searchKeyword: '',
  searchPage: 1,
  searchHasNextPage: false,

  socialConnections: [],
  socialSearchResult: null,
  socialPanelMode: ''
};

// ========================================
// SUPABASE STATE
// ========================================

let supabaseClient = null;
let authSession = null;
let appStarted = false;
let splashFinished = false;

let profileData = null;
let profilePublicId = null;

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  state.watchlist = getWatchlist().filter(isAllowedAnime);

  bindEvents();
  initializeSupabase();

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      authSession = session;

      if (event === 'SIGNED_IN' && splashFinished) {
        showMainApp();
      }

      if (event === 'SIGNED_OUT' && splashFinished) {
        appStarted = false;
        profileData = null;
        profilePublicId = null;
        localStorage.removeItem(ONBOARDING_KEY);
        showOnboarding(false);
      }
    });

    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) {
      console.error('Supabase session error:', error.message);
    }

    authSession = data?.session || null;
  }

  showSplash();
}

function initializeSupabase() {
  if (!window.supabase?.createClient) {
    console.error('Supabase JS belum berhasil dimuat.');
    return;
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLIC_KEY
  );
}

// ========================================
// EVENT LISTENERS
// ========================================

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

  $('google-login')?.addEventListener('click', loginWithGoogle);

  $('onboarding-scroll')?.addEventListener(
    'scroll',
    updateOnboardingProgress
  );

  $('episode-list')?.addEventListener('click', handleEpisodeClick);

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      navigate(button.dataset.page);
    });
  });

  $('home-profile-card')?.addEventListener('click', () => {
    navigate('profile');
  });

  $('logout-button')?.addEventListener('click', logoutAniFoX);

  $('copy-profile-id')?.addEventListener(
    'click',
    copyProfileId
  );

  $('save-profile')?.addEventListener(
    'click',
    saveProfile
  );

  $('edit-avatar')?.addEventListener(
    'change',
    previewProfileAvatar
  );

  $('social-fab')?.addEventListener('click', toggleSocialMenu);
  $('social-open-friends')?.addEventListener('click', () => {
    openSocialPanel('friends');
  });
  $('social-open-add')?.addEventListener('click', () => {
    openSocialPanel('add');
  });
  $('social-panel-close')?.addEventListener('click', closeSocialPanel);
  $('social-refresh')?.addEventListener('click', loadSocialLine);
  $('social-comment-submit')?.addEventListener('click', submitEpisodeComment);

  $('social-panel-content')?.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-social-action]');
    if (!actionButton) return;

    handleSocialRequestAction(
      actionButton.dataset.socialAction,
      actionButton.dataset.requestId
    );
  });
}

// ========================================
// SPLASH + ONBOARDING + APP ROUTING
// ========================================

function showSplash() {
  let progress = 0;
  const bar = $('loading-progress');

  state.splashTimer = setInterval(() => {
    progress = Math.min(100, progress + 12);

    if (bar) {
      bar.style.width = `${progress}%`;
    }

    if (progress >= 100) {
      finishSplash();
    }
  }, 65);
}

function enterApp() {
  finishSplash();
}

function finishSplash() {
  if (splashFinished) return;

  splashFinished = true;
  clearInterval(state.splashTimer);

  $('splash')?.classList.add('fade-out');

  if (authSession) {
    showMainApp();
    return;
  }

  const onboardingSeen =
    localStorage.getItem(ONBOARDING_KEY) === 'true';

  showOnboarding(onboardingSeen);
}

function showOnboarding(finalOnly = false) {
  const onboarding = $('onboarding');
  const app = $('app');
  const scroll = $('onboarding-scroll');

  if (!onboarding || !scroll) return;

  app?.classList.add('hidden');
  onboarding.classList.remove('hidden');

  const pages = onboarding.querySelectorAll('.onboarding-page');
  const dots = onboarding.querySelectorAll('.onboarding-dot');

  pages.forEach((page, index) => {
    page.style.display =
      finalOnly && index < 2 ? 'none' : 'flex';
  });

  dots.forEach((dot, index) => {
    dot.style.display =
      finalOnly && index < 2 ? 'none' : 'block';

    dot.classList.toggle(
      'active',
      finalOnly ? index === 2 : index === 0
    );
  });

  scroll.scrollTop = 0;

  const hint = onboarding.querySelector('.onboarding-hint');

  if (hint) {
    const hintText = hint.querySelector('.onboarding-hint-text');

    const message = finalOnly
      ? 'Masuk untuk melanjutkan ke AniFoX'
      : 'Geser ke atas untuk melanjutkan';

    if (hintText) {
      hintText.textContent = message;
    } else {
      hint.textContent = message;
    }
  }

  const loginMessage = $('login-message');

  if (loginMessage) {
    loginMessage.textContent = '';
  }
}

function updateOnboardingProgress() {
  const scroll = $('onboarding-scroll');
  const onboarding = $('onboarding');

  if (!scroll || !onboarding) return;

  const pages = Array.from(
    onboarding.querySelectorAll('.onboarding-page')
  ).filter(page => page.style.display !== 'none');

  const dots = Array.from(
    onboarding.querySelectorAll('.onboarding-dot')
  ).filter(dot => dot.style.display !== 'none');

  if (!pages.length) return;

  const pageHeight = scroll.clientHeight || 1;

  const currentIndex = Math.min(
    pages.length - 1,
    Math.round(scroll.scrollTop / pageHeight)
  );

  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentIndex);
  });

  if (pages.length === 3 && currentIndex === 2) {
    localStorage.setItem(ONBOARDING_KEY, 'true');
  }
}

function showMainApp() {
  if (!authSession) return;

  $('splash')?.classList.add('fade-out');
  $('onboarding')?.classList.add('hidden');
  $('app')?.classList.remove('hidden');

  if (!appStarted) {
    appStarted = true;
    loadHome();
  }
}

// ========================================
// GOOGLE LOGIN
// ========================================

async function loginWithGoogle() {
  const message = $('login-message');

  if (!supabaseClient) {
    if (message) {
      message.textContent =
        'Layanan login belum siap. Coba muat ulang halaman.';
    }
    return;
  }

  const button = $('google-login');
  const label = button?.querySelector('.google-button-label');

  if (button) {
    button.disabled = true;

    if (label) {
      label.textContent = 'Menghubungkan ke Google...';
    } else {
      button.textContent = 'Menghubungkan ke Google...';
    }
  }

  if (message) {
    message.textContent = '';
  }

  try {
    const { error } =
      await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });

    if (error) throw error;

  } catch (error) {
    console.error('Google login error:', error);

    if (message) {
      message.textContent =
        error.message || 'Login Google gagal. Silakan coba lagi.';
    }

    if (button) {
      button.disabled = false;

      if (label) {
        label.textContent = 'Login dengan Google';
      } else {
        button.textContent = 'Login dengan Google';
      }
    }
  }
}

// ========================================
// LOGOUT
// ========================================

async function logoutAniFoX() {
  if (!supabaseClient) {
    toast('Layanan akun belum siap.');
    return;
  }

  const button = $('logout-button');

  if (button) {
    button.disabled = true;
    button.textContent = 'Keluar...';
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error('Logout error:', error);
    toast('Logout gagal. Silakan coba lagi.');

    if (button) {
      button.disabled = false;
      button.textContent = 'Keluar dari Akun';
    }

    return;
  }

  localStorage.removeItem(ONBOARDING_KEY);

  authSession = null;
  appStarted = false;
  profileData = null;
  profilePublicId = null;

  showOnboarding(false);
}

// ========================================
// NAVIGATION
// ========================================

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
    button.classList.toggle(
      'active',
      button.dataset.page === page
    );
  });

  if (page === 'list') {
    renderWatchlist();
  }

  if (page === 'profile') {
    loadProfile();
  }

  if (page === 'social') {
    loadSocialLine();
  }

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
    anime?.coverImage?.large ||
    '';
}

function titleOf(anime) {
  return anime?.title?.english ||
    anime?.title?.romaji ||
    anime?.title?.native ||
    'Untitled';
}

// Hentai disaring, Ecchi tetap diperbolehkan.
function isAllowedAnime(anime) {
  const genres = Array.isArray(anime?.genres)
    ? anime.genres
    : [];

  return !genres.some(genre =>
    String(genre).trim().toLowerCase() === 'hentai'
  );
}

function remember(items) {
  (items || []).forEach(anime => {
    if (anime?.id && isAllowedAnime(anime)) {
      state.anime.set(Number(anime.id), anime);
    }
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
// USER PROFILE — SUPABASE
// ========================================

function getGoogleAvatar(user) {
  const metadata = user?.user_metadata || {};

  return metadata.avatar_url ||
    metadata.picture ||
    '';
}

function getRank(level, role) {
  if (role === 'DEV') {
    return {
      name: 'Elytra',
      className: 'rank-elytra',
      icon: 'elytra',
      level: 999999
    };
  }

  const ranks = [
    { min: 150000, name: 'Elytra', className: 'rank-elytra', icon: 'elytra' },
    { min: 75000, name: 'Lava', className: 'rank-lava', icon: 'lava' },
    { min: 25000, name: 'Golden Apple', className: 'rank-golden-apple', icon: 'golden-apple' },
    { min: 10000, name: 'Nether Star', className: 'rank-nether-star', icon: 'nether-star' },
    { min: 5500, name: 'Diamond', className: 'rank-diamond', icon: 'diamond' },
    { min: 1500, name: 'Emerald', className: 'rank-emerald', icon: 'emerald' },
    { min: 500, name: 'Gold', className: 'rank-gold', icon: 'gold' },
    { min: 100, name: 'Iron', className: 'rank-iron', icon: 'iron' },
    { min: 50, name: 'Copper', className: 'rank-copper', icon: 'copper' },
    { min: 1, name: 'Coal', className: 'rank-coal', icon: 'coal' }
  ];

  return ranks.find(rank => level >= rank.min) || ranks[ranks.length - 1];
}

async function loadProfile(options = {}) {
  const silent = options.silent === true;

  if (!supabaseClient || !authSession?.user) {
    if (!silent) {
      toast('Silakan login terlebih dahulu.');
    }
    return;
  }

  const user = authSession.user;
  const message = $('profile-message');

  if (message && !silent) {
    message.textContent = 'Memuat profil...';
  }

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, public_number, username, avatar_url, role, level, exp')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      profileData = null;
      profilePublicId = null;

      renderProfileFallback(user);

      if (message && !silent) {
        message.textContent =
          'Data profil belum tersedia. Perlu pemeriksaan tabel profil Supabase.';
      }

      return;
    }

    profileData = data;
    profilePublicId = data.public_number != null
      ? `#${data.public_number}`
      : null;

    renderProfile(data, user);

    if (message && !silent) {
      message.textContent = '';
    }

  } catch (error) {
    console.error('Profile load error:', error);
    profilePublicId = null;

    if (message && !silent) {
      message.textContent = 'Profil gagal dimuat. Coba lagi.';
    }

    renderProfileFallback(user);
  }
}

function renderProfileFallback(user) {
  const metadata = user?.user_metadata || {};

  if ($('profile-name')) {
    $('profile-name').textContent =
      metadata.full_name ||
      metadata.name ||
      'Pengguna AniFoX';
  }

  if ($('profile-email')) {
    $('profile-email').textContent = user?.email || '-';
  }

  if ($('profile-avatar')) {
    $('profile-avatar').src =
      getGoogleAvatar(user) || 'anifox-logo.png';
  }

  if ($('profile-role')) {
    $('profile-role').textContent = 'USER';
  }

  if ($('profile-id')) {
    $('profile-id').textContent = profilePublicId || '#—';
  }

  renderRank(1, 0, 'USER');
  renderHomeProfile(null, user);
}

function renderProfile(data, user) {
  const metadata = user?.user_metadata || {};

  const username =
    data.username ||
    metadata.full_name ||
    metadata.name ||
    'Pengguna AniFoX';

  const avatar =
    data.avatar_url ||
    getGoogleAvatar(user) ||
    'anifox-logo.png';

  if ($('profile-name')) {
    $('profile-name').textContent = username;
  }

  if ($('profile-email')) {
    $('profile-email').textContent = user?.email || '-';
  }

  if ($('profile-avatar')) {
    $('profile-avatar').src = avatar;
  }

  if ($('profile-role')) {
    $('profile-role').textContent =
      data.role === 'DEV' ? 'DEV' : 'USER';
  }

  if ($('profile-id')) {
    $('profile-id').textContent = profilePublicId;
  }

  if ($('edit-username')) {
    $('edit-username').value = data.username || '';
  }

  renderRank(
    Number(data.level) || 1,
    Number(data.exp) || 0,
    data.role
  );

  renderHomeProfile(data, user);
}

function renderHomeProfile(data, user) {
  const metadata = user?.user_metadata || {};

  const username =
    data?.username ||
    metadata.full_name ||
    metadata.name ||
    'Pengguna AniFoX';

  const avatar =
    data?.avatar_url ||
    getGoogleAvatar(user);

  const role = data?.role || 'USER';

  const level = role === 'DEV'
    ? 999999
    : Math.max(1, Number(data?.level) || 1);

  const rank = getRank(level, role);

  const card = $('home-profile-card');
  const avatarElement = $('home-profile-avatar');
  const nameElement = $('home-profile-name');
  const publicIdElement = $('home-profile-id');
  const levelElement = $('home-profile-level');
  const rankIconElement = $('home-profile-rank-icon');

  if (avatarElement) {
    if (avatar) {
      avatarElement.src = avatar;
    } else {
      avatarElement.removeAttribute('src');
    }

    avatarElement.alt = `Foto profil ${username}`;
  }

  if (nameElement) {
    nameElement.textContent = username;
  }

  if (publicIdElement) {
    publicIdElement.textContent = profilePublicId || '#—';
  }

  if (levelElement) {
    levelElement.textContent =
      level.toLocaleString('id-ID');
  }

  if (rankIconElement) {
    rankIconElement.src = `assets/ranks/${rank.icon}.svg`;
    rankIconElement.alt = `${rank.name} material`;
  }

  if (card) {
    card.classList.add('home-profile-card');

    card.classList.remove(
      'rank-coal',
      'rank-copper',
      'rank-iron',
      'rank-gold',
      'rank-emerald',
      'rank-diamond',
      'rank-nether-star',
      'rank-golden-apple',
      'rank-lava',
      'rank-elytra'
    );

    card.classList.add(rank.className);
  }
}

function renderRank(level, exp, role) {
  const rank = getRank(level, role);

  const card = $('profile-rank-card');
  const icon = $('profile-rank-icon');
  const levelText = $('profile-level');
  const rankName = $('profile-rank-name');
  const expProgress = $('profile-exp-progress');
  const expText = $('profile-exp-text');

  if (card) {
    card.className = `rank-card ${rank.className}`;
  }

  if (icon) {
    icon.src = `assets/ranks/${rank.icon}.svg`;
    icon.alt = `${rank.name} emblem`;

    icon.onerror = () => {
      icon.style.opacity = '0';
    };
  }

  if (levelText) {
    const displayLevel = role === 'DEV'
      ? 999999
      : Math.max(1, Number(level) || 1);

    levelText.textContent =
      `Lv. ${displayLevel.toLocaleString('id-ID')}`;
  }

  if (rankName) {
    rankName.style.display = 'none';
  }

  if (expProgress) {
    expProgress.style.width = '0%';
  }

  if (expText) {
    expText.textContent =
      role === 'DEV'
        ? 'DEVELOPER'
        : `${exp.toLocaleString('id-ID')} EXP`;
  }
}

async function copyProfileId() {
  if (!profilePublicId) {
    toast('ID profil belum tersedia.');
    return;
  }

  try {
    await navigator.clipboard.writeText(profilePublicId);
    toast('ID AniFoX berhasil disalin.');
  } catch {
    toast('Tidak bisa menyalin ID di perangkat ini.');
  }
}

function previewProfileAvatar(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    toast('Pilih file gambar.');
    event.target.value = '';
    return;
  }

  if (file.size > MAX_AVATAR_SIZE) {
    toast('Ukuran foto maksimal 2 MB.');
    event.target.value = '';
    return;
  }

  const preview = $('profile-avatar');

  if (preview) {
    const reader = new FileReader();

    reader.onload = () => {
      preview.src = reader.result;
    };

    reader.readAsDataURL(file);
  }
}

async function uploadProfileAvatar(file, userId) {
  if (!file || !userId) return null;

  if (!file.type.startsWith('image/')) {
    throw new Error('File harus berupa gambar.');
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('Ukuran foto maksimal 2 MB.');
  }

  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  const extension = extensionMap[file.type];

  if (!extension) {
    throw new Error('Format foto harus JPG, PNG, atau WEBP.');
  }

  const filePath =
    `${userId}/${Date.now()}.${extension}`;

  const { error: uploadError } =
    await supabaseClient.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

  if (uploadError) throw uploadError;

  const { data } =
    supabaseClient.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(filePath);

  return data.publicUrl;
}

async function saveProfile() {
  if (!supabaseClient || !authSession?.user) {
    toast('Silakan login terlebih dahulu.');
    return;
  }

  if (!profileData) {
    toast('Data profil belum tersedia.');
    return;
  }

  const usernameInput = $('edit-username');
  const avatarInput = $('edit-avatar');
  const button = $('save-profile');
  const message = $('profile-message');

  const username = usernameInput?.value.trim() || '';

  if (username.length < 3) {
    if (message) {
      message.textContent = 'Username minimal 3 karakter.';
    }
    return;
  }

  if (username.length > 24) {
    if (message) {
      message.textContent = 'Username maksimal 24 karakter.';
    }
    return;
  }

  if (!/^[a-zA-Z0-9_ ]+$/.test(username)) {
    if (message) {
      message.textContent =
        'Gunakan huruf, angka, spasi, atau garis bawah.';
    }
    return;
  }

  const file = avatarInput?.files?.[0];

  if (button) {
    button.disabled = true;
    button.textContent = 'Menyimpan...';
  }

  if (message) {
    message.textContent = '';
  }

  try {
    let avatarUrl = profileData.avatar_url || null;

    if (file) {
      avatarUrl = await uploadProfileAvatar(
        file,
        authSession.user.id
      );
    }

    const { data, error } = await supabaseClient
      .from('profiles')
      .update({
        username,
        avatar_url: avatarUrl
      })
      .eq('id', authSession.user.id)
      .select('id, public_number, username, avatar_url, role, level, exp')
      .single();

    if (error) throw error;

    profileData = data;

    renderProfile(data, authSession.user);

    if (avatarInput) {
      avatarInput.value = '';
    }

    if (message) {
      message.textContent = 'Profil berhasil diperbarui.';
    }

    toast('Profil AniFoX berhasil disimpan.');

  } catch (error) {
    console.error('Save profile error:', error);

    if (message) {
      message.textContent =
        error.message ||
        'Gagal menyimpan profil. Periksa pengaturan penyimpanan foto.';
    }

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Simpan Perubahan';
    }
  }
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

  return (data.Page.media || []).filter(isAllowedAnime);
}

// ========================================
// ANILAB CATALOG API
// ========================================

async function getPopularAnime(page = 1) {
  const response = await fetch(
    `${ANILAB_API}/catalog?page=${page}`
  );

  if (!response.ok) {
    throw new Error('AniLab gagal mengambil katalog populer.');
  }

  const result = await response.json();

  if (!result.status || !Array.isArray(result.data)) {
    throw new Error('Respons katalog AniLab tidak valid.');
  }

  return result.data.filter(isAllowedAnime);
}

// ========================================
// SEARCH API — ANILIST
// ========================================

async function searchAnime(keyword, page = 1) {
  const query = `
    query ($search: String, $page: Int) {
      Page(page: $page, perPage: 24) {
        pageInfo {
          currentPage
          hasNextPage
        }
        media(
          type: ANIME
          search: $search
          sort: SEARCH_MATCH
        ) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const data = await anilist(query, {
    search: keyword,
    page
  });

  return {
    items: (data.Page.media || []).filter(isAllowedAnime),
    page: data.Page.pageInfo.currentPage,
    hasNextPage: data.Page.pageInfo.hasNextPage
  };
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

function renderCards(
  target,
  items,
  emptyMessage = 'Anime belum tersedia.'
) {
  const element = $(target);
  if (!element) return;

  const safeItems = (items || []).filter(isAllowedAnime);

  if (!safeItems.length) {
    element.innerHTML = `
      <div class="empty-message">${esc(emptyMessage)}</div>
    `;
    return;
  }

  element.innerHTML = safeItems.map(cardHTML).join('');

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
  if (authSession?.user) {
    loadProfile({ silent: true });
  }

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
    renderCards('season-list', season.value.slice(0, 10));
  } else {
    $('season-list').innerHTML = `
      <div class="empty-message">
        ${esc(season.reason?.message || 'Season gagal dimuat.')}
      </div>
    `;
  }

  if (popular.status === 'fulfilled') {
    remember(popular.value);
    renderCards('popular-list', popular.value.slice(0, 10));
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

    const art = state.featured.bannerImage || imageOf(state.featured);

    $('hero-art').style.backgroundImage =
      art ? `url("${art}")` : '';
  } else {
    $('hero-title').textContent = 'Temukan anime favoritmu';
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
    renderCards(target, full ? items : items.slice(0, 10));
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
    renderCards(target, full ? items : items.slice(0, 10));
  } catch (error) {
    $(target).innerHTML = `
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

// ========================================
// GENRE — ANILAB
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

    const genres = result.data.filter(genre =>
      String(genre).trim().toLowerCase() !== 'hentai'
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

        clearTimeout(state.searchTimer);
        state.currentGenre = genre;
        state.genrePage = 1;
        state.searchKeyword = '';
        state.searchRequest++;

        navigate('search');

        $('search-input').value = genre;

        loadGenreAnime(genre, 1);
      });
    });

  } catch (error) {
    host.innerHTML = `
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

async function loadGenreAnime(genre, page = 1) {
  const host = $('search-results');
  if (!host) return;

  if (String(genre).trim().toLowerCase() === 'hentai') {
    host.innerHTML = `
      <div class="empty-message">Genre tidak tersedia.</div>
    `;
    return;
  }

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
      throw new Error(result.message || 'Data genre gagal dimuat.');
    }

    state.currentGenre = genre;
    state.genrePage = result.page;
    state.genreHasNextPage = result.hasNextPage;

    const items = (result.data || []).filter(isAllowedAnime);

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
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

// ========================================
// SEARCH — ANILIST
// ========================================

function onSearchInput() {
  clearTimeout(state.searchTimer);

  state.searchRequest++;

  state.currentGenre = '';
  state.genreHasNextPage = false;

  const keyword = $('search-input').value.trim();

  state.searchKeyword = keyword;
  state.searchPage = 1;
  state.searchHasNextPage = false;

  if (!keyword) {
    $('search-results').innerHTML = '';
    return;
  }

  state.searchTimer = setTimeout(() => {
    runSearch(keyword, 1);
  }, 450);
}

async function runSearch(keyword, page = 1) {
  const request = ++state.searchRequest;

  state.searchKeyword = keyword;

  $('search-results').innerHTML = `
    <div class="empty-message">
      Mencari anime halaman ${page}...
    </div>
  `;

  try {
    const result = await searchAnime(keyword, page);

    if (request !== state.searchRequest) return;

    state.searchPage = result.page;
    state.searchHasNextPage = result.hasNextPage;

    remember(result.items);

    renderCards(
      'search-results',
      result.items,
      'Anime tidak ditemukan. Coba judul lain.'
    );

    if (!result.items.length) return;

    renderSearchPagination();

  } catch (error) {
    if (request !== state.searchRequest) return;

    $('search-results').innerHTML = `
      <div class="empty-message">${esc(error.message)}</div>
    `;
  }
}

function renderSearchPagination() {
  const host = $('search-results');
  if (!host) return;

  const pagination = document.createElement('div');
  pagination.className = 'genre-pagination';

  pagination.innerHTML = `
    <button
      type="button"
      id="search-prev"
      ${state.searchPage <= 1 ? 'disabled' : ''}
    >
      ← Sebelumnya
    </button>

    <span>Halaman ${state.searchPage}</span>

    <button
      type="button"
      id="search-next"
      ${!state.searchHasNextPage ? 'disabled' : ''}
    >
      Berikutnya →
    </button>
  `;

  host.appendChild(pagination);

  $('search-prev')?.addEventListener('click', () => {
    if (state.searchPage > 1 && state.searchKeyword) {
      runSearch(state.searchKeyword, state.searchPage - 1);
    }
  });

  $('search-next')?.addEventListener('click', () => {
    if (state.searchHasNextPage && state.searchKeyword) {
      runSearch(state.searchKeyword, state.searchPage + 1);
    }
  });
}

// ========================================
// ANIME DETAIL
// ========================================

async function openDetail(anime) {
  if (!isAllowedAnime(anime)) {
    toast('Anime ini tidak tersedia di AniFoX.');
    return;
  }

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

    if (!isAllowedAnime(detail)) {
      state.current = null;
      toast('Anime ini tidak tersedia di AniFoX.');
      goBack();
      return;
    }

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

  state.currentEpisode = Number(button.dataset.episode) || 1;

  const episodeInput = $('social-comment-episode');
  if (episodeInput) {
    episodeInput.value = String(state.currentEpisode);
  }

  openPlayer(state.currentEpisode);
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
  if (!state.current || !isAllowedAnime(state.current)) return;

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
  state.watchlist = state.watchlist.filter(isAllowedAnime);

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
// VIDEO PLAYER — BSTATION
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
// SOCIAL LINE — FRIENDS & ACTIVITY
// ========================================

function toggleSocialMenu() {
  const menu = $('social-action-menu');
  const button = $('social-fab');

  if (!menu || !button) return;

  const opening = menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !opening);
  button.setAttribute('aria-expanded', String(opening));
}

function closeSocialMenu() {
  $('social-action-menu')?.classList.add('hidden');
  $('social-fab')?.setAttribute('aria-expanded', 'false');
}

function closeSocialPanel() {
  $('social-panel')?.classList.add('hidden');
  state.socialPanelMode = '';
}

function openSocialPanel(mode) {
  if (!authSession?.user) {
    toast('Silakan login terlebih dahulu.');
    return;
  }

  closeSocialMenu();

  const panel = $('social-panel');
  const title = $('social-panel-title');
  const content = $('social-panel-content');

  if (!panel || !title || !content) return;

  state.socialPanelMode = mode;
  panel.classList.remove('hidden');

  if (mode === 'friends') {
    title.textContent = 'Daftar Teman';
    content.innerHTML = '<div class="empty-message">Memuat daftar teman...</div>';
    loadSocialConnections().then(renderSocialFriendsPanel);
    return;
  }

  title.textContent = 'Tambah Teman';
  content.innerHTML = `
    <div class="social-search-form">
      <label class="social-input-label" for="social-search-input">
        Cari menggunakan ID publik
      </label>
      <div class="social-search-row">
        <input id="social-search-input"
          class="social-text-input"
          type="search"
          inputmode="numeric"
          maxlength="16"
          placeholder="#123"
          autocomplete="off">
        <button id="social-search-submit"
          class="primary-button" type="button">Cari</button>
      </div>
      <p id="social-search-message" class="social-panel-message">
        Masukkan ID publik teman, misalnya #123.
      </p>
      <div id="social-search-result"></div>
    </div>
  `;

  $('social-search-submit')?.addEventListener('click', searchSocialUser);
  $('social-search-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') searchSocialUser();
  });
}

async function loadSocialConnections() {
  if (!supabaseClient || !authSession?.user) {
    throw new Error('Silakan login terlebih dahulu.');
  }

  const { data, error } = await supabaseClient.rpc(
    'get_my_social_connections'
  );

  if (error) throw error;

  state.socialConnections = Array.isArray(data) ? data : [];
  return state.socialConnections;
}

async function loadSocialLine() {
  const feed = $('social-feed');
  if (!feed) return;

  if (!supabaseClient || !authSession?.user) {
    feed.innerHTML = '<div class="empty-message">Silakan login untuk menggunakan Social Line.</div>';
    return;
  }

  feed.innerHTML = '<div class="empty-message">Memuat aktivitas teman...</div>';

  try {
    const [activityResult, connectionResult] = await Promise.all([
      supabaseClient.rpc('get_social_activity_v1'),
      loadSocialConnections()
    ]);

    if (activityResult.error) throw activityResult.error;

    const activities = Array.isArray(activityResult.data)
      ? activityResult.data
      : [];

    renderSocialActivity(activities);

  } catch (error) {
    console.error('Social Line load error:', error);
    feed.innerHTML = `
      <div class="empty-message">
        Social Line gagal dimuat. ${esc(error.message || 'Coba lagi.')}
      </div>
    `;
  }
}

function renderSocialActivity(items) {
  const feed = $('social-feed');
  if (!feed) return;

  if (!items.length) {
    feed.innerHTML = `
      <div class="social-empty-state">
        <div class="social-empty-icon">◎</div>
        <strong>Belum ada aktivitas teman</strong>
        <p>Tambahkan teman dan tunggu komentar episode mereka muncul di sini.</p>
      </div>
    `;
    return;
  }

  feed.innerHTML = items.map(item => {
    const username = esc(item.username || 'Pengguna AniFoX');
    const avatar = esc(item.avatar_url || 'anifox-logo.png');
    const animeTitle = esc(item.anime_title || 'Anime');
    const animeCover = esc(item.anime_cover || '');
    const episode = Number(item.episode_number) || 1;
    const comment = esc(item.comment || '');
    const publicNumber = item.public_number != null
      ? '#' + esc(item.public_number)
      : '#—';

    const date = item.created_at
      ? new Date(item.created_at).toLocaleString('id-ID', {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : '';

    return `
      <article class="social-activity-card">
        <div class="social-activity-top">
          <img class="social-avatar" src="${avatar}"
            alt="" loading="lazy"
            onerror="this.src='anifox-logo.png'">
          <div class="social-activity-user">
            <strong>${username}</strong>
            <span>${publicNumber} · ${esc(date)}</span>
          </div>
        </div>
        <div class="social-activity-anime">
          ${animeCover ? `<img src="${animeCover}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div>
            <strong>${animeTitle}</strong>
            <span>Episode ${episode}</span>
          </div>
        </div>
        <p class="social-activity-comment">${comment}</p>
      </article>
    `;
  }).join('');
}

function renderSocialFriendsPanel() {
  const content = $('social-panel-content');
  if (!content) return;

  const friends = state.socialConnections.filter(item =>
    item.status === 'accepted'
  );
  const incoming = state.socialConnections.filter(item =>
    item.status === 'pending' && item.direction === 'incoming'
  );
  const outgoing = state.socialConnections.filter(item =>
    item.status === 'pending' && item.direction === 'outgoing'
  );

  const personRow = item => `
    <div class="social-person-row">
      <img class="social-avatar" src="${esc(item.avatar_url || 'anifox-logo.png')}"
        alt="" onerror="this.src='anifox-logo.png'">
      <div class="social-person-info">
        <strong>${esc(item.username || 'Pengguna AniFoX')}</strong>
        <span>#${esc(item.public_number ?? '—')}</span>
      </div>
      ${item.status === 'pending' && item.direction === 'incoming' ? `
        <div class="social-row-actions">
          <button type="button" data-social-action="accept"
            data-request-id="${esc(item.request_id)}">Terima</button>
          <button type="button" data-social-action="reject"
            data-request-id="${esc(item.request_id)}">Tolak</button>
        </div>
      ` : ''}
      ${item.status === 'pending' && item.direction === 'outgoing' ? `
        <button class="social-subtle-action" type="button"
          data-social-action="cancel"
          data-request-id="${esc(item.request_id)}">Batalkan</button>
      ` : ''}
    </div>
  `;

  content.innerHTML = `
    <section class="social-list-section">
      <h3>Teman (${friends.length})</h3>
      ${friends.length
        ? friends.map(personRow).join('')
        : '<p class="social-panel-message">Belum ada teman. Coba tambahkan teman menggunakan ID publik.</p>'}
    </section>
    <section class="social-list-section">
      <h3>Permintaan masuk (${incoming.length})</h3>
      ${incoming.length
        ? incoming.map(personRow).join('')
        : '<p class="social-panel-message">Tidak ada permintaan masuk.</p>'}
    </section>
    <section class="social-list-section">
      <h3>Permintaan terkirim (${outgoing.length})</h3>
      ${outgoing.length
        ? outgoing.map(personRow).join('')
        : '<p class="social-panel-message">Tidak ada permintaan terkirim.</p>'}
    </section>
  `;
}

async function searchSocialUser() {
  const input = $('social-search-input');
  const message = $('social-search-message');
  const resultHost = $('social-search-result');

  if (!input || !message || !resultHost) return;

  const publicNumber = Number(
    input.value.trim().replace(/^#/, '')
  );

  if (!Number.isSafeInteger(publicNumber) || publicNumber < 1) {
    message.textContent = 'Masukkan ID angka yang valid, misalnya #123.';
    resultHost.innerHTML = '';
    return;
  }

  message.textContent = 'Mencari akun...';
  resultHost.innerHTML = '';
  state.socialSearchResult = null;

  try {
    const { data, error } = await supabaseClient.rpc(
      'search_profile_by_number',
      { p_public_number: publicNumber }
    );

    if (error) {
  console.error('RPC ERROR DETAIL:', error);
  console.error('PUBLIC NUMBER:', publicNumber);
  throw error;
    }

    const profile = Array.isArray(data) ? data[0] : null;

    if (!profile) {
      message.textContent = 'Akun dengan ID tersebut tidak ditemukan.';
      return;
    }

    state.socialSearchResult = profile;
    const existing = state.socialConnections.find(item =>
      item.user_id === profile.id
    );

    message.textContent = '';

    resultHost.innerHTML = `
      <div class="social-search-result">
        <img class="social-avatar"
          src="${esc(profile.avatar_url || 'anifox-logo.png')}"
          alt="" onerror="this.src='anifox-logo.png'">
        <div class="social-person-info">
          <strong>${esc(profile.username || 'Pengguna AniFoX')}</strong>
          <span>#${esc(profile.public_number)}</span>
        </div>
        ${existing
          ? `<span class="social-existing-status">${existing.status === 'accepted' ? 'Sudah berteman' : existing.direction === 'incoming' ? 'Menunggu responsmu' : 'Permintaan terkirim'}</span>`
          : '<button id="social-send-request" class="primary-button" type="button">Tambah</button>'}
      </div>
    `;

    $('social-send-request')?.addEventListener('click', sendSocialFriendRequest);

  } catch (error) {
    console.error('Social search error:', error);
    message.textContent = error.message || 'Pencarian gagal. Coba lagi.';
  }
}

async function sendSocialFriendRequest() {
  const profile = state.socialSearchResult;

  if (!profile || !authSession?.user) return;

  const button = $('social-send-request');
  if (button) {
    button.disabled = true;
    button.textContent = 'Mengirim...';
  }

  try {
    const { error } = await supabaseClient
      .from('friend_requests')
      .insert({
        sender_id: authSession.user.id,
        receiver_id: profile.id
      });

    if (error) throw error;

    toast('Permintaan pertemanan berhasil dikirim.');
    await loadSocialConnections();
    await searchSocialUser();

  } catch (error) {
    console.error('Send friend request error:', error);
    toast(error.message || 'Permintaan gagal dikirim.');
    if (button) {
      button.disabled = false;
      button.textContent = 'Tambah';
    }
  }
}

async function handleSocialRequestAction(action, requestId) {
  if (!requestId || !authSession?.user) return;

  try {
    let result;

    if (action === 'accept' || action === 'reject') {
      result = await supabaseClient
        .from('friend_requests')
        .update({
          status: action === 'accept' ? 'accepted' : 'rejected'
        })
        .eq('id', requestId)
        .eq('receiver_id', authSession.user.id)
        .eq('status', 'pending');
    } else if (action === 'cancel') {
      result = await supabaseClient
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .eq('sender_id', authSession.user.id)
        .eq('status', 'pending');
    } else {
      return;
    }

    if (result.error) throw result.error;

    toast(
      action === 'accept' ? 'Permintaan diterima.' :
      action === 'reject' ? 'Permintaan ditolak.' :
      'Permintaan dibatalkan.'
    );

    await loadSocialConnections();
    renderSocialFriendsPanel();
    await loadSocialLine();

  } catch (error) {
    console.error('Friend request action error:', error);
    toast(error.message || 'Aksi pertemanan gagal.');
  }
}

async function submitEpisodeComment() {
  if (!supabaseClient || !authSession?.user) {
    toast('Silakan login untuk mengirim komentar.');
    return;
  }

  if (!state.current || !isAllowedAnime(state.current)) {
    toast('Pilih anime terlebih dahulu.');
    return;
  }

  const input = $('social-comment-text');
  const episodeInput = $('social-comment-episode');
  const comment = input?.value.trim() || '';
  const episode = Number(episodeInput?.value || state.currentEpisode || 1);

  if (!comment || comment.length > 1000) {
    toast('Komentar harus berisi 1–1000 karakter.');
    return;
  }

  if (!Number.isInteger(episode) || episode < 1 || episode > 9999) {
    toast('Nomor episode tidak valid.');
    return;
  }

  const button = $('social-comment-submit');
  if (button) {
    button.disabled = true;
    button.textContent = 'Mengirim...';
  }

  try {
    const { error } = await supabaseClient
      .from('episode_comments')
      .insert({
        user_id: authSession.user.id,
        anime_id: Number(state.current.id),
        anime_title: titleOf(state.current),
        anime_cover: imageOf(state.current) || null,
        episode_number: episode,
        comment
      });

    if (error) throw error;

    input.value = '';
    state.currentEpisode = episode;
    toast('Komentar berhasil dikirim. Temanmu bisa melihatnya di Social Line.');

  } catch (error) {
    console.error('Episode comment error:', error);
    toast(error.message || 'Komentar gagal dikirim.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Kirim Komentar';
    }
  }
}

// ========================================
// END
// ========================================
