// js/opencon.js
const openconContent = document.getElementById("opencon-content");
const sideNav = document.getElementById("side-nav");

fetch("specs/opencon.yaml")
  .then((response) => response.text())
  .then((yamlData) => {
    const jsonData = jsyaml.load(yamlData);

    articles = jsonData.articles;

    // Generate side navigation
    articles.forEach((article, index) => {
      const sideNavListItem = document.createElement("li");
      sideNavListItem.classList.add("nav-item");
      sideNav.appendChild(sideNavListItem);
      const sideNavItem = document.createElement("a");
      sideNavItem.classList.add("nav-link");
      sideNavItem.href = `#article-${index + 1}`;
      sideNavItem.textContent = article.title;
      if (index === 0) {
        sideNavItem.classList.add("active");
      }
      sideNavListItem.appendChild(sideNavItem);
      sections = article.sections;
      if (sections != undefined) {
        sideNavItem.classList.add("dropdown-toggle");
        sideNavItem.setAttribute("data-bs-toggle", "dropdown");
        sideNavItem.setAttribute("role", "button");
        sideNavItem.setAttribute("aria-expanded", "false");
        sections.forEach((sections, index) => {
          const sideNavSubUl = document.createElement("ul");
          sideNavSubUl.classList.add("dropdown-menu");
          const sideNavSubLi = document.createElement("li");
          const sideNavSubA = document.createElement("a");
          sideNavSubA.classList.add("dropdown-item");
          sideNavSubA.href = `#section-${index + 1}`;
          sideNavSubA.textContent = sections.title;
          sideNavSubLi.appendChild(sideNavSubA);
          sideNavSubUl.appendChild(sideNavSubLi);
          sideNavItem.appendChild(sideNavSubUl);
        });
      }
    });
  })
  .catch((error) => {
    console.error("Error loading YAML data:", error);
  });
