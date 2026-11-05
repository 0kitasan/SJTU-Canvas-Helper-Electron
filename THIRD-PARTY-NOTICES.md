# Attribution and third-party notices

This project is an independent Electron / TypeScript / React rebuild of
[SJTU Canvas Helper](https://github.com/Okabe-Rintarou-0/SJTU-Canvas-Helper),
originally developed by Zihong Lin and contributors. It is not the upstream
project's official Electron distribution and is not an official university app.

Upstream code, API behavior and UI structure were used as references and adapted.
The upstream MIT license and copyright notice are preserved in LICENSE.
Electron-specific modifications are distributed under the same MIT license.

## Material UI icons

The navigation icons reuse SVG paths from @mui/icons-material 7.3.9, under MIT.
The full notice is in src/icons-LICENSE.txt and is included in packaged apps.

## Runtime and dependencies

Electron is distributed with its own LICENSE and LICENSES.chromium.html in the
packaged runtime. React, React DOM and scheduler retain their license files in
the application's packaged dependencies. Refer to pnpm-lock.yaml for exact
versions. No ownership over upstream work or third-party assets is claimed.
