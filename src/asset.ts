import TypeScriptAsset = require('parcel-bundler/src/assets/TypeScriptAsset.js');
import JSAsset = require('parcel-bundler/src/assets/JSAsset.js');
import * as path from 'path';

const IMPORT_RE = /\b(?:import(?:.|[\n\r])+?|export(?:.|[\n\r])+?|require.+?)\(?['"](.*)['"]\)?/g;

class TypeScriptModuledResolveAsset extends TypeScriptAsset {
  public contents: string;
  public dependencies: Map<any, any>;
  public relativeName: string;
  public name: string;
  public options: any;
  public async pretransform() {
    this.contents = await this.fixImports(this.contents);

    return super.pretransform();
  }

  public getRelativeIncludePath(
    newPath: string,
    includePath: string,
    key: string
  ) {
    const relativePath = path
      .relative(
        path.resolve(this.name, '..'),
        `${this.options.rootDir}/${newPath}`
      )
      .replace(/\\/g, '/');

    const targetFile =
      includePath.length === key.length
        ? ''
        : `/${includePath.substring(key.length)}`;

    return `./${relativePath}${targetFile}`.replace(/\/{2,}/g, '/');
  }

  private async getConfig(filenames: string[], { path: searchPath }: { path?: string } = {}) {
    const [primaryFile] = filenames;
    const [fileName, ...pathParts] = primaryFile.split('/').reverse();

    const maybeNextSearchPath = path.resolve(path.dirname(this.name), pathParts.join('/'));
    if (typeof searchPath !== 'string' || maybeNextSearchPath.split('/').length < searchPath.split('/').length ) {
      searchPath = maybeNextSearchPath;
    }

    const { compilerOptions, extends: _extends, ...config } = await super.getConfig([fileName], { path: searchPath });

    let extendedConfig;
    if (_extends) {
      const [extendingFileName, ...extendsPathParts] = _extends.split('/').reverse();
      const extendedSearchPath = path.resolve(searchPath, extendsPathParts.join('/'));
      extendedConfig = await this.getConfig([extendingFileName], { path: extendedSearchPath });
    } else {
      extendedConfig = { compilerOptions: {} };
    }

    const { compilerOptions: extendingCompilerOptions, ...extendingConfig } = extendedConfig;

    return {
      compilerOptions: {
        ...extendingCompilerOptions,
        ...compilerOptions,
      },
      ...extendingConfig,
      ...config,
    };
  }

  public async fixImports(code: string) {
    const tsconfig = await this.getConfig(['tsconfig.json']);
    console.log(tsconfig);
    const paths: { [key: string]: string[] } = tsconfig.compilerOptions.paths;
    if (typeof paths === 'undefined' || paths === null) {
      return;
    }
    const pairs = Object.keys(paths).map((key) => {
      const newKey = key.replace('/*', '/');
      return { [newKey]: paths[key][0].replace('/*', '') };
    });

    const newPaths: { [key: string]: string } = Object.assign({}, ...pairs);

    code = code.replace(IMPORT_RE, (substr: string, includePath: string) => {
      for (const key in newPaths) {
        if (
          includePath.startsWith(key) &&
          includePath.indexOf('/') > 0 ===
            (key.substring(key.length - 1) === '/')
        ) {
          substr = substr.replace(
            includePath,
            this.getRelativeIncludePath(newPaths[key], includePath, key)
          );

          return substr;
        }
      }

      return substr;
    });

    return code;
  }
}

export = TypeScriptModuledResolveAsset;
