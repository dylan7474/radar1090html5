# Makefile for Linux
CC = gcc
TARGET = radar_display
SRCS = main.c
CFLAGS = -Wall -O2 `sdl2-config --cflags` -I/usr/include/jansson
LDFLAGS = `sdl2-config --libs` -lSDL2_ttf -lSDL2_mixer -lSDL2_image -lcurl -ljansson -lm -lpthread

all: $(TARGET)

$(TARGET): $(SRCS)
	$(CC) $(CFLAGS) $(SRCS) -o $(TARGET) $(LDFLAGS)

clean:
	rm -f $(TARGET)
