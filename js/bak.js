// js/opencon.js
const body = document.querySelector('body')
// Convert Markdown content to HTML
function convertMarkdownToHTML(markdown) {
  if (typeof marked !== 'undefined') {
    return marked.parse(markdown)
  } else {
    return markdown
  }
  // return markdown;
}

// get src content from "<opencodelaw src="specs/opencon.yaml"></opencodelaw>" tag
const opencodelawtag = document.querySelector('opencodelaw')
const src = opencodelawtag.getAttribute('spec-url')

fetch(src)
  .then((response) => response.text())
  .then((yamlData) => {
    const jsonData = jsyaml.load(yamlData)

    info = jsonData.info

    // Create header
    const nav = document.createElement('nav')
    nav.classList.add('nav')
    const navLink = document.createElement('a')
    navLink.classList.add('nav__link')
    navLink.href = 'index.html'
    const titleWrap = document.createElement('div')
    titleWrap.classList.add('title-wrap')
    const logo = document.createElement('img')
    logo.classList.add('nav__logo')
    logo.src = info.logo.url
    logo.alt = info.logo.alt
    const title = document.createElement('h1')
    title.textContent = info.title
    const toggleContainer = document.createElement('div')
    toggleContainer.classList.add('toggle-container')
    toggleContainer.setAttribute('id', 'toggle-container')
    const labelSpan = document.createElement('span')
    labelSpan.classList.add('toggle-label')
    labelSpan.innerText = 'Theme:'
    toggleContainer.appendChild(labelSpan)
    titleWrap.appendChild(logo)
    titleWrap.appendChild(title)
    navLink.appendChild(titleWrap)
    nav.appendChild(navLink)
    nav.appendChild(toggleContainer)
    body.appendChild(nav)

    // create main
    const main = document.createElement('main')
    main.classList.add('main')
    body.appendChild(main)
    // create vertical nav
    const verticalNav = document.createElement('div')
    verticalNav.classList.add('vertical-nav')
    const navContent = document.createElement('div')
    navContent.classList.add('nav-content')
    const navContentImg = document.createElement('img')
    navContentImg.src = 'assets/img/nav-content.png'
    navContentImg.alt = 'content-img'
    const navContentTitle = document.createElement('h2')
    navContentTitle.textContent = 'Contents'
    navContent.appendChild(navContentImg)
    navContent.appendChild(navContentTitle)
    verticalNav.appendChild(navContent)
    const navUl = document.createElement('ul')
    navUl.classList.add('nav-ul')
    verticalNav.appendChild(navUl)
    main.appendChild(verticalNav)

    // create preamble heading
    const navLiPreamble = document.createElement('li')
    navLiPreamble.classList.add('nav-list')
    navLiPreamble.classList.add('heading')
    const navLinkPreamble = document.createElement('a')
    navLinkPreamble.classList.add('nav-a')
    navLinkPreamble.href = `#preamble`
    navLinkPreamble.textContent = `Preamble`
    navLiPreamble.appendChild(navLinkPreamble)
    navUl.appendChild(navLiPreamble)

    // create artcle heading
    const navLiMain = document.createElement('li')
    navLiMain.classList.add('nav-list')
    navLiMain.classList.add('heading')
    const navLinkMain = document.createElement('a')
    navLinkMain.classList.add('nav-a')
    navLinkMain.href = `#articles`
    navLinkMain.textContent = `Articles`
    navLiMain.appendChild(navLinkMain)
    navUl.appendChild(navLiMain)

    articles = jsonData.articles

    articles.forEach((article, index) => {
      const navLi = document.createElement('li')
      navLi.classList.add('nav-list')
      // navLi.classList.add("heading");
     

      const navLink = document.createElement('a')
      navLink.classList.add('nav-a')
      navArticleId = navLink.href = `#article${index + 1}`
      navLink.textContent = article.title
      navLi.appendChild(navLink)
      navUl.appendChild(navLi)
      sections = article.sections
      if (sections != undefined) {
        navLi.classList.add('sub-menu')
        // navLi.classList.remove("heading");

        const navSectionUl = document.createElement('ul')
        navSectionUl.classList.add('nav-ul')
        navSectionUl.classList.add('nav-section')
        navSectionUl.classList.add('sub-nav')
        navSectionUl.classList.add('nav-hide')
        navLi.appendChild(navSectionUl)

        //dropdown icon
        const downArrow = document.createElement("span");
        downArrow.classList.add("down-arrow", "arrow-rotate"); // Add both classes
        downArrow.textContent = "▼"; // Unicode character for down arrow
        navLink.appendChild(downArrow); // Append the arrow to the link

        const navSectionLi = document.createElement('li')
        navSectionLi.classList.add('nav-list')
        const navSectionLink = document.createElement('a')
        navSectionLink.classList.add('nav-a')
        navSectionLink.classList.add('heading')
        sections.forEach((section, index) => {
          const navSectionSubLi = document.createElement('li')
          navSectionSubLi.classList.add('nav-list')
          const navSectionSubLink = document.createElement('a')
          navSectionSubLink.classList.add('nav-a')
          navSectionSubLink.href = `${navArticleId}-section${index + 1}`
          navSectionSubLink.textContent = `${index + 1}. ${section.title}`
          navSectionSubLi.appendChild(navSectionSubLink)
          navSectionUl.appendChild(navSectionSubLi)
        })
      }
    })
    preamble = jsonData.preamble

    // Create the toggle theme switch
    const themeToggle = document.createElement('label')
    themeToggle.classList.add('toggle-switch')
    themeToggle.innerHTML = `
            <input type="checkbox" id="theme-toggle">
            <span class="slider"></span>
        `


    // Append the toggle switch to the toggle container
    toggleContainer.appendChild(themeToggle)
    themeToggle.querySelector('input').addEventListener('change', toggleTheme)
    // Function to toggle between dark and light themes
    const darkBackgroundColor = "#333333"
    const lightBackgroundColor = "#f5f5f5"
    const darkTextColor = "#f2f2f2"
    const lightTextColor = "#333"
    function toggleTheme() {
      const slider = themeToggle.querySelector('.slider')
      const nav = document.querySelector('.nav')
      const vertical_nav = document.querySelector('main .vertical-nav')
      const container_main = document.querySelector('main .container-main')
      const articleDesc = document.querySelectorAll("main .container-main .container-main__content .paragraph")
      const sideBarLinks = document.querySelectorAll("main .vertical-nav .nav-ul li.nav-list a")
      const h1 = document.querySelectorAll("h1")
      const h2 = document.querySelectorAll("h2")
      const h3 = document.querySelectorAll("h3")
      const themeText = document.querySelector(".toggle-label")


      if (themeToggle.querySelector('input').checked) {
        slider.style.backgroundColor = '#533566'
        nav.style.backgroundColor = `${darkBackgroundColor}`
        vertical_nav.style.backgroundColor = `${darkBackgroundColor}`
        container_main.style.backgroundColor = `${darkBackgroundColor}`
        body.style.backgroundColor = `${darkBackgroundColor}`
        articleDesc.forEach((e) => e.style.color = `#cecdcd`)
        sideBarLinks.forEach((e) => e.style.color = `${darkTextColor}`)
        h1.forEach((e) => e.style.color = `${darkTextColor}`)
        h2.forEach((e) => e.style.color = `${darkTextColor}`)
        h3.forEach((e) => e.style.color = `${darkTextColor}`)
        themeText.style.color = `${darkTextColor}`
        localStorage.setItem('theme', 'dark')
      } else {
        slider.style.backgroundColor = 'yellow'
        nav.style.backgroundColor = '#f5f5f5'
        vertical_nav.style.backgroundColor = `${lightBackgroundColor}`
        container_main.style.backgroundColor = `${lightBackgroundColor}`
        body.style.backgroundColor = `${lightBackgroundColor}`
        articleDesc.forEach((e) => e.style.color = `${lightTextColor}`)
        h1.forEach((e) => e.style.color = `${lightTextColor}`)
        h2.forEach((e) => e.style.color = `${lightTextColor}`)
        h3.forEach((e) => e.style.color = `${lightTextColor}`)
        sideBarLinks.forEach((e) => e.style.color = `${lightTextColor}`)
        themeText.style.color = `${lightTextColor}`
        localStorage.setItem('theme', 'light')
      }
    }

    // create  <div class="container-main">
    const containerMain = document.createElement('div')
    containerMain.classList.add('container-main')
    main.appendChild(containerMain)
    // create container-main__content
    const containerMainContent = document.createElement('div')
    containerMainContent.classList.add('container-main__content')
    containerMain.appendChild(containerMainContent)
    const containerMainContentH1 = document.createElement('h1')
    containerMainContentH1.id = `preamble`
    containerMainContentH1.classList.add('heading-primary')
    containerMainContentH1.textContent = preamble.title
    containerMainContent.appendChild(containerMainContentH1)
    const containerMainContentP1 = document.createElement('p')
    containerMainContentP1.classList.add('paragraph')
    containerMainContentP1.innerHTML = convertMarkdownToHTML(preamble.content)
    containerMainContent.appendChild(containerMainContentP1)
    const containerMainContentP2 = document.createElement('p')
    containerMainContentP2.classList.add('paragraph')
    containerMainContentP2.classList.add('adoption-d')
    containerMainContentP2.textContent = 'Adopted on : ' + preamble.adopted
    containerMainContent.appendChild(containerMainContentP2)

    // create article container with heading
    const containerMainContentArticle = document.createElement('div')
    containerMainContentArticle.classList.add('container-main__content')
    containerMain.appendChild(containerMainContentArticle)
    const containerMainContentArticleH1 = document.createElement('h1')
    containerMainContentArticleH1.id = `articles`
    containerMainContentArticleH1.classList.add('heading-primary')
    containerMainContentArticleH1.textContent = 'Articles'
    containerMainContentArticle.appendChild(containerMainContentArticleH1)

    // append all articles
    articles.forEach((article, index) => {
      const articleContainer = document.createElement('div')
      articleContainer.classList.add('article-container')
      containerMainContentArticle.appendChild(articleContainer)
      const articleContainerH2 = document.createElement('h2')
      const articleId = (articleContainerH2.id = `article${index + 1}`)
      articleContainerH2.classList.add('heading-secondary')
      articleContainerH2.textContent = `${index + 1}. ${article.title}`
      articleContainer.appendChild(articleContainerH2)
      // add copy link button
      const copyLink = document.createElement('button')
      copyLink.classList.add('copy-link')
      copyLink.textContent = '🔗'
      copyLink.addEventListener('click', () => {
        // initialize remaining copy link buttons to 🔗
        const copyLinks = document.querySelectorAll('.copy-link')
        copyLinks.forEach((copyLink) => {
          copyLink.textContent = '🔗'
        })
        const url = window.location.href
        navigator.clipboard.writeText(`${url}#${articleId}`)
        copyLink.textContent = '✅'
      })
      articleContainerH2.appendChild(copyLink)
      const articleContainerP = document.createElement('p')
      articleContainerP.classList.add('paragraph')
      articleContainerP.innerHTML = convertMarkdownToHTML(article.content)
      articleContainer.appendChild(articleContainerP)
      sections = article.sections
      if (sections != undefined) {
        const sectionContainer = document.createElement('div')
        sectionContainer.classList.add('section-container')
        articleContainer.appendChild(sectionContainer)
        sections.forEach((section, index) => {
          const sectionContainerH3 = document.createElement('h3')
          sectionContainerH3.id = `${articleId}-section${index + 1}`
          sectionContainerH3.classList.add('heading-secondary')
          sectionContainerH3.textContent = `${index + 1}. ${section.title}`
          sectionContainer.appendChild(sectionContainerH3)
          // add copy link button
          const copyLink = document.createElement('button')
          copyLink.classList.add('copy-link')
          copyLink.textContent = '🔗'
          copyLink.addEventListener('click', () => {
            const copyLinks = document.querySelectorAll('.copy-link')
            copyLinks.forEach((copyLink) => {
              copyLink.textContent = '🔗'
            })
            const url = window.location.href
            navigator.clipboard.writeText(
              `${url}#${articleId}-section${index + 1}`
            )
            copyLink.textContent = '✅'
          })
          sectionContainerH3.appendChild(copyLink)
          const sectionContainerP = document.createElement('p')
          sectionContainerP.classList.add('paragraph')
          sectionContainerP.innerHTML = convertMarkdownToHTML(section.content)
          sectionContainer.appendChild(sectionContainerP)
        })
      }
    })
// Ammendment data (replace with your actual jsonData.ammendments)
const ammendmentData = jsonData.ammendments;
console.log(ammendmentData);

// Create amendments table
const ammendment_container = document.createElement("div");
ammendment_container.classList.add('container-ammendment');

const table = document.createElement('table');
table.classList.add('responsive-table');

const caption = document.createElement('caption');
caption.textContent = 'Ammendments';
table.appendChild(caption);

const thead = document.createElement('thead');
const headRow = document.createElement('tr');

const headers = ['Date', 'Act', 'Description', 'Author', 'Archive'];
headers.forEach(header => {
  const th = document.createElement('th');
  th.textContent = header;
  th.scope = header === 'Act' ? 'col' : 'row';
  headRow.appendChild(th);
});

thead.appendChild(headRow);
table.appendChild(thead);

const tbody = document.createElement('tbody');

// Loop through ammendmentData and create table rows
ammendmentData.forEach(ammendment => {
  const row = document.createElement('tr');

  // Extract data from each amendment object
  const title = ammendment.title;
  const date = ammendment.date;
  const description = ammendment.content;
  const author = ammendment.author;
  const archive = ammendment.archive;

  // Create table cells and populate with data
  const cells = [date, title, description, author, archive];
  cells.forEach(cellData => {
    const cell = document.createElement('td');
    cell.textContent = cellData;
    row.appendChild(cell);
  });

  tbody.appendChild(row);
});

table.appendChild(tbody);
ammendment_container.appendChild(table);

// Append the container to your desired location (replace with your logic)
containerMain.appendChild(ammendment_container);

console.log("Ammendments table created and appended");
  

    // create back to top button
    const backToTop = document.createElement("button")
    backToTop.classList.add("back-to-top")
    backToTop.id = "backToTop"
    backToTop.title = "Go to top"
    backToTop.textContent = "↑"
    backToTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    )
    body.appendChild(backToTop)
    // Check the user's theme preference in localStorage
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'dark') {
      const themeToggle = document.querySelector(".toggle-switch")
      themeToggle.querySelector('input').checked = true
      toggleTheme()
    }
  })
  .then(() => {
    // ui script

    const subMenus = document.querySelectorAll('.sub-menu')
    const navLinks = document.querySelectorAll('.nav-a')

    // Function to toggle visibility of sub-menus
    // Function to toggle visibility of sub-menus and rotate arrow
function toggleSubMenu(event) {
  const subMenu = event.currentTarget.querySelector('.sub-nav')
      subMenu.classList.toggle('nav-hide')
}

    // Function to prevent sub-menu from closing on click inside
    function preventSubMenuClose(event) {
      event.stopPropagation()
    }

    // Add event listeners to each sub-menu parent
    subMenus.forEach((subMenu) => {
      subMenu.addEventListener('click', toggleSubMenu)
      subMenu
        .querySelector('.nav-section')
        .addEventListener('click', preventSubMenuClose)
    })

    // Highlight the active menu based on content scroll
    function updateActiveMenu() {
      const currentPosition = window.scrollY
      navLinks.forEach((link) => {
        const section = document.querySelector(link.getAttribute('href'))
        if (
          section.offsetTop <= currentPosition + 100 && // Adding an offset to improve accuracy
          section.offsetTop + section.offsetHeight > currentPosition + 100
        ) {
          link.classList.add('active')
        } else {
          link.classList.remove('active')
        }
      })
    }

    // Update "active" class when a menu item is clicked
    navLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        navLinks.forEach((link) => link.classList.remove('active'))
        link.classList.add('active')
        const target = document.querySelector(link.getAttribute('href'))

        // Scroll to the target element with smooth scrolling
        target.scrollIntoView({ behavior: 'smooth' })

        // Close open sub-menus when a menu item is clicked
        subMenus.forEach((subMenu) => {
          const subNav = subMenu.querySelector('.nav-section')
          if (!subNav.contains(target)) {
            subMenu.querySelector('.sub-nav').classList.add('nav-hide')
          }
        })
      })
    })

    // Update active menu on scroll
    window.addEventListener('scroll', updateActiveMenu)
    updateActiveMenu() // Initial update on page load




  })
  .catch((error) => {
    console.error("Error loading YAML data:", error);
  });
  window.addEventListener("scroll", scrollFunction);

  function scrollFunction() {
    const topButton = document.getElementById("backToTop");
  
    if (
      document.body.scrollTop > 20 ||
      document.documentElement.scrollTop > 20
    ) {
      topButton.style.display = "block";
    } else {
      topButton.style.display = "none";
    }
  }
  
  // When the button is clicked, scroll to the top of the document
  function topFunction() {
    document.body.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  
  // Add this event listener to handle button click
  const topButton = document.getElementById("backToTop");