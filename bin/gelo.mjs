#!/usr/bin/env node

import cmd from 'commander'
import fs from 'fs'
import ffif from 'fast-find-in-files'
import sass from 'sass'
import imagemin from 'imagemin'
import imageminJpegtran from 'imagemin-jpegtran'
import imageminPngquant from 'imagemin-pngquant'
import chokidar from 'chokidar'
import esbuild from 'esbuild'
import del from 'del'
import pretty from 'pretty'

const { buildSync } = esbuild
const { fastFindInFiles } = ffif
const { program } = cmd

let hrstart

const opts = new function () {
    this.sep = '/'
    this.partial = '_'
    this.event = 'change'
    this.target = 'es5'
    this.ext = {
        html: '.html',
        js: '.js',
        css: '.css',
        scss: '.scss'
    }
    this.paths = {
        root: 'src',
        dest: 'dist',
        images: `static${this.sep}images`,
        files: `static${this.sep}files`,
        css: `static${this.sep}css`,
        js: `static${this.sep}js`
    }
}

const fileName = (path) => {
    return path.split(opts.sep).pop()
}

const rootDir = (path) => {
    return `${opts.paths.root}${path.split(`${opts.sep}${opts.paths.root}`).pop()}`
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

const relativeDir = (path) => {
    return path.replace(`${opts.paths.root}${opts.sep}`, '')
}

const doInclude = ({ parent, child, needle }) => {
    const re = new RegExp(needle, "g")
    return parent.replace(re, child)
}

const doInject = ({ content, inject, value }) => {
    const re = new RegExp(inject, "g")
    return content.replace(re, value)
}

const findAllGeloFiles = (path) => {
    return fastFindInFiles(path, '<!--gelo')
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
        content: fs.existsSync(path) ? fs.readFileSync(`${path}`, 'utf8') : ''
    }
}

const moveToDest = (path, content) => {
    writeFileSyncRecursive(
        path.replace(opts.paths.root, opts.paths.dest),
        content,
        'utf8'
    )
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

const updateSinglePage = (page, reporting = true) => {
    const dir = currentDir(page)
    const includes = lookForGelo(page)
    let pageContent = fs.readFileSync(`${process.cwd()}${opts.sep}${page}`, 'utf8')
    if (!includes.length) {
        if (fileName(page)[0] != opts.partial) {
            moveToDest(page, pretty(pageContent))
            if (reporting)
                report(process.hrtime(hrstart))
        }
        return pageContent
    }
    for (const include of includes) {
        const gelo = geloDetails(include, dir)
        const file = `${process.cwd()}${opts.sep}${gelo.path}`
        const isFile = fs.existsSync(file)
        let content = isFile ? updateSinglePage(gelo.path) : gelo.line.replace('<!--gelo', '<!--missing')

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
        moveToDest(page, pretty(pageContent))
        if (reporting)
            report(process.hrtime(hrstart))
    }
    return pageContent
}

const updateAllPages = (geloPath, reporting = true) => {
    findAllGeloFiles(opts.paths.root)
        .filter(possible => possible.filePath.split(opts.sep).pop()[0] != opts.partial)
        .forEach(possible => {
            possible.queryHits
                .filter(hit => hit.line.includes(fileName(geloPath)))
                .forEach(hit => {
                    const gelo = geloDetails(hit.line, currentDir(possible.filePath))
                    if (geloPath == gelo.path) {
                        updateSinglePage(possible.filePath, false)
                    }
                })
        })
    if (reporting)
        report(process.hrtime(hrstart))
}

const compileCSS = (reporting = true) => {
    const paths = ll(`${process.cwd()}${opts.sep}${opts.paths.root}${opts.sep}${opts.paths.css}`, 'css')
    paths.forEach(path => {
        if (path.includes(opts.ext.css)) {
            const css = fs.readFileSync(`${process.cwd()}${opts.sep}${path}`, 'utf8')
            moveToDest(path, css)
        }
        if (path.includes(opts.ext.scss)) {
            const { css, map } = sass.renderSync({
                file: path
            })
            moveToDest(path.replace(opts.ext.scss, opts.ext.css), css.toString())
        }
    })
    if (reporting)
        report(process.hrtime(hrstart))
}

const buildJS = (reporting = true) => {
    const paths = ll(`${process.cwd()}${opts.sep}${opts.paths.root}${opts.sep}${opts.paths.js}`, 'js')
    buildSync({
        entryPoints: paths,
        outdir: `${process.cwd()}${opts.sep}${opts.paths.dest}${opts.sep}${opts.paths.js}`,
        minify: true,
        bundle: true,
        target: program.target
    })
    if (reporting)
        report(process.hrtime(hrstart))
}

const compressImages = async (path, reporting = true) => {
    await imagemin([path], {
        destination: `${opts.paths.dest}${opts.sep}${opts.paths.images}`,
        plugins: [
            imageminJpegtran(),
            imageminPngquant({
                quality: [0.6, 0.8]
            })
        ]
    })
    if (reporting)
        report(process.hrtime(hrstart))
}

const copyFile = (path, reporting = true) => {
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
    if (reporting)
        report(process.hrtime(hrstart))
}

const copyFiles = (paths, reporting) => {
    paths.forEach(path => {
        copyFile(path, false)
    })
    if (reporting)
        report(process.hrtime(hrstart))
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

const clear = () => {
    process.stdout.write('\u001B[2J\u001B[00f')
}

const clean = () => {
    const dir = `${process.cwd()}${opts.sep}${opts.paths.dest}`
    del.sync([dir])
}

const startTime = () => {
    clear()
    return process.hrtime()
}

const report = (hrend) => {
    console.info('⭐️Finished: %ds %dms', hrend[0], hrend[1] / 1000000)
}

const added = async (path) => {
    hrstart = startTime()
    if (path.includes(opts.paths.images)) {
        compressImages(path)
    }
    if (path.includes(opts.paths.files)) {
        copyFile(path)
    }
    report(process.hrtime(hrstart))
}

const changed = (path) => {
    hrstart = startTime()
    if (path.includes(opts.paths.files)) {
        copyFile(path)
    }
    if (path.includes(opts.ext.html)) {
        if (fileName(path)[0] == opts.partial) {
            // Update all pages that include this partial
            updateAllPages(path)
        } else {
            // Update a single page
            updateSinglePage(path)
        }
    }
    if (path.includes(opts.ext.css) || path.includes(opts.ext.scss)) {
        compileCSS()
    }
    if (path.includes(opts.ext.js)) {
        buildJS()
    }
}

const unlinked = (path) => {
    const dile = path.replace(opts.paths.root, opts.paths.dest)
    if (path.includes(opts.ext.html) || path.includes(opts.paths.files) || path.includes(opts.ext.js)) {
        if (fs.existsSync(dile)) {
            console.log(`Removed: ${dile}`)
            del.sync([dile]);
        }
    }
    if (path.includes(opts.ext.css) || path.includes(opts.ext.scss)) {
        compileCSS()
    }
    if (path.includes(opts.ext.js)) {
        buildJS()
    }
}

const build = async (paths) => {
    try {
        hrstart = startTime()
        clean()
        paths.forEach(path => {
            if (path.includes(opts.ext.html)) {
                updateSinglePage(path, false)
            }
        })
        compileCSS(false)
        copyFiles(paths.filter(path => path.includes(opts.paths.files)), false)
        compressImages(`${opts.paths.root}${opts.sep}${opts.paths.images}${opts.sep}*.{jpg,png}`, false)
        buildJS(false)
        report(process.hrtime(hrstart))
    } catch (error) {
        console.error(error)
        process.exit()
    }
}

const dev = async () => {
    clear()
    const watcher = chokidar.watch(opts.paths.root, {
        ignoreInitial: true,
        persistent: true
    })
    // Something to use when events are received.
    const log = console.log.bind(console)
    // Add event listeners.
    watcher
        .on('add', path => added(path))
        .on('change', path => changed(path))
        .on('unlink', path => unlinked(path))
        .on('error', error => {
            log(`Watcher error: ${error}`)
            process.exit()
        })
    log('Initial build...')
    await build(
        ll(`${process.cwd()}${opts.sep}${opts.paths.root}`, '.'),
        opts
    )
    log('Gelo is ready...')
}

program
    .command('build')
    .description('build all source files to destination directory')
    // .option('-s, --source <source>', 'the source directory to build from', opts.paths.root)
    // .option('-d, --destination <destination>', 'the destination directory of the build', opts.paths.dest)
    .option('--js-target <target>', 'Environment target (e.g. es5, es6, es2017, chrome58, firefox57, safari11, edge16, node10, default esnext)', opts.target)
    .action(() => {
        build(
            ll(`${process.cwd()}${opts.sep}${opts.paths.root}`, '.')
        )
    })

program
    .command('dev', { isDefault: true })
    .description('build a source file to destination directory')
    // .option('-s, --source <source>', 'the source directory of your development files', opts.paths.root)
    // .option('-d, --destination <destination>', 'the destination directory of the build', opts.paths.dest)
    .option('--js-target <target>', 'Environment target (e.g. es5, es6, es2017, chrome58, firefox57, safari11, edge16, node10, default esnext)', opts.target)
    .action(() => {
        dev()
    })

program.parse(process.agv)