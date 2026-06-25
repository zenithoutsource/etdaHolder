let currentPage = "page-home";
let currentNav = "nav-wallet";

function goTo(pageId) {
  document.getElementById(currentPage).classList.remove("active");
  document.getElementById(pageId).classList.add("active");
  currentPage = pageId;

  if (pageId === "page-success") {
    setTimeout(() => {
      document.getElementById("page-success").classList.remove("active");
      document.getElementById("page-home-after").classList.add("active");
      currentPage = "page-home-after";

      document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
        const indicator = item.querySelector(".nav-indicator");
        if (indicator) indicator.remove();
      });

      const walletNav = document.getElementById("nav-wallet");
      walletNav.classList.add("active");
      const newIndicator = document.createElement("div");
      newIndicator.className = "nav-indicator";
      walletNav.appendChild(newIndicator);
    }, 2000);
  }
}

function goBack() {
  document.getElementById(currentPage).classList.remove("active");
  document.getElementById("page-home").classList.add("active");
  currentPage = "page-home";
}

function navTo(pageId, navId) {
  document.getElementById(currentPage).classList.remove("active");
  document.getElementById(pageId).classList.add("active");
  currentPage = pageId;

  const allNavs = document.querySelectorAll(".nav-item");
  allNavs.forEach((n) => {
    n.classList.remove("active");
    const ind = n.querySelector(".nav-indicator");
    if (ind) ind.remove();
  });

  const activeNav = document.getElementById(navId);
  activeNav.classList.add("active");
  const ind = document.createElement("div");
  ind.className = "nav-indicator";
  activeNav.appendChild(ind);
  currentNav = navId;
}
