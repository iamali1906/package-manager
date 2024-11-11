# Basic Package Manager

## Building the Project

To build the package manager, run:

```bash
npm run build
```

## Linking the Package

After building the project, you need to link it to use the package manager globally on your machine. To do this, run:

```bash
npm link
```

Make sure to run the `npm link` command from the root project directory.

## Using the Package Manager

Once the build and link processes are successful, you can use the `mpm` command from anywhere on your machine using a terminal.

For example:

```bash
mpm add lodash
```
