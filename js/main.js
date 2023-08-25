const subMenus = document.querySelectorAll(".sub-menu");
const navLinks = document.querySelectorAll(".nav-a");

// Function to toggle visibility of sub-menus
function toggleSubMenu(event) {
  const subMenu = event.currentTarget.querySelector(".sub-nav");
  subMenu.classList.toggle("nav-hide");
}

// Function to prevent sub-menu from closing on click inside
function preventSubMenuClose(event) {
  event.stopPropagation();
}

// Add event listeners to each sub-menu parent
subMenus.forEach((subMenu) => {
  subMenu.addEventListener("click", toggleSubMenu);
  subMenu
    .querySelector(".sub-nav")
    .addEventListener("click", preventSubMenuClose);
});

// Highlight the active menu based on content scroll
window.addEventListener("scroll", () => {
  const currentPosition = window.scrollY;
  navLinks.forEach((link) => {
    const section = document.querySelector(link.getAttribute("href"));
    if (
      section.offsetTop <= currentPosition &&
      section.offsetTop + section.offsetHeight > currentPosition
    ) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
});

// Update "active" class when a menu item is clicked
// Update "active" class when a menu item is clicked
navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    navLinks.forEach((link) => link.classList.remove("active"));
    link.classList.add("active");
    const target = document.querySelector(link.getAttribute("href"));

    // Scroll to the target element with smooth scrolling
    target.scrollIntoView({ behavior: "smooth" });
  });
});
