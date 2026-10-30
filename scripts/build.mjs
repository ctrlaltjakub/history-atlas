import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await rm(new URL('dist/',root),{recursive:true,force:true});
await mkdir(new URL('dist/',root),{recursive:true});
await cp(new URL('public/',root),new URL('dist/',root),{recursive:true});
const catalogue=JSON.parse(await readFile(new URL('dist/data/catalogue.json',root),'utf8'));
await writeFile(new URL('dist/robots.txt',root),'User-agent: *\nAllow: /\n');
console.log(`Built static atlas: ${catalogue.episodes.length} episodes. No credentials or research files included.`);
