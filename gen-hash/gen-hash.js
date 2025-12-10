// gen-hash.js
const bcrypt = require('bcrypt');

(async () => {
  const plain = '123456';
  const saltRounds = 10;

  const hash = await bcrypt.hash(plain, saltRounds);
  console.log('hash for 123456:', hash);
})();
