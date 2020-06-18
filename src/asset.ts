import TypeScriptAsset = require('parcel-bundler/src/assets/TypeScriptAsset.js');
import config = require('parcel-bundler/src/utils/config.js');
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
      .relative(path.dirname(this.name), newPath)
      .replace(/\\/g, '/');

    const targetFile =
      includePath.length === key.length
        ? ''
        : `/${includePath.substring(key.length)}`;

    return `./${relativePath}${targetFile}`.replace(/\/{2,}/g, '/');
  }

  private async getConfig(filenames: string[], { path: searchPath = path.dirname(this.name) }: { path?: string } = {}) {
    const [primaryFile] = filenames;
    const fileName = path.basename(primaryFile);

    const configPath = await config.resolve(searchPath, [fileName]);
    const configFile = path.basename(configPath);
    const configDirectory = path.dirname(configPath);

    const { compilerOptions, extends: _extends, ...cfg } = await super.getConfig([configFile], { path: configPath });

    const {
      compilerOptions: extendingCompilerOptions,
      ...extendingConfig
    } = await ((isExtending) => {
      if (isExtending) {
        const fileName = path.basename(isExtending);
        return this.getConfig([fileName], { path: path.resolve(configDirectory, isExtending) });
      } else {
        return { compilerOptions: {} };
      }
    })(_extends);

    let baseUrl = compilerOptions.baseUrl || extendingCompilerOptions.baseUrl || '.';
    baseUrl = path.isAbsolute(baseUrl) ? baseUrl : path.resolve(configDirectory, baseUrl);

    return {
      compilerOptions: {
        ...extendingCompilerOptions,
        ...compilerOptions,
        baseUrl,
      },
      ...extendingConfig,
      ...cfg,
    };
  }

  public async fixImports(code: string) {
    const tsconfig = await this.getConfig(['tsconfig.json']);

    const { baseUrl, paths }: { baseUrl: string, paths: { [key: string]: string[] } } = tsconfig.compilerOptions;

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
            this.getRelativeIncludePath(path.join(baseUrl, newPaths[key]), includePath, key)
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
