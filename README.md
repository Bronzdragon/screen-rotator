# Screen Rotator (Gnome Extension).
This extension adds two quick rotate buttons to rotate the primary screen quickly. Useful on, e.g. tablet devices.

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

1. Find hitbox for primary screen
2. Find centre.
3. Rotate hitbox around centre (height becomes width, width becomes height)
4. For every other display, create 'uncategorised list'
5. If uncategorised list isn't empty, grab first display.
    6. Find all connected displays, merge into 'display group'.
    7. go to 5
8. For each 'display group', find the vector that points to the rotated display for each individual display.
9. Combine all vectors, normalize 
10. Using a binary search, find the correct distance (Along the vector if no collision, and backwards if any display is intersecting.)
11. Collect pairs of all the screens still intersecting.
    12. For each pair, move them apart along the vector between their screen centres.
    13. If any displays are not touching edges with any other displays, move them towards the rotated screen until it's edge is touching any screen again.
    14. go to 11
15. Done.

