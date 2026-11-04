const API_BASE = 'https://kitsu.io/api/edge';

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
    const res = await fetch(`${API_BASE}/anime?page[limit]=24&sort=-averageRating`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const json = await res.json();
    const animeList = json.data;

    if (!animeList || animeList.length === 0) throw new Error("Data anime kosong.");

    const hero = animeList[0];
    document.getElementById("hero-img").src = hero.attributes.posterImage.original;
    document.getElementById("hero-title").textContent = hero.attributes.canonicalTitle;

    latestList.innerHTML = animeList.slice(0, 10).map(cardHTML).join("");
    document.getElementById("popular-list").innerHTML = animeList.slice(10, 24).map(cardHTML).join("");
    
    attachCardClicks(animeList);

  } catch (error) {
    console.error(error);
    latestList.innerHTML = `<p style='color:red;'>Gagal memuat: ${error.message}</p>`;
  }
}

function cardHTML(a) {
  return `
    <div class="card" data-id="${a.id}">
      <img src="${a.attributes.posterImage.medium}" alt="${a.attributes.canonicalTitle}" loading="lazy" style="object-fit:cover;" />
      <h3>${a.attributes.canonicalTitle}</h3>
      <small>Rating ${a.attributes.averageRating || '-'}</small>
    </div>`;
}

function attachCardClicks(animeList) {
  document.querySelectorAll(".card").forEach(c => {
    c.onclick = () => {
      const id = c.dataset.id;
      const anime = animeList.find(x => x.id === id);
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
  document.getElementById("detail-img").src = anime.attributes.posterImage.original;
  document.getElementById("detail-title").textContent = anime.attributes.canonicalTitle;
  document.getElementById("detail-rating").textContent = `Rating ${anime.attributes.averageRating || '-'}`;
  document.getElementById("detail-status").textContent = anime.attributes.status || "Unknown";
  document.getElementById("detail-episodes").textContent = `${anime.attributes.episodeCount || '?'} eps`;
  document.getElementById("detail-synopsis").textContent = anime.attributes.synopsis || "Sinopsis tidak tersedia.";

  const epList = document.getElementById("detail-episodes-list");
  
  // UBAH DISINI: Pakai total episode asli, kalau gak ada baru max 100
  const totalEps = anime.attributes.episodeCount || 100; 
  epList.innerHTML = Array.from({ length: Math.min(totalEps, 100) }, (_, i) =>
    `<button onclick="openPlayer('${anime.attributes.canonicalTitle}', ${i + 1})">${i + 1}</button>`
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
  
  // UBAH DISINI: Bikin loop sampai 100 episode
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
