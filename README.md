# radar1090

Simple radar display application built with SDL2.

The repository now also contains a standalone HTML5/WebGL-free radar
display that mimics the SDL application using Canvas 2D. The web version
keeps the retro radar styling while adding a responsive layout and a
configurable server connection panel.

## Controls

- `q` quit
- `m` toggle between volume and sweep speed adjustment for `+`/`-`
- `+`/`-` increase or decrease volume or sweep speed
- `Up`/`Down` change radar range
- `Left`/`Right` adjust inbound alert distance

## HTML5 version

Open `index.html` in a modern browser (Chrome, Edge, Firefox or Safari).

1. Enter the host and port of your dump1090-fa server in the sidebar.
   The server must expose the JSON endpoints (e.g. `http://HOST:PORT/dump1090-fa/data`).
2. Once connected the page polls for `receiver.json` (to align the map)
   and `aircraft.json` every five seconds.
3. Keyboard controls mirror the SDL build (`m`, `+`, `-`, arrow keys).

The browser stores the last-used server and receiver coordinates in
`localStorage` so reloading the page keeps your settings.

## Building on Linux

Ensure development packages for SDL2, SDL2_ttf, SDL2_mixer, libcurl, and jansson are installed.

```
make
```

This produces `./radar_display`.

## Building for Windows (cross-compiled from Linux)

A `Makefile.win` is provided for generating a Windows executable using the mingw-w64 toolchain.
Install the SDL2, SDL2_ttf, SDL2_mixer, libcurl, and jansson libraries for your MinGW environment,
then run:

```
make -f Makefile.win
```

The resulting `radar_display.exe` will be placed in the project root.

To remove built binaries, use `make clean` or `make -f Makefile.win clean`.

