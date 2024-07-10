# Screen Rotator (Gnome Extension).
This extension adds rotate left and rotate right buttons in the top panel to rotate the screen quickly. Useful for tablets and other devices without rotation sensors.

[INSERT VIDEO HERE.]

Primarily intended for devices with only one screen, but it supports multiple screens to handle drawing tablets, device development, virtual screens and other use cases. Auto Rotate on and off are both supported.

## Installation instructions.
### Automatic install (recommended).
[Install from Gnome extensions website ](https://extensions.gnome.org/extension/7177/screen-rotator/)

### Building from source.
See the [build instructions](#builddebug-instructions) below.

### Manual install.
- Download the zip file from releases. 
- Go to the Gnome Extensions folder `~/.local/share/gnome-shell/extensions/`.    
  *If this folder does not exist on your system, you can also install the extension system-wide by placing it in `/usr/share/gnome-shell/extensions/` instead. This is not recommended.*
- Create a folder for this extension named `screen-rotator@bronzdragon.github.io`.
- Place all the contents of the zip folder inside of this new folder.
- Reload the shell to activate.

## Build Requirements.
- GNU Make
- Yarn
- Node (Preferably > 12.x.x)

## Build/Debug Instructions.
This project uses a make.
```sh
make # install, build and deploy, all in one

make install # installs dependencies
make build   # Runs TypeScript and builds the extension files
make deploy  # deploys the files on the local system
make release # creates a bundle (zip file), ready for release
```
If you are using Xorg, press `Alt`+`F2` to summon the command window, and then use the `reload` command to reload the shell.  
If you are on Wayland, you can most easily test the extension by running an embedded shell, as shown below.
```sh
dbus-run-session -- gnome-shell --nested --wayland
```

## Special Thanks
Thanks to Benji Lebon for the boilerplate starter code project [gnome-extension-typescript](https://github.com/benjilebon/gnome-extension-typescript)