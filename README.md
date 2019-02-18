# Cockpit Session Recording

Module for [Cockpit](http://www.cockpit-project.org) which provides session recording 
configuration and playback. 
It requires [tlog](https://github.com/Scribery/tlog) to record terminal sessions. 
SSSD is required to manage which users / groups are recorded. Systemd Journal is used to store recordings.
Ansible role for session-recording is [here](https://github.com/nkinder/session-recording).

Demos & Talks:

 * [Demo 1 on YouTube](https://youtu.be/5-0WBf4rOrc)
 * [Demo 2 on YouTube](https://youtu.be/Fw8g_fFvwcs)
 * [FOSDEM talk](https://youtu.be/sHO5y28EHXg)
 
GitHub Organization: 
 
 * [scribery.github.io](http://scribery.github.io/)
 * [Scribery](https://github.com/Scribery) 

# Getting and building the source

Make sure you have `npm` available (usually from your distribution package).
These commands check out the source and build it into the `dist/` directory:

```
git clone https://github.com/Scribery/cockpit-session-recording.git
cd cockpit-session-recording
make
```

# Installing

`make install` compiles and installs the package in `/usr/share/cockpit/`. The
convenience targets `srpm` and `rpm` build the source and binary rpms,
respectively. Both of these make use of the `dist-gzip` target, which is used
to generate the distribution tarball. In `production` mode, source files are
automatically minified and compressed. Set `NODE_ENV=production` if you want to
duplicate this behavior.

For development, you usually want to run your module straight out of the git
tree. To do that, link that to the location were `cockpit-bridge` looks for packages:

```
mkdir -p ~/.local/share/cockpit
ln -s `pwd`/dist ~/.local/share/cockpit/session-recording
```

After changing the code and running `make` again, reload the Cockpit page in
your browser.

# Running eslint

Cockpit Starter Kit uses [ESLint](https://eslint.org/) to automatically check
JavaScript code style in `.jsx` and `.es6` files.

The linter is executed within every build as a webpack preloader.

For developer convenience, the ESLint can be started explicitly by:

    $ npm run eslint

Violations of some rules can be fixed automatically by:

    $ npm run eslint:fix

Rules configuration can be found in the `.eslintrc.json` file.

# Credits

Cockpit-session-recording is based on [starter-kit](http://cockpit-project.org/blog/cockpit-starter-kit.html).
