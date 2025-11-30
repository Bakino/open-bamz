/*global adminMenu*/

/* This file in injected to app HTML to display the Open BamZ admin menu on the top */

async function isAdmin(){
    let result = await fetch("/graphql/_openbamz", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: "Bearer "+jwt
        },
        body: JSON.stringify({ query: `query getapp {
  app_by_code(code: "${window.BAMZ_APP}") {
    code
  }
}`     }),
    }) ;
    let response = await result.json();
    return response?.data?.app_by_code?.code === window.BAMZ_APP ;
}

async function loadMenu(){
    if(await  isAdmin()){
        // Inject CSS styles and create the banner
        injectStyles();
        createBanner(adminMenu);
    }
}

// Function to inject CSS styles into the document
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .bamz-menu-container {
            position: fixed;
            width: 100%;
            top: -33px;
            left: 0px;
            transition: top 0.3s ease-in-out;
            z-index: 1000;
            line-height: 24px;
            font-size: 16px;
            font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "Liberation Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"
        }

        .bamz-menu {
            background-color: #333;
            color: white;
            height: 30px;
            display: flex;
            align-items: center;
            padding: 0 20px 0 35px;
        }

        .bamz-pull-tab {
            position: absolute;
            bottom: -30px;
            left: 0;
            background-color: #333;
            color: white;
            width: 30px;
            height: 30px;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            border-radius: 0 0 10px 0;
            opacity: 0.3;
            transition: opacity 0.2s ease;
        }

        .bamz-pull-tab:hover, 
        .bamz-menu-container.bamz-open .bamz-pull-tab {
            opacity: 1;
        }

        .bamz-arrow {
            border: solid white;
            border-width: 0 3px 3px 0;
            display: inline-block;
            padding: 3px;
            transform: rotate(45deg);
            transition: transform 0.3s ease;
        }

        .bamz-menu-container.bamz-open {
            top: 0;
            left: 0;
        }

        .bamz-menu-container.bamz-open .bamz-arrow {
            transform: rotate(-135deg);
        }

        .bamz-menu-items {
            display: flex;
            gap: 5px;
            align-items: center;
        }

        .bamz-menu-item {
            position: relative;
            height: 30px;
        }

        .bamz-menu-item a {
            color: white;
            text-decoration: none;
            display: block;
            padding: 5px 10px 0 10px;
        }

        .bamz-submenu {
            position: absolute;
            top: 30px;
            left: 0;
            background-color: #333333;
            min-width: 200px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            border-radius: 0 0 5px 5px;
        }

        .bamz-menu-item:hover .bamz-submenu {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .bamz-submenu a {
            padding: 12px 20px;
            white-space: nowrap;
        }

        .bamz-submenu a:hover {
            background-color: #555;
        }

        /*.bamz-menu-item > a:after {
            content: '▼';
            opacity: 0.5;
            font-size: 6px;
            margin-left: 5px;
            transition: all 0.3s ease;
        }*/

        .bamz-menu-item:hover > a:after {
            opacity: 1;
        }

        .bamz-menu-item svg {
            max-width: 20px;
            max-height: 20px;
        }
    `;
    document.head.appendChild(style);
}

function renderLink(link){
   return link.replaceAll(":appName", window.BAMZ_APP);
}

// Function to create the banner
function createBanner(menuData) {
    const container = document.createElement('div');
    container.className = "bamz-menu-container";
    
    const menuContainer = document.createElement('div');
    menuContainer.className = "bamz-menu";
    const menuItemsContainer = document.createElement('div');
    menuItemsContainer.className = "bamz-menu-items";

    container.appendChild(menuContainer);
    menuContainer.appendChild(menuItemsContainer);

    menuData.forEach(menu => {
        // Create menu item
        const menuItem = document.createElement('div');
        menuItem.className = 'bamz-menu-item';

        // Create link for the menu item
        const link = document.createElement('a');
        link.href = renderLink(menu.link??'#'); // You might want to set this to '#' or the actual link
        link.innerHTML = menu.name;
        menuItem.appendChild(link);

        if(menu.entries){
            // Create submenu
            const submenu = document.createElement('div');
            submenu.className = 'bamz-submenu';
    
            // Add submenu entries
            menu.entries.forEach(entry => {
                const entryLink = document.createElement('a');
                entryLink.href = renderLink(entry.link);
                entryLink.textContent = entry.name;
                submenu.appendChild(entryLink);
            });
    
            menuItem.appendChild(submenu);
        }
        menuItemsContainer.appendChild(menuItem);
    });

    

    const pullTab = document.createElement('div');
    pullTab.className = "bamz-pull-tab";
    pullTab.innerHTML = `<span class="bamz-arrow"></span>` ;

    document.addEventListener('click', (ev) => {
        if(ev.target === pullTab || ev.target.parentElement === pullTab){
            container.classList.toggle('bamz-open');
        }
    }, true);

    container.appendChild(pullTab) ;

    document.body.appendChild(container) ;
}

loadMenu();