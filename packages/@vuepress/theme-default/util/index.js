import nodePath from 'path'

export const hashRE = /#.*$/
export const extRE = /\.(md|html)$/
export const endingSlashRE = /\/$/
export const outboundRE = /^[a-z]+:/i

export function normalize (path) {
  return decodeURI(path)
    .replace(hashRE, '')
    .replace(extRE, '')
}

export function getHash (path) {
  const match = path.match(hashRE)
  if (match) {
    return match[0]
  }
}

export function isExternal (path) {
  return outboundRE.test(path)
}

export function isMailto (path) {
  return /^mailto:/.test(path)
}

export function isTel (path) {
  return /^tel:/.test(path)
}

export function ensureExt (path) {
  if (isExternal(path)) {
    return path
  }
  const hashMatch = path.match(hashRE)
  const hash = hashMatch ? hashMatch[0] : ''
  const normalized = normalize(path)

  if (endingSlashRE.test(normalized)) {
    return path
  }
  return normalized + '.html' + hash
}

export function isActive (route, path) {
  const routeHash = decodeURIComponent(route.hash)
  const linkHash = getHash(path)
  if (linkHash && routeHash !== linkHash) {
    return false
  }
  const routePath = normalize(route.path)
  const pagePath = normalize(path)
  return routePath === pagePath
}

export function resolvePage (pages, rawPath, base) {
  if (isExternal(rawPath)) {
    return {
      type: 'external',
      path: rawPath
    }
  }
  if (base) {
    rawPath = resolvePath(rawPath, base)
  }
  const path = normalize(rawPath)
  for (let i = 0; i < pages.length; i++) {
    if (normalize(pages[i].regularPath) === path) {
      return Object.assign({}, pages[i], {
        type: 'page',
        path: ensureExt(pages[i].path)
      })
    }
  }
  console.error(`[vuepress] No matching page found for sidebar item "${rawPath}"`)
  return {}
}

function resolvePath (relative, base, append) {
  const firstChar = relative.charAt(0)
  if (firstChar === '/') {
    return relative
  }

  if (firstChar === '?' || firstChar === '#') {
    return base + relative
  }

  const stack = base.split('/')

  // remove trailing segment if:
  // - not appending
  // - appending to trailing slash (last segment is empty)
  if (!append || !stack[stack.length - 1]) {
    stack.pop()
  }

  // resolve relative path
  const segments = relative.replace(/^\//, '').split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '..') {
      stack.pop()
    } else if (segment !== '.') {
      stack.push(segment)
    }
  }

  // ensure leading slash
  if (stack[0] !== '') {
    stack.unshift('')
  }

  return stack.join('/')
}

/**
 * @param { Page } page
 * @param { string } regularPath
 * @param { SiteData } site
 * @param { string } localePath
 * @returns { SidebarGroup }
 */
export function resolveSidebarItems (page, regularPath, site, localePath) {
  const { pages, themeConfig } = site

  const localeConfig = localePath && themeConfig.locales
    ? themeConfig.locales[localePath] || themeConfig
    : themeConfig

  const pageSidebarConfig = page.frontmatter.sidebar || localeConfig.sidebar || themeConfig.sidebar
  if (pageSidebarConfig === 'auto') {
    return resolveHeaders(page)
  }
  if (pageSidebarConfig === 'wiki') {
    return resolveCategoryTree(page.path, pages)
  }

  const sidebarConfig = localeConfig.sidebar || themeConfig.sidebar
  if (!sidebarConfig) {
    return []
  } else {
    const { base, config } = resolveMatchingConfig(regularPath, sidebarConfig)
    return config
      ? config.map(item => resolveItem(item, pages, base))
      : []
  }
}

/**
 * @param { Page } page
 * @returns { SidebarGroup }
 */
function resolveHeaders (page) {
  const headers = groupHeaders(page.headers || [])
  return [{
    type: 'group',
    collapsable: false,
    title: page.title,
    path: null,
    children: headers.map(h => ({
      type: 'auto',
      title: h.title,
      basePath: page.path,
      path: page.path + '#' + h.slug,
      children: h.children || []
    }))
  }]
}

function resolveCategoryTree (path, pages) {
  const mainDir = resolveMainCategory(path)
  if (mainDir == null) {
    return []
  }
  const categoryTree = {};
  const reveiwedPageKeys = [];
  pages
    .sort((a, b) => {
      return a.title > b.title ? 1 : -1;
    })
    .forEach(p => {
      if (new RegExp("^" + mainDir + ".*$").test(p.path)) {
        if (reveiwedPageKeys.indexOf(p.key) === -1) {
          reveiwedPageKeys.push(p.key);
          const dirs = resolveDirPath(p.path)
            .split("/")
            .slice(1, -1);
          let parent = categoryTree;
          dirs.forEach(d => {
            if (parent.dirs == null) {
              parent.dirs = {};
            }
            if (parent.dirs[d] == null) {
              parent.dirs[d] = {};
            }
            parent = parent.dirs[d];
          });
          if (p.path[p.path.length - 1] === "/") {
            parent.page = p;
          } else {
            if (parent.pages == null) {
              parent.pages = [];
            }
            parent.pages.push(p);
          }
        }
      }
    });
  const tree = treeLinks(categoryTree.dirs);
  return tree;
}

function treeLinks (tree) {
  const keys = Object.keys(tree)
  const links = []
  keys.forEach(key => {
    const node = {}
    if (tree[key].dirs != null) {
      node.type = 'group'
      node.collapsable = false
      if (tree[key].page) {
        node.title = tree[key].page.title || key
        node.path = tree[key].page.path
      } else {
        node.title = key
        node.path = null
      }
      node.children = treeLinks(tree[key].dirs)
    } else {
      node.type = 'page'
      if (tree[key].page) {
        node.title = tree[key].page.title || key
        node.path = tree[key].page.path
      } else {
        node.path = null
        node.title = key
      }
    }

    if (tree[key].pages != null) {
      node.type = 'group'
      if (node.children == null) { node.children = [] }
      tree[key].pages.forEach(p => {
        node.children.push({
          type: 'page',
          path: p.path,
          title: p.title
        })
      })
    }
    links.push(node)
  })
  return links
}

function resolveMainCategory (path) {
  const dirs = path.split('/')
  if (dirs.length > 2) {
    return '/' + dirs[1] + '/'
  }
  return null
}

export function resolveParentPath (path) {
  if (path[path.length - 1] === '/') {
    return nodePath.dirname(path.slice(0, -1)) + '/'
  } else {
    return nodePath.dirname(path) + '/'
  }
}

export function resolveDirPath (path) {
  if (path[path.length - 1] === '/') {
    return path
  } else {
    return nodePath.dirname(path) + '/'
  }
}

export function groupHeaders (headers) {
  // group h3s under h2
  headers = headers.map(h => Object.assign({}, h))
  let lastH2
  headers.forEach(h => {
    if (h.level === 2) {
      lastH2 = h
    } else if (lastH2) {
      (lastH2.children || (lastH2.children = [])).push(h)
    }
  })
  return headers.filter(h => h.level === 2)
}

export function resolveNavLinkItem (linkItem) {
  return Object.assign(linkItem, {
    type: linkItem.items && linkItem.items.length ? 'links' : 'link'
  })
}

/**
 * @param { Route } route
 * @param { Array<string|string[]> | Array<SidebarGroup> | [link: string]: SidebarConfig } config
 * @returns { base: string, config: SidebarConfig }
 */
export function resolveMatchingConfig (regularPath, config) {
  if (Array.isArray(config)) {
    return {
      base: '/',
      config: config
    }
  }
  for (const base in config) {
    if (ensureEndingSlash(regularPath).indexOf(encodeURI(base)) === 0) {
      return {
        base,
        config: config[base]
      }
    }
  }
  return {}
}

function ensureEndingSlash (path) {
  return /(\.html|\/)$/.test(path)
    ? path
    : path + '/'
}

function resolveItem (item, pages, base, groupDepth = 1) {
  if (typeof item === 'string') {
    return resolvePage(pages, item, base)
  } else if (Array.isArray(item)) {
    return Object.assign(resolvePage(pages, item[0], base), {
      title: item[1]
    })
  } else {
    const children = item.children || []
    if (children.length === 0 && item.path) {
      return Object.assign(resolvePage(pages, item.path, base), {
        title: item.title
      })
    }
    return {
      type: 'group',
      path: item.path,
      title: item.title,
      sidebarDepth: item.sidebarDepth,
      children: children.map(child => resolveItem(child, pages, base, groupDepth + 1)),
      collapsable: item.collapsable !== false
    }
  }
}
