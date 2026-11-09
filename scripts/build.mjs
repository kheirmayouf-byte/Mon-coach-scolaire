import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['src/app.js'],bundle:true,minify:true,outfile:'app.js',target:'es2022',format:'iife'});
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs','pdf.worker.min.mjs');
