# gelo

Are you in to static web pages? Do you wish you knew [The Simplest Way to Handle HTML Includes][1]?

gelo can help you.

- gelo is opinionated
- gelo is simple
- gelo is fast

## Install

`npm i gelo -g`

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

- Compile css from scss using [sass][4]
- Compress jpegs and pngs using [imagemin][2].
  - Images go into `src/static/images`
- Move random public files like PDFS.
  - Files go into `src/static/files`
- Compile [RIOT][3] components.
  - You're probably using React, Vue, or Svelte. You should try [RIOT][3]. It's better.
  - Riot components can be anywhere in `src` but need to use the .riot file extension.
  - You can use scss in your Riot components. It will be compiled to css.

[1]: https://css-tricks.com/the-simplest-ways-to-handle-html-includes/
[2]: https://www.npmjs.com/package/imagemin
[3]: https://riot.js.org/
[4]: https://www.npmjs.com/package/sass