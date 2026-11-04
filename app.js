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
  alert("Login Google belum tersedia.");
});

document.getElementById("btn-skip").addEventListener("click", goHome);

async function renderHome() {
  const latestList = document.getElementById("latest-list");
  latestList.innerHTML = "<p style='color:white;'>Memuat data anime...</p>";
  
  try {
    // Minta 24 data anime terpopuler ke Jikan
    const res = await fetch(`${API_BASE}/top/anime?limit=24`);
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const json = await res.json();
    const animeList = json.data;

    if (!animeList || animeList.length === 0) throw new Error("Data kosong");

    // Set Hero pakai anime pertama
    const hero = animeList[0];
    document.getElementById("hero-img").src = hero.images.jpg.large_image_url;
    document.getElementById("hero-title").textContent = hero.title;

    // Render list (Bagi 2 baris: 12 Terbaru, 12 Populer)
    latestList.innerHTML = animeList.slice(0, 12).map(cardHTML).join("");
    document.getElementById("popular-list").innerHTML = animeList.slice(12, 24).map(cardHTML).join("");
    
    attachCardClicks(animeList);

  } catch (error) {
    console.error(error);
    latestList.innerHTML = `<p style='color:red;'>Gagal memuat: ${error.message}</p>`;
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
  });
});

function openDetail(anime) {
  document.getElementById("detail-img").src = anime.images.jpg.large_image_url;
  document.getElementById("detail-title").textContent = anime.title;
  document.getElementById("detail-rating").textContent = `Score ${anime.score || '-'}`;
  document.getElementById("detail-status").textContent = anime.status || "Unknown";
  document.getElementById("detail-episodes").textContent = `${anime.episodes || '?'} eps`;
  document.getElementById("detail-synopsis").textContent = anime.synopsis || "Sinopsis tidak tersedia.";

  const epList = document.getElementById("detail-episodes-list");
  // Kalau Jikan gak ngasih tau jumlah episode (null), kita anggap 12
  const totalEps = anime.episodes || 12; 
  
  epList.innerHTML = Array.from({ length: Math.min(totalEps, 100) }, (_, i) =>
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
  document.getElementById("player-anime").textContent = animeTitle;
  document.getElementById("player-episode").textContent = `Episode ${ep}`;

  const playerEpList = document.getElementById("player-episodes-list");
  let episodesHTML = "";
  
  for (let i = 1; i <= 100; i++) {
    const activeClass = (i === ep) ? "active" : "";
    episodesHTML += `<button onclick="openPlayer('${animeTitle}', ${i})" class="${activeClass}">${i}</button>`;
  }
  
  playerEpList.innerHTML = episodesHTML;
  
  setTimeout(() => {
    const activeBtn = playerEpList.querySelector(".active");
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, 100);

  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-player").classList.add("active");
}

function closePlayer() {
  document.getElementById("page-player").classList.remove("active");
  document.getElementById("page-detail").classList.add("active");
}
