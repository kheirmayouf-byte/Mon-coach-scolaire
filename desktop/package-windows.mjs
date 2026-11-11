import {packager} from '@electron/packager';
import {copyFile} from 'node:fs/promises';
const paths=await packager({dir:'.',out:'release',name:'Mon Coach Scolaire',executableName:'Mon Coach Scolaire',platform:'win32',arch:'x64',asar:true,overwrite:true,prune:true,ignore:[/^\/release($|\/)/,/^\/tests($|\/)/,/^\/vendor($|\/)/,/^\/main\.mjs$/,/^\/package-windows\.mjs$/,/^\/build.*\.mjs$/],appCopyright:'Mon Coach Scolaire — usage familial'});
for(const path of paths)await copyFile('LISEZ-MOI.txt',path+'/LISEZ-MOI.txt');
