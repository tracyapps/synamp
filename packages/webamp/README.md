# Webamp NPM Module

> **Retained vendored part of the SynAmp fork.** This package is kept as a parts
> drawer — the classic skin engine and the Milkdrop/Butterchurn visualizer. It is
> not published from this repository. The upstream-only pieces that used to sit
> around it (demo site, documentation site, skin database, `webamp-modern`
> prototype, `examples/`) were removed on 2026-09-24.

## Development

Work directly in `packages/webamp`:

    cd packages/webamp
    pnpm test        # unit tests (vitest)
    pnpm type-check  # tsc
    pnpm run build   # build the library bundles into ./built

There is no live-reloading demo site in this fork — the upstream
`packages/webamp-demo` no longer exists here. Rebuild with `pnpm run build` to
pick up changes to source files under `js/`.

## Building

To build the library for publishing:

    pnpm run build

This will write files to `./built`.

## Testing

    pnpm test

This will run the tests the linter and the type checker.

To update snapshots run

    pnpm test -u

## Cutting a Release

Upstream publishes this package to npm; this fork does not. If that ever
changes, the flow is:

1. Update the version number in `package.json`
2. Rename the "Next" title at the top of `CHANGELOG.md` to the new version number and ensure it is up to date
3. Update the static `VERSION` property of the `Webamp` class in `webampLazy.tsx`
4. `cd packages/webamp` and `npm publish`
5. Git tag the commit (e.g. `1.4.2` or `1.4.3-beta.3`) and push the tag

## Reference

- [skinspecs.pdf](http://members.xoom.it/skinart/tutorial/skinspecs..pdf)
- [Skinner's Atlas 1.5 by Jellby](http://forums.winamp.com/showthread.php?p=951257)
- [Winamp Skinning Tutorial](http://people.xmms2.org/~tru/promoe/Winamp_skinning_tutorial_1_5_0.pdf)
- Sacrat Skinning tutorial parts [1](http://www.hugi.scene.org/online/hugi26/hugi%2026%20-%20graphics%20skinning%20sacrat%20winamp%20skinning%20tutorial%20-%201.htm), [2](http://www.hugi.scene.org/online/hugi26/hugi%2026%20-%20graphics%20skinning%20sacrat%20winamp%20skinning%20tutorial%20-%202.htm), [3](http://www.hugi.scene.org/online/hugi26/hugi%2026%20-%20graphics%20skinning%20sacrat%20winamp%20skinning%20tutorial%20-%203.htm), [4](http://www.hugi.scene.org/online/hugi26/hugi%2026%20-%20graphics%20skinning%20sacrat%20winamp%20skinning%20tutorial%20-%204.htm), and [5](http://www.hugi.scene.org/online/hugi26/hugi%2026%20-%20graphics%20skinning%20sacrat%20winamp%20skinning%20tutorial%20-%205.htm),
- [Winamp Wiki](http://wiki.winamp.com/wiki/Creating_Classic_Skins)

## Predecessors

- [Webamp2x](http://forums.winamp.com/showthread.php?threadid=91850) An
  impressive implementation from 2002(!).
- [JsAmp](http://freecog.net/2005/jsamp/demo/MainWindow.xhtml) An implementation from 2005 by @twm (via [Hacker News](https://news.ycombinator.com/item?id=15317723)).
- [LlamaCloud Comp](https://vimeo.com/20149683) From 2011 by [Lee Martin](http://www.leemartin.com/) (via [Twitter](https://twitter.com/leemartin/status/910235793737814017))
- [Winamp em HTML5 e Javascript](http://www.tidbits.com.br/winamp-em-html5-e-javascript)
  In 2010 a developer named Danilo posted one of his HTML5 experiments: "an
  audio player simulating good old Winamp". You will have to download the zip
  file.
- [JuicyDrop](http://cggaurav.github.io/juicydrop/) An HTML5 implementation with
  less emphasis on being true to the skin, but fully featured visualizations.
  @cggaurav is keeping it alive on [GitHub](https://github.com/cggaurav/juicydrop)
- [Spotiamp](https://web.archive.org/web/20160109180426/http://spotiamp.com/)
  The folks at Spotify reimplemented Winamp as a frontend for Spotify. Not in a
  browser, and only runs on Windows. It has since been discontinued.
