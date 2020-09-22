# gelo

![Node.js Package](https://github.com/markgarrigan/gelo/workflows/Node.js%20Package/badge.svg)

### ** GELO IS IN ACTIVE DEVELOPMENT.
### ** FEATURES MAY COME AND GO IN EVERY RELEASE

Are you in to static web pages? Do you wish you knew [The Simplest Way to Handle HTML Includes][1]?

gelo can help you.

- gelo is opinionated
- gelo is simple
- gelo is fast

## What is gelo?

gelo is a command line interface (CLI) that lets you build HTML using reusable chunks. It makes it easy to write something like a `_footer.html` file once and reuse it in any number of HTML files.

## Why gelo?

It might seem old school. Yes. It is. Remember the good ol' days of PHP includes? or ERB partials? No? Then you're not that old. Hooray for you!!

Sometimes, even in these crazy futuristic days, it's nice to just build a website using HTML. gelo can make it a little nicer to do that.

## Install

`npm i gelo -g`

#### Node Version

gelo runs on the latest version of node and runs on version 12 using the `--experimental-modules` flag.

## Building

gelo looks for your source html files in a directory called `src`.

##### Example directory structure

```
+-- src
|   +-- _special.html
|   +-- index.html
|   +-- shared
    |   +-- _head.html
    |   +-- _footer.html
```

### Relative gelo files

gelo looks for a file relative to the file that's asking for it.

`<!--gelo _file.html-->`

`<!--gelo rel/path/to/_file.html-->`

### Absolute gelo files

gelo starts in src and goes where you tell it to go.

`<!--gelo /_file.html-->`

`<!--gelo /abs/path/to/_file.html-->`

##### index.html
```
<!DOCTYPE html>
<html>
  <!--gelo shared/_head.html-->
  <body>
    <h1>Home Page</h1>
    <p>So much good content</p>
    <!--gelo _special.html-->
    <!--gelo shared/_footer.html-->
  </body>
</html>
```

##### _special.html
```
<h3>I have special content.</h3>
```

##### shared/_header.html
```
<head>
  <meta charset="utf-8">
  <title>gelo is fun</title>
</head>
```

##### shared/_footer.html
```
<footer>Contact Us</footer>
```

### From the command line run

`gelo build`

gelo will build html files to a directory called `dist`.

##### dist/index.html
```
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>gelo is fun</title>
  </head>
  <body>
    <h1>Home Page</h1>
    <p>So much good content</p>
    <h3>I have special content.</h3>
    <footer>Contact Us</footer>
  </body>
</html>
```

## Development

Run `gelo dev` or just `gelo`

gelo will wait for files to change and build only the relevant files.

You could do something like this with npm scripts.

##### package.json
```
...
"scripts": {
    ...
    "predev": "npm run build",
    "dev": "gelo",
    "build": "gelo build"
    ...
}
...
```

## Bonus Feature

This feature sort of kind of negates gelo's simplicity.

### Parameters

This feature is not tested very well. But it "works".

You can pass parameters to a gelo file. Let's take the above example and pass a parameter to our `shared/_head.html` gelo file.

#### Rules for parameters

- Must be valid JSON.
- Can't have nested objects. (Coming soon?)

##### index.html
```
<!DOCTYPE html>
<html>
  <!--gelo shared/_head.html {"title": "Home Page"}-->
  <body>
    <h1>Home Page</h1>
    <p>So much good content</p>
    <!--gelo _special.html-->
    <!--gelo shared/_footer.html-->
  </body>
</html>
```

##### shared/_header.html
```
<head>
  <meta charset="utf-8">
  <title>{gelo.title}</title>
</head>
```

Our new `index.html` now has the title we passed in.

##### dist/index.html
```
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Home Page</title>
  </head>
  <body>
    <h1>Home Page</h1>
    <p>So much good content</p>
    <h3>I have special content.</h3>
    <footer>Contact Us</footer>
  </body>
</html>
```

## Future

gelo has the underpinnings to become a full staticish site builder including javascript components and css. gelo may expand into that, or just become part of a larger project that does all that.

#### Other things gelo can do right now

- Compile css from scss using [sass][4].
- Compress jpegs and pngs using [imagemin][2].
  - Images go into `src/static/images`
- Move random public files like PDFS.
  - Files go into `src/static/files`
- Bundle Javascript files using [esbuild][3].
  - Each javascript file in `src/static/js` is treated as an entry file and will be bundled separately
- Compile templates using [ejs][5].
  - Configure templates using a gelomold.json file
  - More details and examples coming soon.

### gelo Source Directory Structure

```
+-- gelomold.json
+-- src
|   +-- _special.html
|   +-- index.html
|   +-- about
    |   +-- _team.html
    |   +-- index.html
    +-- contact
    |   +-- _map.html
    |   +-- index.html
|   +-- shared
    |   +-- _head.html
    |   +-- _footer.html
    +-- static
    |   +-- js
        |   entry1.js
        |   entry2.js
    |   +-- css
        |   +-- _colors.scss
        |   +-- main.scss
    |   +-- files
        |   +-- public.pdf
        |   +-- stats.xls
    |   +-- images
        |   +-- logo.png
        |   +-- circle.png
```

[1]: https://css-tricks.com/the-simplest-ways-to-handle-html-includes/
[2]: https://www.npmjs.com/package/imagemin
[3]: https://github.com/evanw/esbuild
[4]: https://www.npmjs.com/package/sass
[5]: https://ejs.co/
