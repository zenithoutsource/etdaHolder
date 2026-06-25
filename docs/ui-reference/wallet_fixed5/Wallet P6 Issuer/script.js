function goTo(pageId) {
  closeDropdown();
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const target = document.getElementById(pageId);
  if (target) {
    target.classList.add("active");
    window.scrollTo(0, 0);
  }
}

function toggleDropdown(e, id) {
  e.stopPropagation();
  const dd = document.getElementById(id);
  const isOpen = dd.classList.contains("open");
  closeDropdown();
  if (!isOpen) dd.classList.add("open");
}

function closeDropdown() {
  document
    .querySelectorAll(".dropdown")
    .forEach((d) => d.classList.remove("open"));
}

document.addEventListener("click", closeDropdown);

document.addEventListener("DOMContentLoaded", () => {
  goTo("page-issuer");
});

function closeMedCertModal() {
  var modal = document.getElementById("medcert-used-modal");
  if (modal) {
    modal.classList.add("hidden");
  }
}
