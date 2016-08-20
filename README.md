# Cargo runner (Rust) for Atom

[![Build Status](https://img.shields.io/travis/AtomBuild/atom-build-cargo/master.svg?style=flat-square)](https://travis-ci.org/AtomBuild/atom-build-cargo)
[![Gitter chat](https://badges.gitter.im/noseglid/atom-build.svg?style=flat-square)](https://gitter.im/noseglid/atom-build)

Uses [Atom Build](https://github.com/noseglid/atom-build) to build Rust projects by means of Cargo in the Atom editor.

Required packages:

- [atom-build](https://github.com/noseglid/atom-build) to run Cargo commands.
- [linter](https://atom.io/packages/linter) to display compiler messages.

## Features

- Allows to run various Cargo commands (`build`, `test`, `run`, `doc`, `update` etc.)
- Supports extended commands [`cargo check`](https://github.com/rsolomo/cargo-check) and [`cargo clippy`](https://github.com/arcnmx/cargo-clippy).
- Supports multi-crate projects (including Cargo workspaces).
- Displays compiler messages and panics in a handy way.

![Screencast](http://g.recordit.co/ZK2iCsz7C6.gif)
