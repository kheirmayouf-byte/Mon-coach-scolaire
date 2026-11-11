import {build} from 'esbuild';
import {readdir} from 'node:fs/promises';
const root='vendor/siwc/src/';
await build({entryPoints:(await readdir(root)).filter(f=>f.endsWith('.ts')).map(f=>root+f),outdir:'vendor/siwc/dist',platform:'node',format:'esm',target:'node24'});
