# Build Targets

- The default `make` invocation produces the `z80` executable that matches the current repository configuration:

  ```bash
  make
  ```

- Use the explicit target when you want to specify the artifact name directly:

  ```bash
  make z80
  ```

- Any documentation that still mentions a `spectrum` binary is outdated; the toolchain now emits only the `z80` executable.
