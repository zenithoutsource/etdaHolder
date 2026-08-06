let currentPage = "page-home";
let currentNav = "nav-wallet";
let faceIdFlow = "consent";

function startQrScan() {
  setTimeout(() => {
    goTo("page-verified");
  }, 2000);
}

function startFaceScan() {
  setTimeout(() => {
    if (faceIdFlow === "verifier") {
      goTo("page-vsuccess");
    } else {
      goTo("page-success");
    }
  }, 2000);
}

function startScanFlow() {
  navTo("page-scan", "nav-scan");
  setTimeout(() => {
    goTo("page-verified");
  }, 2000);
}

function goTo(pageId) {
  const current = document.getElementById(currentPage);
  const next = document.getElementById(pageId);

  if (current) {
    current.classList.remove("active");
  }

  next.classList.add("active", "slide-in");

  next.addEventListener(
    "animationend",
    () => {
      next.classList.remove("slide-in");
    },
    { once: true },
  );

  currentPage = pageId;

  if (pageId === "page-faceid") {
    startFaceScan();
  }
}

function goBack() {
  const current = document.getElementById(currentPage);

  current.classList.add("slide-out");

  current.addEventListener(
    "animationend",
    () => {
      current.classList.remove("active", "slide-out");
      currentPage = "page-home";
      document.getElementById("page-home").classList.add("active");
      setActiveNav("nav-wallet");
    },
    { once: true },
  );
}

function navTo(pageId, navId) {
  document.getElementById(currentPage).classList.remove("active");
  document.getElementById(pageId).classList.add("active");
  currentPage = pageId;
  setActiveNav(navId);
}

function setActiveNav(navId) {
  const allNavs = document.querySelectorAll(".nav-item");

  allNavs.forEach((n) => {
    n.classList.remove("active");
    const indicator = n.querySelector(".nav-indicator");
    if (indicator) {
      indicator.remove();
    }
  });

  const activeNav = document.getElementById(navId);
  activeNav.classList.add("active");

  const indicator = document.createElement("div");
  indicator.className = "nav-indicator";
  activeNav.appendChild(indicator);

  currentNav = navId;
}
