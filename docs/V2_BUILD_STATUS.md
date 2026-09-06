# Brauzio v2 Build Status

**Status:** FAIL

The clean extension build failed. Last build output:

```text
=== install ===
Scope: all 4 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +810
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 810, reused 0, downloaded 139, added 139
Progress: resolved 810, reused 0, downloaded 391, added 390
Progress: resolved 810, reused 0, downloaded 682, added 680
Progress: resolved 810, reused 0, downloaded 777, added 775
Progress: resolved 810, reused 0, downloaded 810, added 809
Progress: resolved 810, reused 0, downloaded 810, added 810
Progress: resolved 810, reused 0, downloaded 810, added 810, done

devDependencies:
+ @commitlint/cli 19.8.1
+ @commitlint/config-conventional 19.8.1
+ @eslint/js 9.39.2
+ @typescript-eslint/eslint-plugin 8.49.0
+ @typescript-eslint/parser 8.49.0
+ eslint 9.39.2
+ eslint-config-prettier 10.1.8
+ eslint-plugin-vue 10.6.2
+ globals 16.5.0
+ husky 9.1.7
+ lint-staged 15.5.2
+ prettier 3.7.4
+ typescript 5.9.3
+ typescript-eslint 8.49.0
+ vue-eslint-parser 10.2.0

Done in 9.4s
=== prepare ===

[log] [90mWXT[39m [90m[1m0.20.11[22m[39m
[dotenv@17.2.3] injecting env (0) from .env.production.chrome.local,.env.production.chrome,.env.chrome.local,.env.chrome,.env.production.local,.env.production,.env.local,.env -- tip: 🛠️  run anywhere with `dotenvx run -- yourcommand`
[warn] `InlineConfig#runner` is deprecated, use `InlineConfig#webExt` instead. See https://wxt.dev/guide/resources/upgrading.html#v0-19-0-rarr-v0-20-0
[info] Generating types...
[success] Finished in 417 ms
=== shared ===

> brauzio-shared@1.0.1 build /home/runner/work/Brauzio/Brauzio/packages/shared
> tsup src/index.ts --format cjs,esm --dts --clean

[34mCLI[39m Building entry: src/index.ts
[34mCLI[39m Using tsconfig: tsconfig.json
[34mCLI[39m tsup v8.5.1
[34mCLI[39m Target: es2020
[34mCLI[39m Cleaning output folder
[34mCJS[39m Build start
[34mESM[39m Build start
[32mCJS[39m [1mdist/index.js [22m[32m47.37 KB[39m
[32mCJS[39m ⚡️ Build success in 19ms
[32mESM[39m [1mdist/index.mjs [22m[32m46.21 KB[39m
[32mESM[39m ⚡️ Build success in 19ms
[34mDTS[39m Build start
[32mDTS[39m ⚡️ Build success in 867ms
[32mDTS[39m [1mdist/index.d.ts  [22m[32m5.31 KB[39m
[32mDTS[39m [1mdist/index.d.mts [22m[32m5.31 KB[39m
=== cloud check ===

> brauzio-cloud-mcp@0.1.0 check /home/runner/work/Brauzio/Brauzio/app/cloudflare-mcp
> tsc --noEmit

=== extension build ===

> brauzio-extension@1.0.0 build /home/runner/work/Brauzio/Brauzio/app/chrome-extension
> wxt build


[log] [90mWXT[39m [90m[1m0.20.11[22m[39m
[dotenv@17.2.3] injecting env (0) from .env.production.chrome.local,.env.production.chrome,.env.chrome.local,.env.chrome,.env.production.local,.env.production,.env.local,.env -- tip: 🔑 add access controls to secrets: https://dotenvx.com/ops
[warn] `InlineConfig#runner` is deprecated, use `InlineConfig#webExt` instead. See https://wxt.dev/guide/resources/upgrading.html#v0-19-0-rarr-v0-20-0
[info] Building [36mchrome-mv3[39m for [36mproduction[39m with [32mVite 7.2.7[39m
- Preparing...
[31m✗[39m Build failed in 354ms
[error] [31m[vite:load-fallback] Could not load /home/runner/work/Brauzio/Brauzio/app/chrome-extension/utils/indexeddb-client (imported by entrypoints/background/element-marker/element-marker-storage.ts): ENOENT: no such file or directory, open '/home/runner/work/Brauzio/Brauzio/app/chrome-extension/utils/indexeddb-client'[39m
  at open (node:internal/fs/promises:639:25)
  at Object.readFile (node:internal/fs/promises:1252:14)
  at Object.handler (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/vite@7.2.7_@types+node@18.19.130/node_modules/vite/dist/node/chunks/config.js:33168:21)
  at PluginDriver.hookFirstAndGetPlugin (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/rollup@4.53.3/node_modules/rollup/dist/es/shared/node-entry.js:22333:28)
  at /home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/rollup@4.53.3/node_modules/rollup/dist/es/shared/node-entry.js:21333:33
  at Queue.work (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/rollup@4.53.3/node_modules/rollup/dist/es/shared/node-entry.js:22561:32)
[fail] Command failed after 710 ms
[error] Failed to build background
  at buildEntrypoints (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/core/utils/building/build-entrypoints.mjs:19:13)
  at rebuild (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/core/utils/building/rebuild.mjs:15:21)
  at internalBuild (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/core/utils/building/internal-build.mjs:43:32)
  at build (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/core/build.mjs:5:10)
  at /home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/cli/commands.mjs:43:5
  at CAC.<anonymous> (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/cli/cli-utils.mjs:17:22)
  at /home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/wxt@0.20.11_@types+node@18.19.130/node_modules/wxt/dist/cli/index.mjs:10:1

  [cause]: [31m[vite:load-fallback] Could not load /home/runner/work/Brauzio/Brauzio/app/chrome-extension/utils/indexeddb-client (imported by entrypoints/background/element-marker/element-marker-storage.ts): ENOENT: no such file or directory, open '/home/runner/work/Brauzio/Brauzio/app/chrome-extension/utils/indexeddb-client'[39m
    at open (node:internal/fs/promises:639:25)
    at Object.readFile (node:internal/fs/promises:1252:14)
    at Object.handler (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/vite@7.2.7_@types+node@18.19.130/node_modules/vite/dist/node/chunks/config.js:33168:21)
    at PluginDriver.hookFirstAndGetPlugin (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/rollup@4.53.3/node_modules/rollup/dist/es/shared/node-entry.js:22333:28)
    at /home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/rollup@4.53.3/node_modules/rollup/dist/es/shared/node-entry.js:21333:33
    at Queue.work (/home/runner/work/Brauzio/Brauzio/node_modules/.pnpm/rollup@4.53.3/node_modules/rollup/dist/es/shared/node-entry.js:22561:32)
/home/runner/work/Brauzio/Brauzio/app/chrome-extension:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  brauzio-extension@1.0.0 build: `wxt build`
Exit status 1
```
