import { spawn } from 'cross-spawn';
import { copy, writeFile } from 'fs-extra';
import { join } from 'path';
import { keys as tsKeys } from 'ts-transformer-keys';
import * as esbuild from "esbuild";

interface OverrideOptions {
  exportName?: string;
  zoneWrap?: boolean;
  blockUntilFirst?: boolean;
  override?: boolean;
}

function zoneWrapExports() {
  const reexport = async (
    module: string,
    name: string,
    path: string,
    exports: string[],
    overrides: Record<string, OverrideOptions | null> = {}
  ) => {
    const imported = await import(path);
    const toBeExported: [string, string, boolean][] = exports.sort().
      filter(it => !it.startsWith('_') && overrides[it] !== null && overrides[it]?.override !== true).
      map(importName => {
        const zoneWrap = typeof imported[importName] === 'function' &&
          // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
          (overrides[importName]?.zoneWrap ?? importName[0] !== importName[0].toUpperCase());
        const exportName = overrides[importName]?.exportName ?? importName;
        return [importName, exportName, zoneWrap];
      });
    const zoneWrapped = toBeExported.filter(([, , zoneWrap]) => zoneWrap);
    const rawExport = toBeExported.filter(([, , zoneWrap]) => !zoneWrap);
    const overridden = Object.keys(overrides).filter(key => overrides[key]?.override);
    const isFirebaseSDK = path.startsWith('firebase/');
    const hasZoneWrappedFns = zoneWrapped.length > 0;
    const hasRawExportedFns = rawExport.length > 0;
    const hasOverridedFns = overridden.length > 0;
    const zoneWrappedImports = zoneWrapped.map(([importName]) => `${importName} as _${importName}`).join(',\n  ');
    const rawExportedFns = rawExport.map(([importName, exportName]) =>
      `${importName}${exportName === importName ? '' : `as ${exportName}`}`).join(',\n  ');
    const overriddenFns = overridden.join(',\n  ');
    const exportedZoneWrappedFns = zoneWrapped.map(([importName, exportName]) =>
      `export const ${exportName} = ɵzoneWrap(_${importName}, ${overrides[importName]?.blockUntilFirst ?? true});`)
        .join('\n');
    const filePath = join(process.cwd(), 'src', `${module}/${name}.ts`);
    // TODO(davideast): Create a builder pattern for this file for readability
    const fileOutput = `// DO NOT MODIFY, this file is autogenerated by tools/build.ts
${isFirebaseSDK ? `export * from '${path}';\n` : ''}${hasZoneWrappedFns ? `import { ɵzoneWrap } from '@angular/fire';
import {
  ${zoneWrappedImports}
} from '${path}';
` : ''}${!isFirebaseSDK && hasRawExportedFns ? `
export {
  ${rawExportedFns}
} from '${path}';
` : ''}${hasOverridedFns ? `
export {
  ${overriddenFns}
} from './overrides';
` : ''}
${exportedZoneWrappedFns}
`;
    await writeFile(filePath, fileOutput);
  };
  return Promise.all([
    reexport('analytics', 'firebase', 'firebase/analytics', tsKeys<typeof import('firebase/analytics')>()),
    reexport('app', 'firebase', 'firebase/app', tsKeys<typeof import('firebase/app')>()),
    reexport('app-check', 'firebase', 'firebase/app-check', tsKeys<typeof import('firebase/app-check')>()),
    reexport('auth', 'rxfire', 'rxfire/auth', tsKeys<typeof import('rxfire/auth')>()),
    reexport('auth', 'firebase', 'firebase/auth', tsKeys<typeof import('firebase/auth')>(), {
      debugErrorMap: null,
      inMemoryPersistence: null,
      browserLocalPersistence: null,
      browserSessionPersistence: null,
      indexedDBLocalPersistence: null,
      prodErrorMap: null,
    }),
    reexport('database', 'rxfire', 'rxfire/database', tsKeys<typeof import('rxfire/database')>()),
    reexport('database', 'firebase', 'firebase/database', tsKeys<typeof import('firebase/database')>()),
    reexport('data-connect', 'firebase', 'firebase/data-connect', tsKeys<typeof import('firebase/data-connect')>()),
    reexport('firestore', 'rxfire', 'rxfire/firestore', tsKeys<typeof import('rxfire/firestore')>(), {
      doc: { exportName: 'docSnapshots' },
      collection: { exportName: 'collectionSnapshots' },
    }),
    reexport('firestore', 'firebase', 'firebase/firestore', tsKeys<typeof import('firebase/firestore')>()),
    reexport('functions', 'rxfire', 'rxfire/functions', ["httpsCallable"], {
      httpsCallable: { exportName: 'httpsCallableData' },
    }),
    reexport('functions', 'firebase', 'firebase/functions', tsKeys<typeof import('firebase/functions')>()),
    reexport('messaging', 'firebase', 'firebase/messaging', tsKeys<typeof import('firebase/messaging')>(), {
      isSupported: { blockUntilFirst: false },
      onMessage: { blockUntilFirst: false }
    }),
    reexport('remote-config', 'rxfire', 'rxfire/remote-config', tsKeys<typeof import('rxfire/remote-config')>(), {
      getValue: { exportName: 'getValueChanges' },
      getString: { exportName: 'getStringChanges' },
      getNumber: { exportName: 'getNumberChanges' },
      getBoolean: { exportName: 'getBooleanChanges' },
      getAll: { exportName: 'getAllChanges' },
    }),
    reexport('remote-config', 'firebase', 'firebase/remote-config', tsKeys<typeof import('firebase/remote-config')>()),
    reexport('storage', 'rxfire', 'rxfire/storage', tsKeys<typeof import('rxfire/storage')>(), {
      getDownloadURL: null,
      getMetadata: null,
      uploadBytesResumable: null,
      uploadString: null,
    }),
    reexport('storage', 'firebase', 'firebase/storage', tsKeys<typeof import('firebase/storage')>()),
    reexport('performance', 'rxfire', 'rxfire/performance', tsKeys<typeof import('rxfire/performance')>(), {
      getPerformance$: null,
      trace: null,
    }),
    reexport('performance', 'firebase', 'firebase/performance', tsKeys<typeof import('firebase/performance')>()),
    reexport('firestore/lite', 'rxfire', 'rxfire/firestore/lite', tsKeys<typeof import('rxfire/firestore/lite')>(), {
      doc: { exportName: 'docSnapshots' },
      collection: { exportName: 'collectionSnapshots' },
    }),
    reexport('firestore/lite', 'firebase', 'firebase/firestore/lite', tsKeys<typeof import('firebase/firestore/lite')>()),
    reexport('vertexai', 'firebase', 'firebase/vertexai', tsKeys<typeof import('firebase/vertexai')>()),
  ]);
}

const src = (...args: string[]) => join(process.cwd(), 'src', ...args);
const dest = (...args: string[]) => join(process.cwd(), 'dist', 'packages-dist', ...args);

const rootPackage = import(join(process.cwd(), 'package.json'));

async function replacePackageCoreVersion() {
  const root = await rootPackage;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const replace = require('replace-in-file');
  const files = dest('package.json');
  return replace({
    files,
    from: 'ANGULARFIRE2_VERSION',
    to: root.version
  });
}

async function replaceSchematicVersions() {
  const root = await rootPackage;
  const packagesPath = dest('schematics', 'versions.json');
  const dependencies = await import(packagesPath);
  Object.keys(dependencies.peerDependencies).forEach(name => {
    dependencies.peerDependencies[name].version = root.dependencies[name] || root.devDependencies[name];
  });
  Object.keys(dependencies.firebaseFunctionsDependencies).forEach(name => {
    dependencies.firebaseFunctionsDependencies[name].version = root.dependencies[name] || root.devDependencies[name];
  });
  return writeFile(packagesPath, JSON.stringify(dependencies, null, 2));
}

function spawnPromise(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => spawn(command, args, { stdio: 'inherit' }).on('close', code => {
    if (code === 0) {
      resolve()
    } else {
      reject('Build failed.');
    }
  })
  .on('error', reject));
}

async function compileSchematics() {
  await esbuild.build({
    entryPoints: [
      src('schematics', "update", "index.ts"),
      src('schematics', "deploy", "actions.ts"),
      src('schematics', "deploy", "builder.ts"),
      src('schematics', "add", "index.ts"),
      src('schematics', "setup", "index.ts"),
      src('schematics', "update", "v7", "index.ts"),
    ],
    format: "cjs",
    // turns out schematics don't support ESM, need to use webpack or shim these
    // format: "esm",
    // splitting: true,
    // outExtension: {".js": ".mjs"},
    bundle: true,
    minify: true,
    platform: "node",
    target: "es2016",
    external: [
      "@angular-devkit/schematics",
      "@angular-devkit/architect",
      "@angular-devkit/core",
      "rxjs",
      "@schematics/angular",
      "jsonc-parser",
      "firebase-tools"
    ],
    outdir: dest('schematics'),
  });
  await Promise.all([
    copy(src('schematics', 'versions.json'), dest('schematics', 'versions.json')),
    copy(src('schematics', 'builders.json'), dest('schematics', 'builders.json')),
    copy(src('schematics', 'collection.json'), dest('schematics', 'collection.json')),
    copy(src('schematics', 'migration.json'), dest('schematics', 'migration.json')),
    copy(src('schematics', 'deploy', 'schema.json'), dest('schematics', 'deploy', 'schema.json')),
    copy(src('schematics', 'add', 'schema.json'), dest('schematics', 'add', 'schema.json')),
    copy(src('schematics', 'setup', 'schema.json'), dest('schematics', 'setup', 'schema.json')),
  ]);
  await replaceSchematicVersions();
}

async function buildLibrary() {
  await zoneWrapExports();
  await spawnPromise('npx', ['ng', 'build']);
  await Promise.all([
    copy(join(process.cwd(), '.npmignore'), dest('.npmignore')),
    copy(join(process.cwd(), 'README.md'), dest('README.md')),
    copy(join(process.cwd(), 'docs'), dest('docs')),
    compileSchematics(),
    replacePackageCoreVersion(),
  ]);
}

buildLibrary().catch(err => {
  console.error(err);
  process.exit(1);
})
