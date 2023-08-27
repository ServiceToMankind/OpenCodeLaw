// js/opencon.js
const body = document.querySelector("body");
// Convert Markdown content to HTML
function convertMarkdownToHTML(markdown) {
  if (typeof marked !== "undefined") {
    return marked.parse(markdown);
  } else {
    return markdown;
  }
  // return markdown;
}

fetch("specs/opencon.yaml")
  .then((response) => response.text())
  .then((yamlData) => {
    const jsonData = jsyaml.load(yamlData);

    info = jsonData.info;

    // Create header
    const nav = document.createElement("nav");
    nav.classList.add("nav");
    const navLink = document.createElement("a");
    navLink.classList.add("nav__link");
    navLink.href = "index.html";
    const titleWrap = document.createElement("div");
    titleWrap.classList.add("title-wrap");
    const logo = document.createElement("img");
    logo.classList.add("nav__logo");
    logo.src = info.logo.url;
    logo.alt = info.logo.alt;
    const title = document.createElement("h1");
    title.textContent = info.title;
    titleWrap.appendChild(logo);
    titleWrap.appendChild(title);
    navLink.appendChild(titleWrap);
    nav.appendChild(navLink);
    body.appendChild(nav);

    // create main
    const main = document.createElement("main");
    main.classList.add("main");
    body.appendChild(main);
    // create vertical nav
    const verticalNav = document.createElement("div");
    verticalNav.classList.add("vertical-nav");
    const navContent = document.createElement("div");
    navContent.classList.add("nav-content");
    const navContentImg = document.createElement("img");
    navContentImg.src = "assets/img/nav-content.png";
    navContentImg.alt = "content-img";
    const navContentTitle = document.createElement("h2");
    navContentTitle.textContent = "Contents";
    navContent.appendChild(navContentImg);
    navContent.appendChild(navContentTitle);
    verticalNav.appendChild(navContent);
    const navUl = document.createElement("ul");
    navUl.classList.add("nav-ul");
    verticalNav.appendChild(navUl);
    main.appendChild(verticalNav);

    // create preamble heading
    const navLiPreamble = document.createElement("li");
    navLiPreamble.classList.add("nav-list");
    navLiPreamble.classList.add("heading");
    const navLinkPreamble = document.createElement("a");
    navLinkPreamble.classList.add("nav-a");
    navLinkPreamble.href = `#preamble`;
    navLinkPreamble.textContent = `Preamble`;
    navLiPreamble.appendChild(navLinkPreamble);
    navUl.appendChild(navLiPreamble);

    // create artcle heading
    const navLiMain = document.createElement("li");
    navLiMain.classList.add("nav-list");
    navLiMain.classList.add("heading");
    const navLinkMain = document.createElement("a");
    navLinkMain.classList.add("nav-a");
    navLinkMain.href = `#articles`;
    navLinkMain.textContent = `Articles`;
    navLiMain.appendChild(navLinkMain);
    navUl.appendChild(navLiMain);

    articles = jsonData.articles;

    articles.forEach((article, index) => {
      const navLi = document.createElement("li");
      navLi.classList.add("nav-list");
      // navLi.classList.add("heading");
      const navLink = document.createElement("a");
      navLink.classList.add("nav-a");
      navLink.href = `#article${index + 1}`;
      navLink.textContent = article.title;
      navLi.appendChild(navLink);
      navUl.appendChild(navLi);
      sections = article.sections;
      if (sections != undefined) {
        navLi.classList.add("sub-menu");
        // navLi.classList.remove("heading");
        const navSectionUl = document.createElement("ul");
        navSectionUl.classList.add("nav-ul");
        navSectionUl.classList.add("nav-section");
        navSectionUl.classList.add("sub-nav");
        navSectionUl.classList.add("nav-hide");
        navLi.appendChild(navSectionUl);
        const navSectionLi = document.createElement("li");
        navSectionLi.classList.add("nav-list");
        const navSectionLink = document.createElement("a");
        navSectionLink.classList.add("nav-a");
        navSectionLink.classList.add("heading");
        sections.forEach((section, index) => {
          const navSectionSubLi = document.createElement("li");
          navSectionSubLi.classList.add("nav-list");
          const navSectionSubLink = document.createElement("a");
          navSectionSubLink.classList.add("nav-a");
          navSectionSubLink.href = `#article${article.id}-section${index + 1}`;
          navSectionSubLink.textContent = `${index + 1}. ${section.title}`;
          navSectionSubLi.appendChild(navSectionSubLink);
          navSectionUl.appendChild(navSectionSubLi);
        });
      }
    });
    preamble = jsonData.preamble;
    // create  <div class="container-main">
    const containerMain = document.createElement("div");
    containerMain.classList.add("container-main");
    main.appendChild(containerMain);
    // create container-main__content
    const containerMainContent = document.createElement("div");
    containerMainContent.classList.add("container-main__content");
    containerMain.appendChild(containerMainContent);
    const containerMainContentH1 = document.createElement("h1");
    containerMainContentH1.id = `preamble`;
    containerMainContentH1.classList.add("heading-primary");
    containerMainContentH1.textContent = preamble.title;
    containerMainContent.appendChild(containerMainContentH1);
    const containerMainContentP1 = document.createElement("p");
    containerMainContentP1.classList.add("paragraph");
    containerMainContentP1.innerHTML = convertMarkdownToHTML(preamble.content);
    containerMainContent.appendChild(containerMainContentP1);
    const containerMainContentP2 = document.createElement("p");
    containerMainContentP2.classList.add("paragraph");
    containerMainContentP2.classList.add("adoption-d");
    containerMainContentP2.textContent = "Adopted on : " + preamble.adopted;
    containerMainContent.appendChild(containerMainContentP2);

    // create article container with heading
    const containerMainContentArticle = document.createElement("div");
    containerMainContentArticle.classList.add("container-main__content");
    containerMain.appendChild(containerMainContentArticle);
    const containerMainContentArticleH1 = document.createElement("h1");
    containerMainContentArticleH1.id = `articles`;
    containerMainContentArticleH1.classList.add("heading-primary");
    containerMainContentArticleH1.textContent = "Articles";
    containerMainContentArticle.appendChild(containerMainContentArticleH1);

    // append all articles
    articles.forEach((article, index) => {
      const articleContainer = document.createElement("div");
      articleContainer.classList.add("article-container");
      containerMainContentArticle.appendChild(articleContainer);
      const articleContainerH2 = document.createElement("h2");
      articleContainerH2.id = `article${index + 1}`;
      articleContainerH2.classList.add("heading-secondary");
      articleContainerH2.textContent = `${index + 1}. ${article.title}`;
      articleContainer.appendChild(articleContainerH2);
      const articleContainerP = document.createElement("p");
      articleContainerP.classList.add("paragraph");
      articleContainerP.innerHTML = convertMarkdownToHTML(article.content);
      articleContainer.appendChild(articleContainerP);
      sections = article.sections;
      if (sections != undefined) {
        const sectionContainer = document.createElement("div");
        sectionContainer.classList.add("section-container");
        articleContainer.appendChild(sectionContainer);
        sections.forEach((section, index) => {
          const sectionContainerH3 = document.createElement("h3");
          sectionContainerH3.id = `article${article.id}-section${index + 1}`;
          sectionContainerH3.classList.add("heading-secondary");
          sectionContainerH3.textContent = `${index + 1}. ${section.title}`;
          sectionContainer.appendChild(sectionContainerH3);
          const sectionContainerP = document.createElement("p");
          sectionContainerP.classList.add("paragraph");
          sectionContainerP.innerHTML = convertMarkdownToHTML(section.content);
          sectionContainer.appendChild(sectionContainerP);
        });
      }
    });
  })
  .then(() => {
    // ui script

    const subMenus = document.querySelectorAll(".sub-menu");
    const navLinks = document.querySelectorAll(".nav-a");

    console.log(subMenus);

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
        .querySelector(".nav-section")
        .addEventListener("click", preventSubMenuClose);
    });

    // Highlight the active menu based on content scroll
    function updateActiveMenu() {
      const currentPosition = window.scrollY;
      navLinks.forEach((link) => {
        const section = document.querySelector(link.getAttribute("href"));
        if (
          section.offsetTop <= currentPosition + 100 && // Adding an offset to improve accuracy
          section.offsetTop + section.offsetHeight > currentPosition + 100
        ) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });
    }

    // Update "active" class when a menu item is clicked
    navLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        navLinks.forEach((link) => link.classList.remove("active"));
        link.classList.add("active");
        const target = document.querySelector(link.getAttribute("href"));

        // Scroll to the target element with smooth scrolling
        target.scrollIntoView({ behavior: "smooth" });

        // Close open sub-menus when a menu item is clicked
        subMenus.forEach((subMenu) => {
          const subNav = subMenu.querySelector(".nav-section");
          if (!subNav.contains(target)) {
            subMenu.querySelector(".sub-nav").classList.add("nav-hide");
          }
        });
      });
    });

    // Update active menu on scroll
    window.addEventListener("scroll", updateActiveMenu);
    updateActiveMenu(); // Initial update on page load
  })
  .catch((error) => {
    console.error("Error loading YAML data:", error);
  });
