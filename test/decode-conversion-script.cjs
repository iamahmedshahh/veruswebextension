const bs58 = require('bs58');

const scriptHex = '1a040300010114d8ad044d8ec9e0267fe379b3e8e33add89634c28cc3...';
const script = Buffer.from(scriptHex, 'hex');

console.log('Script bytes:', script);

// Helper to print a buffer as an i-address (if possible)
function hash160ToAddress(hash160, prefix = 0x3c) {
  const buf = Buffer.alloc(25);
  buf[0] = prefix;
  hash160.copy(buf, 1);
  const checksum = require('crypto').createHash('sha256').update(
    require('crypto').createHash('sha256').update(buf.slice(0, 21)).digest()
  ).digest();
  checksum.copy(buf, 21, 0, 4);
  return bs58.encode(buf);
}

// Manually decode fields (you may need to adjust offsets based on your script structure)
let offset = 0;
console.log('OP code:', script.slice(offset, offset+1).toString('hex')); offset += 1;
console.log('Version:', script.slice(offset, offset+1).toString('hex')); offset += 1;
console.log('Flags:', script.slice(offset, offset+1).toString('hex')); offset += 1;
console.log('Num outputs:', script.slice(offset, offset+1).toString('hex')); offset += 1;
console.log('Output index:', script.slice(offset, offset+1).toString('hex')); offset += 1;

// Next 20 bytes: currencyId
const currencyId = script.slice(offset, offset+20); offset += 20;
console.log('Currency ID (hash160):', currencyId.toString('hex'), 'as address:', hash160ToAddress(currencyId));

// Next 4 bytes: ?? (flags or extra data?)
// Next 20 bytes: viaCurrencyId
const viaCurrencyId = script.slice(offset+4, offset+24);
console.log('Via Currency ID (hash160):', viaCurrencyId.toString('hex'), 'as address:', hash160ToAddress(viaCurrencyId));

// Next 20 bytes: recipient address (should be yours)
const recipient = script.slice(offset+24, offset+44);
console.log('Recipient address (hash160):', recipient.toString('hex'), 'as address:', hash160ToAddress(recipient));

// Print any remaining bytes
console.log('Remaining script:', script.slice(offset+44).toString('hex'));