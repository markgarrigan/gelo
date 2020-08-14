#!/usr/bin/env node

import cmd from 'commander'
import fs from 'fs'
import ffif from 'fast-find-in-files'
import riot from '@riotjs/compiler'
import sass from 'sass'
import imagemin from 'imagemin'
import imageminJpegtran from 'imagemin-jpegtran'
import imageminPngquant from 'imagemin-pngquant'
import chokidar from 'chokidar'

const { fastFindInFiles } = ffif
const {program} = cmd

riot.registerPreprocessor('css', 'sass', function(code, { options }) {
    const { file } = options

    console.log('Compile the sass code in', file)

    const {css} = sass.renderSync({
        data: code
    })

    return {
        code: css.toString(),
        map: null
    }
})

const opts = new function() {
    this.sep = '/'
    this.partial = '_'
    this.event = 'change'
    this.ext = {
        html: '.html',
        js: '.js',
        riot: '.riot',
        css: '.css',
        scss: '.scss'     
    }
    this.paths = {
        root: 'src',
        dest: 'dist',
        riot: `static${this.sep}js${this.sep}tags`,
        images: `static${this.sep}images`,
        files: `static${this.sep}files`,
        css: `static${this.sep}css`
    }
}

const fileName = (path) => {
    return path.split(opts.sep).pop()
}

const rootDir = (path) => {
    return `${opts.paths.root}${path.split(`${opts.sep}${opts.paths.root}`).pop()}`
}

const ll = (start,filter) => {
    let listing = []
    
    if (!fs.existsSync(start)){
        return []
    }
    
    const files=fs.readdirSync(start)
    
    files.forEach(file => {
        const path = `${start}${opts.sep}${file}`
        if (fs.lstatSync(path).isDirectory()) {
            listing = [...listing, ...ll(path,filter)]
            return
        }
        if (path.includes(filter)) {
            if (file[0] != opts.partial) {
                listing.push(rootDir(path))
            }
        }
    })
    return listing
};

const currentDir = (path) => {
    let dir = path.split(opts.sep)
    dir.pop()
    return dir.join(opts.sep)
}

const relativeDir = (path) => {
    return path.replace(`${opts.paths.root}${opts.sep}`, '')
}

const doInclude = ({parent, child, needle}) => {
    const re = new RegExp(needle,"g")
    return parent.replace(re, child)
}

const doInject = ({content, inject, value}) => {
    const re = new RegExp(inject, "g")
    return content.replace(re, value)
}

const findAllGeloFiles = (path) => {
    return fastFindInFiles(path, '<!--gelo')
}

const lookForGelo = (file) => {
    let fileContent = fs.readFileSync(file, 'utf8')
    const re = RegExp('<!--gelo(.*)-->','g')
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
                content = doInject({content, inject, value})
            })
        }
        return content
    } catch (error) {
        return content
    }
}

const updateSinglePage = (page) => {   
    const dir = currentDir(page)    
    const includes = lookForGelo(page)
    let pageContent = fs.readFileSync(`${process.cwd()}${opts.sep}${page}`, 'utf8')
    if (!includes.length) {
        if (fileName(page)[0] != opts.partial) {
            moveToDest(page, pageContent)
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
        
        pageContent = isFile ? doInclude({
            parent: pageContent,
            child: content,
            needle: gelo.line
        }) : pageContent
    }
    if (fileName(page)[0] != opts.partial) {
        moveToDest(page, pageContent)
    }
    return pageContent
}

const updateAllPages = (geloPath) => {
    findAllGeloFiles(opts.paths.root)
    .filter(possible => possible.filePath.split(opts.sep).pop()[0] != opts.partial)
    .forEach(possible => {
        possible.queryHits
        .filter(hit => hit.line.includes(fileName(geloPath)))
        .forEach(hit => {
            const gelo = geloDetails(hit.line, currentDir(possible.filePath))
            if (geloPath == gelo.path) {
                updateSinglePage(possible.filePath)
            }
        });
    });    
}

const compileRiot = (path) => {
    const component = fs.readFileSync(`${process.cwd()}${opts.sep}${path}`, 'utf8')
    const {code, map} = riot.compile(component)
    moveToDest(
        `${opts.paths.root}${opts.sep}${opts.paths.riot}${opts.sep}${relativeDir(path).replace(opts.ext.riot, opts.ext.js)}`,
        code
    )
}

const compileCSS = () => {
    const paths = ll(`${process.cwd()}${opts.sep}${opts.paths.root}${opts.sep}${opts.paths.css}`, 'css')
    paths.forEach(path => {
        if (path.includes(opts.ext.css)) {
            const css = fs.readFileSync(`${process.cwd()}${opts.sep}${path}`, 'utf8')
            moveToDest(path, css)
        }
        if (path.includes(opts.ext.scss)) {
            const {css,map} = sass.renderSync({
                file: path
            })
            moveToDest(path.replace(opts.ext.scss, opts.ext.css), css.toString())
        }
    })
}

const compressImages = async (path) => {
    await imagemin([path], {
        destination: `${opts.paths.dest}${opts.sep}${opts.paths.images}`,
        plugins: [
            imageminJpegtran(),
            imageminPngquant({
                quality: [0.6, 0.8]
            })
        ]
    })
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
    });
}

const writeFileSyncRecursive = (filename, content, charset) => {
    let filepath = filename.replace(/\\/g,opts.sep);
    let root = '';
    if (filepath[0] === opts.sep) { 
        root = opts.sep; 
        filepath = filepath.slice(1);
    } 
    else if (filepath[1] === ':') { 
        root = filepath.slice(0,3);
        filepath = filepath.slice(3); 
    }
    const folders = filepath.split(opts.sep).slice(0, -1);
    folders.reduce(
        (acc, folder) => {
            const folderPath = acc + folder + opts.sep;
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath);
            }
            return folderPath
        },
        root
    );
    fs.writeFileSync(root + filepath, content, charset);
}

const clear = () => {
    process.stdout.write('\u001B[2J\u001B[0;0f')
}

const startTime = () => {
    clear()
    return process.hrtime()    
}

const report = (hrend) => {
    // clear()
    console.info('⭐️Finished: %ds %dms', hrend[0], hrend[1] / 1000000)
    // process.exit()
}

const added = async (path) => {
    const hrstart = startTime()
    if (path.includes(opts.paths.images)) {
        await compressImages(path)
    }
    if (path.includes(opts.paths.files)) {
        copyFile(path)
    }
    report(process.hrtime(hrstart))
}

const changed = (path) => {
    const hrstart = startTime()
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
    if (path.includes(opts.ext.riot)) {
        program.riot ? compileRiot(path) : copyFile(path)
    }
    report(process.hrtime(hrstart))
}

const unlinked = (path) => {
    // if (changedFileName.includes(opts.ext.html)) {
    //     if (changedFileName[0] == opts.partial) {
    //         const needle = changedFileName
    //         const results = fastFindInFiles(opts.paths.root, needle)
    //         if (results.length) {
    //             console.log(`${changedFileName} is used in:`);
                
    //             results.forEach(result => {
    //                 console.log(result.filePath);
    //             });
                
    //             console.log(`File${results.length > 1 ? 's' : ''} skipped.`)
    //         }
    //     } else {
    //         const dile = options.path.replace(opts.paths.root, opts.paths.dest)
    //         console.log(dile);
            
    //         // if (fs.existsSync(dile)) {
    //         //     fs.unlinkSync(dile)
    //         // }
    //     }
    // }
    
    // if (changedFileName.includes('.riot')) {
    //     const dile = options.path
    //     .replace(opts.paths.root, `${opts.paths.dest}${opts.sep}${opts.paths.riot}`)
    //     .replace(opts.ext.riot, opts.ext.js)
    //     const path = `${process.cwd()}${opts.sep}${dile}`
    //     if (fs.existsSync(path)) {
    //         // shell.rm(path)
    //         // try {
    //         //     // fs.unlinkSync(path)
    //         //     //file removed
    //         //   } catch(err) {
    //         //     console.error(err)
    //         //   }
    //     }
    // }
}

const build = async (paths, options) => {
    try {
        const hrstart = startTime()
        paths.forEach(path => {
            if (path.includes(opts.ext.html)) {
                updateSinglePage(path)
            }
            if (path.includes(opts.ext.riot)) {
                program.riot ? compileRiot(path) : copyFile(path)
            }
        })
        compileCSS()
        copyFiles(paths.filter(path => path.includes(opts.paths.files)))
        await compressImages(`${opts.paths.root}${opts.sep}${opts.paths.images}${opts.sep}*.{jpg,png}`)
        report(process.hrtime(hrstart))
    } catch (error) {
        console.error(error)
        process.exit()
    }
}

const dev = async (options) => {
    clear()
    const watcher = chokidar.watch(opts.paths.root, {
        ignoreInitial: true,
        persistent: true
    });
    // Something to use when events are received.
    const log = console.log.bind(console);
    // Add event listeners.
    watcher
    .on('add', path => added(path))
    .on('change', path => changed(path))
    .on('unlink', path => unlinked(path))
    .on('error', error => {
        log(`Watcher error: ${error}`)
        process.exit()
    })
    log('Gelo is ready...')
}

program
    .option('--no-riot', 'do not compile riot tags to javascript')

program
    .command('build')
    .description('build all source files to destination directory')
    // .option('-s, --source <source>', 'the source directory to build from', opts.paths.root)
    // .option('-d, --destination <destination>', 'the destination directory of the build', opts.paths.dest)
    .action((source, destination) => {
        build(
            ll(`${process.cwd()}${opts.sep}${opts.paths.root}`, '.'),
            opts
        )
    })

program
    .command('dev', { isDefault: true })
    .description('build a source file to destination directory')
    // .option('-s, --source <source>', 'the source directory of your development files', opts.paths.root)
    // .option('-d, --destination <destination>', 'the destination directory of the build', opts.paths.dest)
    .action((opts) => {
        dev(opts)
    })

program.parse(process.agv)