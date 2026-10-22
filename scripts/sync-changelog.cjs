const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8');
fs.writeFileSync(path.join(root,'app/src/main/assets/changelog.js'),
  'window.CG_CHANGELOG='+JSON.stringify(source)+';\n','utf8');
