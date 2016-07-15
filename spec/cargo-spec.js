'use babel';

import fs from 'fs-extra';
import temp from 'temp';
import { vouch } from 'atom-build-spec-helpers';
import { provideBuilder } from '../lib/cargo';

describe('cargo', () => {
  let directory;
  let builder;
  const Builder = provideBuilder();

  beforeEach(() => {
    atom.config.set('build-make.useMake', true);
    atom.config.set('build-make.jobs', 2);
    waitsForPromise(() => {
      return vouch(temp.mkdir, 'atom-build-make-spec-')
        .then((dir) => vouch(fs.realpath, dir))
        .then((dir) => (directory = `${dir}/`))
        .then((dir) => (builder = new Builder(dir)));
    });
  });

  afterEach(() => {
    fs.removeSync(directory);
  });

  describe('when Cargo.toml exists', () => {
    beforeEach(() => {
      fs.writeFileSync(directory + 'Cargo.toml', fs.readFileSync(`${__dirname}/Cargo.toml`));
      atom.config.set('build-cargo.cargoPath', '/this/is/just/a/dummy/path/cargo');
    });

    it('should be eligible', () => {
      expect(builder.isEligible(directory)).toBe(true);
    });

    it('should yield available targets', () => {
      waitsForPromise(() => {
        return Promise.resolve(builder.settings(directory)).then((settings) => {
          expect(settings.length).toBe(12); // change this when you change the default settings

          const defaultTarget = settings[0]; // default MUST be first
          expect(defaultTarget.name).toBe('Cargo: build (debug)');
          expect(defaultTarget.exec).toBe('/this/is/just/a/dummy/path/cargo');
          expect(defaultTarget.argsCfg).toEqual([ 'build' ]);
          expect(defaultTarget.sh).toBe(false);

          const target = settings.find(setting => setting.name === 'Cargo: test');
          expect(target.name).toBe('Cargo: test');
          expect(target.exec).toBe('/this/is/just/a/dummy/path/cargo');
          expect(target.argsCfg).toEqual([ 'test' ]);
          expect(target.sh).toBe(false);
        });
      });
    });

    it('should not contain clippy in the set of commands if it is disabled', () => {
      atom.config.set('build-cargo.cargoClippy', false);
      waitsForPromise(() => {
        expect(builder.isEligible(directory)).toBe(true);
        return Promise.resolve(builder.settings(directory)).then((settings) => {
          settings.forEach(s => expect(s.name.toLowerCase().indexOf('clippy')).toEqual(-1));
        });
      });
    });
  });

  describe('when Cargo.toml does not exist', () => {
    it('should not be eligible', () => {
      expect(builder.isEligible(directory)).toBe(false);
    });
  });
});
