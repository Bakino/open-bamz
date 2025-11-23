//https://github.com/cam-inc/esr

import {pathToRegexp} from './vendor/path-to-regexp.mjs';
import { createBrowserHistory, createMemoryHistory, createHashHistory } from 'https://cdn.jsdelivr.net/npm/history@5.3.0/history.development.min.js';
import { ViewZ } from './viewz.mjs';

const constants = {
  BROWSER: 'BROWSER',
  MEMORY: 'MEMORY',
  HASH: 'HASH'
};

// Copu from mout/array/forEach
const forEach = (arr, callback, thisObj) => {
  if (arr == null) {
    return;
  }
  let i = -1,
      len = arr.length;
  while (++i < len) {
    // we iterate over sparse items since there is no way to make it
    // work properly on IE 7-8. see #64
    if ( callback.call(thisObj, arr[i], i, arr) === false ) {
      break;
    }
  }
};

export class Router {
  /**
   * @param {String} type type of history object. this should be one of 'browser', 'memory' or 'hash'.
   */
  constructor(type = constants.BROWSER) {

    this.type = type;
    /**
     * hash history object.
     * @private
     * @type {Object}
     */
    switch (type) {
    case constants.BROWSER:
      this._history = createBrowserHistory();
      break;
    case constants.MEMORY:
      this._history = createMemoryHistory();
      break;
    case constants.HASH:
      this._history = createHashHistory();
      break;
    default:
      break;
    }

    /**
     * routing definitions.
     * @private
     * @type {Array}
     */
    this._routes = [];

    /**
     * function to stop listening for the changes.
     * to stop, just execute this function.
     * @private
     * @type {Function|null}
     */
    this._unlistener = null;

    /**
     * function that will be called on ahead of every routing.
     * @type {Function|null}
     */
    this._onBefore = null;

    /**
     * function that will be called on when no route
     * @type {Function|null}
     */
    this._onNoRoute = null;

    /**
     * function that will be called only once on ahead of routing.
     * @type {Function|null}
     */
    this._onBeforeOnce = null;

    /**
     * function that will be called on behind of every routing.
     * @type {Function|null}
     */
    this._onAfter = null;

    /**
     * function that will be called only once on behind of routing.
     * @type {Function|null}
     */
    this._onAfterOnce = null;

    /**
     * function that will be called when error happen.
     * @type {Function|null}
     */
    this._onError = null;
  }

  /**
   * start listening for changes to the current location.
   * @param {Boolean} autoExec to decide whether routing is executed with the current url.
   */
  start(autoExec = true) {
    this._unlistener = this._history.listen(({location, action}) => {
      this._change(location, action);
    });

    if (autoExec) {
      this._change(this.getCurrentLocation(), this.getCurrentAction());
    }
  }

  /**
   * stop listening.
   */
  stop() {
    if (!this._unlistener) {
      return;
    }
    this._unlistener();
    this._unlistener = null;
  }

  /**
   * register a route.
   * @param {String} pattern express-like url pattern.
   * @param {Function} onEnter a function that will be executed when the route changes.
   * @param {Function} onBefore a function that will be executed before the route changes.
   * @param {Function} onAfter a function that will be executed after the route changes.
   * @return {Router}
   */
  on(pattern, onEnter, onBefore, onAfter) {
    const regexp = pathToRegexp(pattern);
    this._routes.push({
      pattern,
      regexp: regexp.regexp,
      keys: regexp.keys,
      onEnter,
      onBefore,
      onAfter
    });
    return this;
  }

  /**
   * register a function to hook just before routing.
   * this function is called on every routing.
   * @param {Function} func
   * @return {Router}
   */
  onBefore(func) {
    this._onBefore = func;
    return this;
  }

  /**
   * register a function to hook when no route
   * @param {Function} func
   * @return {Router}
   */
  onNoRoute(func) {
    this._onNoRoute = func;
    return this;
  }

  /**
   * register a function to hook just before routing.
   * this function is called before routing only once.
   * @param {Function} func
   * @return {Router}
   */
  onBeforeOnce(func) {
    this._onBeforeOnce = func;
    return this;
  }

  /**
   * register a function to hook just after routing.
   * this function is called on every routing.
   * @param {Function} func
   * @return {Router}
   */
  onAfter(func) {
    this._onAfter = func;
    return this;
  }

  /**
   * register a function to hook just after routing.
   * this function is called after routing only once.
   * @param {Function} func
   * @return {Router}
   */
  onAfterOnce(func) {
    this._onAfterOnce = func;
    return this;
  }
  
  /**
   * register a function to hook on error.
   * this function is called when error happen.
   * @param {Function} func
   * @return {Router}
   */
  onError(func) {
    this._onError = func;
    return this;
  }

  /**
   * navigate to target location.
   * @param {String|Object} path e.g.) '/foo' or { pathname, search, hash }
   * @param {Boolean} force force to navigate even if path is the same as previous one.
   */
  navigateTo(path, force = false) {
    return Promise
      .resolve()
      .then(() => {
        if (!force && this.getCurrentLocation().pathname === path) {
          console.warn('same path is passed.');
          return;
        }

        this._history.push((this.base??"")+path);
      });
  }

  /**
   * if the path is a route, navigate to the route, else process as normal link
   * @param {String} path 
   */
  autoNavigate(path, target){
    
    let route = this.getRoute(this.base+path) ;
    if(!route){ 
      if(target === "_blank"){
        window.open(path) ;
      }else{
        location.href = path ;
      }
    }else{
      if(target === "_blank"){
        window.open(this.base+path) ;
      }else{
        this.navigateTo(path); 
      }

    }
  }

  /**
   * replace current location.
   * @param {String|Object} path e.g.) '/foo' or { pathname, search, hash }
   */
  replace(path) {
    return Promise
      .resolve()
      .then(() => {
        if (this.getCurrentLocation().pathname === path) {
          console.warn('same path is passed.');
          return;
        }

        this._history.replace((this.base??"")+path);
      });
  }

  /**
   * returns current location.
   * @return {String}
   */
  getCurrentLocation() {   
    return this._history.location;
  }

  /**
   * returns current action.
   * @return {String}
   */
  getCurrentAction() {
    return this._history.action;
  }

  /**
   * hash version of `location.href`.
   * @param {String} pathname
   */
  createHref(pathname) {
    return this._history.createHref({
      pathname
    });
  }

  getRoute(path){
    let route;
    forEach(this._routes, r => {
      // eslint-disable-next-line no-extra-boolean-cast
      if (!!route) {
        return;
      }
      // eslint-disable-next-line no-extra-boolean-cast
      if (!!r.regexp.exec(path)) {
        route = r;
      }
    });
    return route;
  }

  /**
   * fire route enter event.
   * @private
   * @param {Object} location i.e.) history.location
   * @param {String} action i.e.) history.action
   */
  _change(location/*, action */) {
    let route = this.getRoute(location.pathname);
    

    if (!route) {
      Promise
      .resolve()
      .then(() => {// onBefore
        if (!this._onNoRoute) {
          return Promise.resolve();
        }
        return this._onNoRoute(location);
      }) ;
      return;
    }

    const data = this._parseLocation(location, route);

    // whether the routing was canceled and replaced.
    let isReplaced = false;
    const replace = (path) => {
      isReplaced = true;
      this.replace(path);
    };

    Promise
      .resolve()
      .then(() => {// onBeforeOnce
        if (!this._onBeforeOnce) {
          return Promise.resolve();
        }
        const onBeforeOnce = this._onBeforeOnce;
        this._onBeforeOnce = null;
        return onBeforeOnce(data);
      })
      .then(() => {// onBefore
        if (!this._onBefore) {
          return Promise.resolve();
        }
        return this._onBefore(data);
      })
      .then(() => {// route.onBefore
        if (!route.onBefore) {
          return Promise.resolve();
        }
        return route.onBefore(data, replace);
      })
      .then(() => {// route.onEnter
        if (isReplaced || !route.onEnter) {
          return Promise.resolve();
        }
        return route.onEnter(data);
      })
      .then(() => {// route.onAfter
        if (isReplaced || !route.onAfter) {
          return Promise.resolve();
        }
        return route.onAfter(data);
      })
      .then(() => {// onAfter
        if (isReplaced || !this._onAfter) {
          return Promise.resolve();
        }
        return this._onAfter(data);
      })
      .then(() => {// onAfterOnce
        if (isReplaced || !this._onAfterOnce) {
          return Promise.resolve();
        }
        const onAfterOnce = this._onAfterOnce;
        this._onAfterOnce = null;
        return onAfterOnce(data);
      })
      .catch(err => {
          if(this._onError){
            this._onError(err, route) ;
          }
        console.error("Error happen on routing", err);
      });
  }

  /**
   * parse location object.
   * @private
   * @param {Object} location
   * @param {Object} route
   * @return {Object}
   */
  _parseLocation(location, route) {
    const params = {};
    const list = route.regexp.exec(location.pathname).slice(1);
    forEach(route.keys, (v, i) => {
      params[v.name] = list[i];
    });

    const queries = {};
    forEach(location.search.slice(1).split('&'), v => {
      if (!v) {
        return;
      }
      const pair = v.split('=');
      queries[pair[0]] = pair[1];
    });

    const hash = location.hash.slice(1);

    return {
      params,
      queries,
      hash,
      pathname: location.pathname
    };
  }
}

Router.BROWSER = constants.BROWSER;
Router.MEMORY = constants.MEMORY;
Router.HASH = constants.HASH;


export function createRouter({routes, mode, container, base}){
    const router = new Router(mode??Router.BROWSER) ;
    window.routerz = router;
    if(!base && ((mode??Router.BROWSER) === Router.BROWSER)){
        //rebase the pathname if the document have <base> and base not given in options
        let baseEl = document.head.querySelector("base");
        if(baseEl){
            base = baseEl.getAttribute("href").replace(/\/$/, "") ;
        }
    }
    for(let route of routes){
        router.base = base;
        let pattern = ((base??"")+route.route).replace(/\/:(\w+)\?/g, "{/:$1}")
        router.on(pattern, async (execRoute)=>{
            console.log("exec route", execRoute) ;
            let viewName = route.name;
            if(!viewName){
                viewName = route.path.replace(/\/$/, "").substring(route.path.lastIndexOf("/")+1);
            }
            let view = new ViewZ({
                html: `${route.path}/${viewName}.html`,
                css: `${route.path}/${viewName}.css`,
                js: `${route.path}/${viewName}.js`,
                id: route.id??`${route.path}/${viewName}`,
                router: router
            });
            view.docTransformer((doc)=>{
                let allLinks = Array.prototype.slice.apply(doc.querySelectorAll("a"));
                for(let a of allLinks){
                  if(a.hasAttribute("href") && a.getAttribute("href").startsWith("/")){
                      a.setAttribute("onclick", "window.routerz.autoNavigate(this.getAttribute('href'), this.getAttribute('target')); return false;") ;
                        /*a.addEventListener("click",function() { 
                              //router.navigateTo((base??"")+a.getAttribute("href")) ;
                              router.navigateTo(a.getAttribute("href")) ;
                              return false;
                        })*/
                    }
                }
            })
            let ssr = false;
            if(container.hasAttribute("zz-ssr")){
              if(container.getAttribute("zz-ssr") === viewName){
                ssr= true;
              }
              container.removeAttribute("zz-ssr");
            }
            view.render({container, route: execRoute, ssr});
        }) ; 
    }
    return router;
}

// export const router = new Router(Router.HASH);

