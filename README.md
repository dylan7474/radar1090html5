# radar1090

Simple radar display application built with SDL2.

The interface now features a modern dark theme, refined radar grid and
DejaVu Sans fonts for a more professional look.

## Controls

- `q` quit
- `m` toggle between volume and sweep speed adjustment for `+`/`-`
- `+`/`-` increase or decrease volume or sweep speed
- `Up`/`Down` change radar range
- `Left`/`Right` adjust inbound alert distance

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

