// Jikan API tidak butuh proxy, bisa ditembak langsung
const API_BASE = 'https://api.jikan.moe/v4';

window.addEventListener("load", () => {
  let progress = 0;
  const progressBar = document.getElementById("progress-bar");
  const loadingText = document.getElementById("loading-text");

  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 5) + 1;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      loadingText.textContent = "100%";
      setTimeout(() => {
        document.getElementById("auth-actions").classList.remove("hidden");
      }, 300);
    } else {
      loadingText.textContent = `${progress}%`;
    }
    progressBar.style.width = progress + "%";
  }, 40);
});

function goHome() {
  document.getElementById("splash").classList.add("fade-out");
  setTimeout(() => {
    document.getElementById("app").classList.remove("hidden");
    renderHome();
  }, 500);
}

document.getElementById("btn-google").addEventListener("click", () => {
  alert("Login Google belum tersedia.\nFitur ini akan segera hadir.");
});

document.getElementById("btn-skip").addEventListener("click", goHome);

async function renderHome() {
  document.getElementById("latest-list").innerHTML = "<p style='color:white'>Memuat data anime...</p>";
  document.getElementById("popular-list").innerHTML = "";
  
  try {
    // Ambil data anime populer dari Jikan
    const res = await fetch(`${API_BASE}/top/anime?limit=20`);
    const json = await res.json();
    
    const animeList = json.data;

    if (!animeList || animeList.length === 0) throw new Error("Data kosong");

    // Set Hero Image pakai anime nomor 1
    const hero = animeList[0];
    document.getElementById("hero-img").src = hero.images.jpg.large_image_url;
    document.getElementById("hero-title").textContent = hero.title;

    // Render list (10 terbaru, 10 populer)
    document.getElementById("latest-list").innerHTML = animeList.slice(0, 10).map(cardHTML).join("");
    document.getElementById("popular-list").innerHTML = animeList.slice(10, 20).map(cardHTML).join("");
    
    attachCardClicks(animeList);

  } catch (error) {
    console.error(error);
    document.getElementById("latest-list").innerHTML = "<p style='color:white'>Gagal memuat data. Coba refresh lagi.</p>";
  }
}

function cardHTML(a) {
  return `
    <div class="card" data-id="${a.mal_id}">
      <img src="${a.images.jpg.large_image_url}" alt="${a.title}" loading="lazy" style="object-fit:cover;" />
      <h3>${a.title}</h3>
      <small>Score ${a.score || '-'}</small>
    </div>`;
}

function attachCardClicks(animeList) {
  document.querySelectorAll(".card").forEach(c => {
    c.onclick = () => {
      const id = parseInt(c.dataset.id);
      const anime = animeList.find(x => x.mal_id === id);
      if(anime) openDetail(anime);
    };
  });
}

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    const page = item.dataset.page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(`page-${page}`).classList.add("active");
    
    if (page === "search") {
        document.getElementById("search-results").innerHTML = "<p style='color:white;grid-column:1/-1;'>Fitur pencarian sedang disiapkan.</p>";
    }
  });
});

function openDetail(anime) {
  document.getElementById("detail-img").src = anime.images.jpg.large_image_url;
  document.getElementById("detail-title").textContent = anime.title;
  document.getElementById("detail-rating").textContent = `Score ${anime.score || '-'}`;
  document.getElementById("detail-status").textContent = anime.status || "Unknown";
  document.getElementById("detail-episodes").textContent = `${anime.episodes || '?'} eps`;
  document.getElementById("detail-synopsis").textContent = anime.synopsis || "Sinopsis belum tersedia.";

  const epList = document.getElementById("detail-episodes-list");
  const totalEps = anime.episodes || 12;
  epList.innerHTML = Array.from({ length: Math.min(totalEps, 24) }, (_, i) =>
    `<button onclick="openPlayer('${anime.title}', ${i + 1})">${i + 1}</button>`
  ).join("");

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-detail").classList.add("active");
}

function closeDetail() {
  document.getElementById("page-detail").classList.remove("active");
  document.getElementById("page-home").classList.add("active");
}

function openPlayer(animeTitle, ep) {
  document.getElementById("player-title").textContent = `Episode ${ep}`;
  document.getElementById("player-anime").textContent = animeTitle;
  document.getElementById("player-episode").textContent = `Episode ${ep}`;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-player").classList.add("active");
}

function closePlayer() {
  document.getElementById("page-player").classList.remove("active");
  document.getElementById("page-detail").classList.add("active");
}
