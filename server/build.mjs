import {build} from '../desktop/node_modules/esbuild/lib/main.js';
await build({entryPoints:[new URL('./main.mjs',import.meta.url).pathname],
  outfile:new URL('./build/relay.cjs',import.meta.url).pathname,
  platform:'node',format:'cjs',target:'node24',bundle:true});
