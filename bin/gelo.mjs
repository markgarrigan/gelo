#!/usr/bin/env node

import cmd from 'commander'
import fs from 'fs'
import del from 'del'
import sass from 'sass'
import ejs from 'ejs'
import webpack from 'webpack'
import pretty from 'pretty'
import chokidar from 'chokidar'
import { fork, exec } from 'child_process'
import util from 'util';

const execAsync = util.promisify(exec)
const packAsync = util.promisify(webpack)
const { program } = cmd

const opts = new function () {
  this.sep = '/'
  this.partial = '_'
  this.ejs = '<%'
  this.event = 'change'
  this.target = ['web', 'es6']
  this.ext = {
    html: '.html',
    js: '.js',
    css: '.css',
    scss: '.scss'
  }
  this.paths = {
    root: 'src',
    dest: 'dist',
    files: `static${this.sep}files`,
    css: `static${this.sep}css`,
    js: `static${this.sep}js`
  }
}

const writeFileSyncRecursive = (filename, content, charset) => {
  let filepath = filename.replace(/\\/g, opts.sep)
  let root = ''
  if (filepath[0] === opts.sep) {
    root = opts.sep
    filepath = filepath.slice(1)
  }
  else if (filepath[1] === ':') {
    root = filepath.slice(0, 3)
    filepath = filepath.slice(3)
  }
  const folders = filepath.split(opts.sep).slice(0, -1)
  folders.reduce(
    (acc, folder) => {
      const folderPath = acc + folder + opts.sep
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath)
      }
      return folderPath
    },
    root
  )
  fs.writeFileSync(root + filepath, content, charset)
}

const rootDir = (path) => {
  return `${opts.paths.root}${path.split(`${opts.sep}${opts.paths.root}`).pop()}`
}

const fileName = (path) => {
  return path.split(opts.sep).pop()
}

const clean = () => {
  const dir = `${process.cwd()}${opts.sep}${opts.paths.dest}`
  del.sync([dir])
}

const moveToDest = async (path, content) => {
  const file = {
    path,
    content
  }
  const collection = !content.includes(opts.ejs) ? [file] : await buildEJS(file)
  collection.forEach(file => {
    writeFileSyncRecursive(
      file.path.replace(opts.paths.root, opts.paths.dest),
      file.content,
      'utf8'
    )
  });
}

const ll = (start, filter) => {
  let listing = []

  if (!fs.existsSync(start)) {
    return []
  }

  const files = fs.readdirSync(start)

  files.forEach(file => {
    const path = `${start}${opts.sep}${file}`
    if (fs.lstatSync(path).isDirectory()) {
      listing = [...listing, ...ll(path, filter)]
      return
    }
    if (path.includes(filter)) {
      if (file[0] != opts.partial) {
        listing.push(rootDir(path))
      }
    }
  })
  return listing
}

const currentDir = (path) => {
  let dir = path.split(opts.sep)
  dir.pop()
  return dir.join(opts.sep)
}

const gelomold = (content) => {
  const re = /<!--gelomold(?<json>{.*})-->/gi
  const matches = content.replace(/\s+/g, '').matchAll(re)
  let json
  for (const match of matches) {
    if (!json && match && match.groups && match.groups.json) {
      json = JSON.parse(match.groups.json)
    }
  }
  return json
}

const geloDetails = (geloInclude, relativeDir) => {
  const [sys, include, ...json] = geloInclude.trim().split(' ')
  const file = include.replace(/-->$/, '')
  const params = json ? json.join(' ').replace(/-->$/, '') : {}
  const absolute = file[0] == opts.sep
  const path = absolute ? `${process.cwd()}${opts.sep}${opts.paths.root}${file}` : `${process.cwd()}${opts.sep}${relativeDir}${opts.sep}${file}`
  return {
    line: geloInclude.trim(),
    params,
    absolute,
    path: rootDir(path),
    content: fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : ''
  }
}

const doInclude = ({ parent, child, needle }) => {
  const re = new RegExp(needle, "g")
  return parent.replace(re, child)
}

const doInject = ({ content, inject, value }) => {
  const re = new RegExp(inject, "g")
  return content.replace(re, value)
}

const findAllGeloFiles = async (path) => {
  const regexp = /<!--gelo(.*)-->/;
  const cmd = "egrep -ro '" + regexp.toString().slice(1, -1) + "' " + path;
  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 200000000 });
    return stdout.split('\n')
      .filter(n => n)
      .map(match => match.split(':'))
      .map(file => ({
        path: file[0],
        filename: fileName(file[0]),
        include: file[1]
      }));
  } catch (error) {
    return [];
  }
}

const lookForGelo = (file) => {
  let fileContent = fs.readFileSync(file, 'utf8')
  const re = RegExp('<!--gelo(.*)-->', 'g')
  return Array.from(fileContent.matchAll(re), m => m[0])
}

const lookForParams = (content) => {
  const re = RegExp('\{gelo\.(.*)\}', 'g')
  return Array.from(content.matchAll(re), m => m[0])
}

const updateParams = (params, content) => {
  try {
    const data = JSON.parse(`${params}`)
    const injects = lookForParams(content)
    if (injects.length) {
      [...new Set(injects)].forEach(inject => {
        const param = inject.split('.').pop().replace('}', '')
        const value = data[param]
        content = doInject({ content, inject, value })
      })
    }
    return content
  } catch (error) {
    return content
  }
}

const copyFile = (path) => {
  let folders = path.split(opts.sep).slice(0, -1)
  folders.splice(0, 1, opts.paths.dest)
  folders.reduce(
    (acc, folder) => {
      const folderPath = acc + opts.sep + folder + opts.sep
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath)
      }
      return folderPath
    }
  )
  fs.copyFileSync(path, `${folders.join(opts.sep)}${opts.sep}${fileName(path)}`)
}

const copyFiles = (paths) => {
  paths.forEach(path => {
    copyFile(path)
  })
}

const updateSinglePage = async (page) => {
  const dir = currentDir(page)
  const includes = lookForGelo(page)
  let pageContent = fs.readFileSync(`${process.cwd()}${opts.sep}${page}`, 'utf8')
  if (!includes.length) {
    if (fileName(page)[0] != opts.partial) {
      await moveToDest(page, pretty(pageContent))
    } else {
      return pageContent
    }
  }
  for (const include of includes) {
    const gelo = geloDetails(include, dir)
    const file = `${process.cwd()}${opts.sep}${gelo.path}`
    const isFile = fs.existsSync(file)
    let content = isFile ? await updateSinglePage(gelo.path) : gelo.line.replace('<!--gelo', '<!--missing')

    if (gelo.params) {
      content = updateParams(gelo.params, content)
    }

    pageContent = doInclude({
      parent: pageContent,
      child: content,
      needle: gelo.line
    })
  }
  if (fileName(page)[0] != opts.partial) {
    await moveToDest(page, pretty(pageContent))
  } else {
    return pageContent
  }
}

const updateAllPages = async (geloPath) => {
  const geloPages = await findAllGeloFiles(opts.paths.root)
  const justParents = geloPages.filter(page => page.filename[0] != opts.partial)
  await Promise.all(
    justParents.filter(parent => {
      const gelo = geloDetails(parent.include, currentDir(parent.path))
      return geloPath == gelo.path
    }).map(parent => updateSinglePage(parent.path))
  )
}

const buildEJS = async ({ path, content }) => {
  const config = gelomold(content)
  if (config) {
    const dir = currentDir(path)
    const absolute = config.data[0] == opts.sep
    const builder = absolute ? `${process.cwd()}${opts.sep}${opts.paths.root}${config.data}` : `${process.cwd()}${opts.sep}${dir}${opts.sep}${config.data}`
    const cp = fork(builder)
    const noMold = content.replace(/<!--gelomold.*\}\n?-->\n?/gis, '')
    const data = await new Promise((resolve, reject) => {
      cp.on('message', (data) => {
        resolve(data);
      })
    })
    if (config.collection) {
      const folders = config.collection == 'folders'
      return data.map(item => {
        const gelo_path = config.gelo_path && item.gelo_path ? item.gelo_path.replace(/\/\s*$/, '') + '/' : ''
        const newPath = folders ? `${gelo_path}${item.slug}/index.html` : `${gelo_path}${item.slug}.html`
        return {
          path: path.replace(fileName(path), newPath),
          content: ejs.render(noMold, item)
        }
      })
    }
    const gelo_path = config.gelo_path && data.gelo_path ? data.gelo_path.replace(/\/\s*$/, '') + '/' : false
    return [{
      path: gelo_path ? `${opts.paths.root}${opts.sep}${gelo_path}${fileName(path)}` : path,
      content: ejs.render(noMold, data)
    }]
  }
  return [{ path, content }]
}

const compileJS = async () => {
  const paths = ll(`${process.cwd()}${opts.sep}${opts.paths.root}${opts.sep}${opts.paths.js}`, 'js')
  const entries = {}
  paths.map(path => {
    const filename = fileName(path).split('.')[0]
    entries[filename] = `.${opts.sep}${path}`
    return path
  })
  const result = await packAsync({
    entry: entries,
    output: {
      path: `${process.cwd()}${opts.sep}${opts.paths.dest}${opts.sep}${opts.paths.js}`,
      filename: `[name]${opts.ext.js}`
    },
    mode: 'production'
  })
  return result
}

const compileCSS = async () => {
  const paths = ll(`${process.cwd()}${opts.sep}${opts.paths.root}${opts.sep}${opts.paths.css}`, 'css')
  const cssPaths = paths.filter(path => path.includes(opts.ext.css))
  const scssPaths = paths.filter(path => path.includes(opts.ext.scss))
  await Promise.all(cssPaths.map(path => {
    const css = fs.readFileSync(`${process.cwd()}${opts.sep}${path}`, 'utf8')
    return moveToDest(path, css)
  }))
  await Promise.all(scssPaths.map(path => {
    const { css, map } = sass.renderSync({
      file: path
    })
    return moveToDest(path.replace(opts.ext.scss, opts.ext.css), css.toString())
  }))
}

const added = async (path) => {
  const hrstart = startTime()
  if (path.includes(opts.paths.files)) {
    copyFile(path)
  }
  if (path.includes(opts.ext.css) || path.includes(opts.ext.scss)) {
    await compileCSS()
  }
  if (path.includes(opts.ext.js)) {
    await compileJS()
  }
  report(process.hrtime(hrstart))
}

const changed = async (path) => {
  const hrstart = startTime()
  if (path.includes(opts.ext.html)) {
    if (fileName(path)[0] == opts.partial) {
      await updateAllPages(path)
    } else {
      await updateSinglePage(path)
    }
  }
  if (path.includes(opts.paths.files)) {
    copyFile(path)
  }
  if (path.includes(opts.ext.css) || path.includes(opts.ext.scss)) {
    await compileCSS()
  }
  if (path.includes(opts.ext.js)) {
    await compileJS()
  }
  report(process.hrtime(hrstart))
}

const unlinked = async (path) => {
  const hrstart = startTime()
  const dile = path.replace(opts.paths.root, opts.paths.dest)
  if (path.includes(opts.ext.html) || path.includes(opts.paths.files) || path.includes(opts.ext.js)) {
    if (fs.existsSync(dile)) {
      console.log(`Removed: ${dile}`)
      del.sync([dile]);
    }
  }
  if (path.includes(opts.ext.css) || path.includes(opts.ext.scss)) {
    await compileCSS()
  }
  if (path.includes(opts.ext.js)) {
    await compileJS()
  }
  report(process.hrtime(hrstart))
}

const clear = () => {
  process.stdout.write('\u001B[2J\u001B[00f')
}

const startTime = () => {
  clear()
  return process.hrtime()
}

const report = (hrend) => {
  console.info('⭐️Finished: %ds %dms', hrend[0], hrend[1] / 1000000)
}

const build = async (paths, exit = true) => {
  try {
    const hrstart = startTime()
    clean()
    const htmlPaths = paths.filter(path => path.includes(opts.ext.html))
    await Promise.all(htmlPaths.map(path => updateSinglePage(path)))
    await compileCSS()
    copyFiles(paths.filter(path => path.includes(opts.paths.files)))
    await compileJS()
    report(process.hrtime(hrstart))
    if (exit) {
      process.exit()
    }
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

const dev = async () => {
  try {
    const watcher = chokidar.watch(opts.paths.root, {
      ignoreInitial: true,
      persistent: true
    })
    watcher
      .on('add', path => added(path))
      .on('change', path => changed(path))
      .on('unlink', path => unlinked(path))
      .on('error', error => {
        console.log(`Watcher error: ${error}`)
        process.exit(1)
      })
    console.log('Initial build...')
    await build(
      ll(`${process.cwd()}${opts.sep}${opts.paths.root}`, '.'),
      false
    )
    console.log('Gelo is ready...')
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

program
  .command('build')
  .description('build all source files to destination directory')
  .action(() => {
    build(
      ll(`${process.cwd()}${opts.sep}${opts.paths.root}`, '.')
    )
  })

program
  .command('dev', { isDefault: true })
  .description('build a source file to destination directory')
  .action(() => {
    dev()
  })

program.parse(process.agv)
