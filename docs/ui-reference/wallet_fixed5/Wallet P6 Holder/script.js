let currentPage = "page-home";
let currentNav = "nav-wallet";

/* ── page navigation ── */
function goTo(pageId) {
  closeDropdown();
  const cur = document.getElementById(currentPage);
  const nxt = document.getElementById(pageId);
  cur.classList.remove("active");
  nxt.classList.add("active", "slide-in");
  nxt.addEventListener("animationend", () => nxt.classList.remove("slide-in"), {
    once: true,
  });
  currentPage = pageId;
}

function goBack() {
  closeDropdown();
  const cur = document.getElementById(currentPage);
  cur.classList.add("slide-out");
  cur.addEventListener(
    "animationend",
    () => {
      cur.classList.remove("active", "slide-out");
      currentPage = "page-home";
      document.getElementById("page-home").classList.add("active");
    },
    { once: true },
  );
}

function navTo(pageId, navId) {
  closeDropdown();
  document.getElementById(currentPage).classList.remove("active");
  document.getElementById(pageId).classList.add("active");
  currentPage = pageId;

  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.remove("active");
    const ind = n.querySelector(".nav-indicator");
    if (ind) ind.remove();
  });
  const an = document.getElementById(navId);
  an.classList.add("active");
  const ind = document.createElement("div");
  ind.className = "nav-indicator";
  an.appendChild(ind);
  currentNav = navId;
}

/* ── PIN logic ── */
let pinValue = [1, 1, 1, 1, 1];

function updatePinDots() {
  const dots = document.querySelectorAll("#pin-dots .pin-dot");
  dots.forEach((d, i) => {
    d.classList.toggle("filled", i < pinValue.length);
  });
}

function pinPress(num) {
  if (pinValue.length >= 6) return;
  document
    .querySelectorAll(".num-btn")
    .forEach((b) => b.classList.remove("num-active"));
  pinValue.push(num);
  updatePinDots();
  if (pinValue.length === 6) {
    setTimeout(() => {
      pinValue = [];
      updatePinDots();
      goTo("page-verifier");
    }, 600);
  }
}

function pinDel() {
  if (pinValue.length > 0) {
    pinValue.pop();
    updatePinDots();
  }
}

/* ── dropdown ── */
function toggleDropdown(e, id) {
  e.stopPropagation();
  const dd = document.getElementById(id);
  const ov = document.getElementById("overlay");
  const isOpen = dd.classList.contains("open");
  document
    .querySelectorAll(".dropdown")
    .forEach((d) => d.classList.remove("open"));
  if (!isOpen) {
    dd.classList.add("open");
    ov.classList.add("open");
  } else {
    ov.classList.remove("open");
  }
}

function closeDropdown() {
  document
    .querySelectorAll(".dropdown")
    .forEach((d) => d.classList.remove("open"));
  document.getElementById("overlay").classList.remove("open");
}
