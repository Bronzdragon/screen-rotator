# Screen Rotator (Gnome Extension).
This extension adds two quick rotate buttons to rotate the primary screen quickly. Useful on, e.g. tablet devices. [Find it on Gnome extensions](https://extensions.gnome.org/extension/7168/screen-rotator/)!

Special thanks for the boilerplate starter code project [gnome-extension-typescript](https://github.com/benjilebon/gnome-extension-typescript)

## Build Requirements.
- GNU Make
- Yarn
- Node (Preferably > 12.x.x)

## Build/Debug Instructions.

This project uses a makefile as a build system.
```sh
make install # installs dependencies
make build   # Runs TypeScript and builds the extension files
make deploy  # deploys the files on the local system
make release # creates a bundle (zip file), ready for release
```
After deployment, you must reload the gnome shell. You can do so by logging off and on again, or if you are using X, pressing `Alt`+`F2` to summon the command window, and then use the `r` command to reload the shell.

If you are on Wayland, you can most easily test the extension by running an embedded shell.
```sh
dbus-run-session -- gnome-shell --nested --wayland
```