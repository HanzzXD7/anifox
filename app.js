const DUMMY = [
  { id: 1, title: "Solo Leveling", poster: "https://picsum.photos/seed/anime1/300/450", rating: 8.5, eps: 12, synopsis: "Sung Jinwoo, hunter terlemah, mendapatkan kekuatan misterius untuk naik level tanpa batas." },
  { id: 2, title: "Jujutsu Kaisen", poster: "https://picsum.photos/seed/anime2/300/450", rating: 8.7, eps: 24, synopsis: "Yuji Itadori terjun ke dunia penyihir jujutsu setelah menelan jari kutukan." },
  { id: 3, title: "Demon Slayer", poster: "https://picsum.photos/seed/anime3/300/450", rating: 8.6, eps: 26, synopsis: "Tanjiro berjuang jadi pemburu iblis untuk menyelamatkan adiknya." },
  { id: 4, title: "One Piece", poster: "https://picsum.photos/seed/anime4/300/450", rating: 8.9, eps: 1000, synopsis: "Luffy dan kru bajak lautnya mencari harta karun legendaris One Piece." },
  { id: 5, title: "Chainsaw Man", poster: "https://picsum.photos/seed/anime5/300/450", rating: 8.4, eps: 12, synopsis: "Denji jadi pemburu iblis dengan kekuatan gergaji mesin." },
  { id: 6, title: "Attack on Titan", poster: "https://picsum.photos/seed/anime6/300/450", rating: 9.0, eps: 87, synopsis: "Manusia bertahan dari raksasa pemakan manusia di balik tembok." },
];

window.addEventListener("load", () => {
  setTimeout(() => {
    document.getElementById("auth-actions").classList.remove("hidden");
  }, 1800);
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

function renderHome() {
  const hero = DUMMY[0];
  document.getElementById("hero-img").src = hero.poster;
  document.getElementById("hero-title").textContent = hero.title;

  document.getElementById("latest-list").innerHTML = DUMMY.map(cardHTML).join("");
  document.getElementById("popular-list").innerHTML = DUMMY.slice().reverse().map(cardHTML).join("");
  attachCardClicks();
}

function cardHTML(a) {
  return `
    <div class="card" data-id="${a.id}">
      <img src="${a.poster}" alt="${a.title}" loading="lazy" />
      <h3>${a.title}</h3>
      <small>Rating ${a.rating} | ${a.eps} eps</small>
    </div>`;
}

function attachCardClicks() {
  document.querySelectorAll(".card").forEach(c => {
    c.onclick = () => openDetail(parseInt(c.dataset.id));
  });
}

document.querySelectorAll(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    item.classList.add("active");

    const page = item.dataset.page;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(`page-${page}`).classList.add("active");

    if (page === "search") renderSearch("");
  });
});

const searchInput = document.getElementById("search-input");
searchInput.addEventListener("input", e => renderSearch(e.target.value));

function renderSearch(q) {
  const results = DUMMY.filter(a => a.title.toLowerCase().includes(q.toLowerCase()));
  document.getElementById("search-results").innerHTML =
    results.length ? results.map(cardHTML).join("") :
    `<p style="color:var(--text-muted);font-size:13px;grid-column:1/-1">Tidak ada hasil untuk "${q}"</p>`;
  attachCardClicks();
}

function openDetail(id) {
  const a = DUMMY.find(x => x.id === id);
  if (!a) return;

  document.getElementById("detail-img").src = a.poster;
  document.getElementById("detail-title").textContent = a.title;
  document.getElementById("detail-rating").textContent = `Rating ${a.rating}`;
  document.getElementById("detail-status").textContent = "Ongoing";
  document.getElementById("detail-episodes").textContent = `${a.eps} eps`;
  document.getElementById("detail-synopsis").textContent = a.synopsis;

  const epList = document.getElementById("detail-episodes-list");
  epList.innerHTML = Array.from({ length: Math.min(a.eps, 24) }, (_, i) =>
    `<button onclick="openPlayer('${a.title}', ${i + 1})">${i + 1}</button>`
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

renderHome();
