const fs = require('fs');
const s = fs.readFileSync(
  'C:/Users/BAPS/.cursor/projects/c-Budtech-cureka/agent-tools/63bed09d-efc4-4734-bf85-e9d651bf750b.txt',
  'utf8',
);
const marker = '"url":"< >/get-user"';
let i = 0;
let n = 0;
while ((i = s.indexOf(marker, i)) !== -1 && n < 2) {
  console.log('\n===== hit', n, '=====');
  console.log(s.slice(Math.max(0, i - 1200), i + 2200));
  i += marker.length;
  n += 1;
}
